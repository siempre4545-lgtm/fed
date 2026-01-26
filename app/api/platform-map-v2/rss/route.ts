import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { createHash } from "crypto";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { createCacheStore } from "../../../../lib/platform-map-v2/cache";
import { classifyText, getReliabilityFromUrl, getScoreHint } from "../../../../lib/platform-map-v2/classify";
import { buildRegionContext, matchRegionHints } from "../../../../lib/platform-map-v2/region/match";
import { dedupe } from "../../../../lib/platform-map-v2/rss/dedupe";
import { RSS_SOURCES } from "../../../../lib/platform-map-v2/rss/sources";
import { AXIS_DEFINITIONS, type AxisEvidencePack, type AxisKey, type EvidenceItem } from "../../../../lib/platform-map-v2/types";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";

const parser = new Parser();
const cacheStore = createCacheStore();
const MAX_ITEMS_PER_SOURCE = 80;

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
  const debug = searchParams.get("debug") === "1";
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 90) : 30;

  if (!sigungu) {
    console.warn(LOG_PREFIX, "rss missing sigungu");
    return NextResponse.json({ ok: false, error: "sigungu is required" }, { status: 400 });
  }

  const cacheKey = `pmv2:rss:${sigungu}:${days}`;
  if (!debug) {
    const cached = await cacheStore.get<{
      ok: boolean;
      sigungu: string;
      days: number;
      packs: AxisEvidencePack[];
      warnings: string[];
    }>(cacheKey);
    if (cached) {
      console.info(LOG_PREFIX, "rss cache hit", { sigungu, days });
      const response = NextResponse.json(cached);
      response.headers.set("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
      return response;
    }
  }

  console.info(LOG_PREFIX, "rss fetch start", { sigungu, days, debug });
  const regionContext = buildRegionContext(sigungu, aliases);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const axisReasonMap: Record<AxisKey, Set<string>> = AXIS_DEFINITIONS.reduce(
    (acc, axis) => ({ ...acc, [axis.key]: new Set<string>() }),
    {} as Record<AxisKey, Set<string>>,
  );
  const fetches: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
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
        const items = (feed.items ?? []).slice(0, MAX_ITEMS_PER_SOURCE);
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
          const regionMatches = matchRegionHints(textForClassify, regionContext);
          if (regionMatches.length === 0) continue;

          const { axes, axisReasons, sentiment } = classifyText(textForClassify);
          if (axes.length === 0) continue;

          axes.forEach((axis) => {
            const reasons = axisReasons[axis] ?? [];
            reasons.forEach((reason) => axisReasonMap[axis].add(reason));
          });

          collected.push({
            id: createEvidenceId(`${link}-${publishedAt}`),
            title,
            source: source.title || feed.title || "RSS",
            publishedAt,
            url: link,
            snippet,
            axes,
            regionHints: regionMatches,
            reliability: source.reliability ?? getReliabilityFromUrl(link),
            sentiment,
          });
          added += 1;
        }

        fetches.push({
          sourceId: source.id,
          sourceTitle: source.title,
          status: "ok",
          elapsedMs: Date.now() - start,
          items: added,
        });
      } catch (error) {
        warnings.push(source.id);
        fetches.push({
          sourceId: source.id,
          sourceTitle: source.title,
          status: "error",
          elapsedMs: Date.now() - start,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }),
  );

  const deduped = dedupe(collected).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const packs: AxisEvidencePack[] = AXIS_DEFINITIONS.map((axis) => {
    const items = deduped.filter((item) => item.axes.includes(axis.key)).slice(0, 10);
    const reasonList = Array.from(axisReasonMap[axis.key]);
    return {
      axis: axis.key,
      items,
      scoreHint: getScoreHint(items),
      reason: reasonList.length > 0 ? `키워드: ${reasonList.slice(0, 6).join(", ")}` : "키워드 매칭 없음",
    };
  });

  const payload = {
    ok: true,
    sigungu,
    days,
    packs,
    warnings,
    ...(debug ? { fetches } : {}),
  };

  console.info(LOG_PREFIX, "rss fetch done", {
    sigungu,
    days,
    items: deduped.length,
    warnings: warnings.length,
  });
  await cacheStore.set(cacheKey, payload, 1800);

  const response = NextResponse.json(payload);
  response.headers.set("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
  return response;
}
