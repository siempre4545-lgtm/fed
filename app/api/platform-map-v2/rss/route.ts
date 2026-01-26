import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { createHash } from "crypto";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import {
  buildRegionHints,
  classifyText,
  getReliabilityFromUrl,
  getScoreHint,
  matchRegionHints,
} from "../../../../lib/platform-map-v2/classify";
import { AXIS_DEFINITIONS, type AxisEvidencePack, type AxisKey, type EvidenceItem } from "../../../../lib/platform-map-v2/types";

export const runtime = "nodejs";

type RssSource = {
  id: string;
  name: string;
  url: string;
};

const RSS_SOURCES: RssSource[] = [
  { id: "kdi", name: "KDI 보도자료", url: "https://www.kdi.re.kr/kdi_news/press/rss" },
  { id: "molit", name: "국토교통부", url: "https://www.molit.go.kr/USR/NEWS/rss/m_71.xml" },
  { id: "kostat", name: "통계청", url: "https://www.kostat.go.kr/portal/korea/rss/press.xml" },
  { id: "yonhap-econ", name: "연합뉴스 경제", url: "https://www.yna.co.kr/rss/economy.xml" },
  { id: "yonhap-local", name: "연합뉴스 지역", url: "https://www.yna.co.kr/rss/region.xml" },
  { id: "hankyung-econ", name: "한국경제", url: "https://rss.hankyung.com/economy.xml" },
];

const parser = new Parser();

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const toIsoDate = (value: string | undefined | null) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const buildSnippet = (value: string, maxLength = 280) => {
  const cleaned = stripHtml(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3)}...`;
};

const createEvidenceId = (value: string) =>
  createHash("sha1").update(value).digest("hex").slice(0, 12);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sigungu = searchParams.get("sigungu")?.trim();
  const daysParam = Number(searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 90) : 30;

  if (!sigungu) {
    return NextResponse.json({ ok: false, error: "sigungu is required" }, { status: 400 });
  }

  const regionHints = buildRegionHints(sigungu, aliases);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const axisReasonMap: Record<AxisKey, Set<string>> = AXIS_DEFINITIONS.reduce(
    (acc, axis) => ({ ...acc, [axis.key]: new Set<string>() }),
    {} as Record<AxisKey, Set<string>>,
  );
  const logs: Array<Record<string, unknown>> = [];
  const collected: EvidenceItem[] = [];

  await Promise.all(
    RSS_SOURCES.map(async (source) => {
      const start = Date.now();
      try {
        const response = await fetchWithTimeout(source.url, 8000);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        const feed = await parser.parseString(text);
        const items = (feed.items ?? []).slice(0, 40);
        let added = 0;

        for (const item of items) {
          const title = item.title?.trim() ?? "제목 없음";
          const link = item.link || item.guid || source.url;
          const publishedAt = toIsoDate(item.isoDate || item.pubDate || item.published || item.date);
          if (new Date(publishedAt) < cutoff) continue;

          const snippetRaw =
            item.contentSnippet || item.content || item.summary || item.description || "";
          const snippet = buildSnippet(snippetRaw);
          const textForClassify = `${title} ${snippet}`;
          const regionMatches =
            regionHints.length === 0 ? [] : matchRegionHints(textForClassify, regionHints);

          if (regionHints.length > 0 && regionMatches.length === 0) {
            continue;
          }

          const { axes, axisReasons, sentiment } = classifyText(textForClassify);
          if (axes.length === 0) continue;

          axes.forEach((axis) => {
            const reasons = axisReasons[axis] ?? [];
            reasons.forEach((reason) => axisReasonMap[axis].add(reason));
          });

          collected.push({
            id: createEvidenceId(`${link}-${publishedAt}`),
            title,
            source: feed.title ?? source.name,
            publishedAt,
            url: link,
            snippet,
            axes,
            regionHints: regionMatches,
            reliability: getReliabilityFromUrl(link),
            sentiment,
          });
          added += 1;
        }

        logs.push({
          source: source.name,
          status: "ok",
          elapsedMs: Date.now() - start,
          items: added,
        });
      } catch (error) {
        logs.push({
          source: source.name,
          status: "error",
          elapsedMs: Date.now() - start,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }),
  );

  collected.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const packs: AxisEvidencePack[] = AXIS_DEFINITIONS.map((axis) => {
    const items = collected.filter((item) => item.axes.includes(axis.key)).slice(0, 10);
    const reasonList = Array.from(axisReasonMap[axis.key]);
    return {
      axis: axis.key,
      items,
      scoreHint: getScoreHint(items),
      reason: reasonList.length > 0 ? `키워드: ${reasonList.slice(0, 6).join(", ")}` : "키워드 매칭 없음",
    };
  });

  const response = NextResponse.json({
    ok: true,
    sigungu,
    days,
    packs,
    meta: { totalItems: collected.length, logs },
  });
  response.headers.set("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
  return response;
}
