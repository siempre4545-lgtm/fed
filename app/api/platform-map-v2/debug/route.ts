import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { createCacheStore } from "../../../../lib/platform-map-v2/cache";
import { applyFactLayer, loadFactLayer } from "../../../../lib/platform-map-v2/facts";
import {
  computePlatformMapRatings,
  type PlatformMapDebugInfo,
  type RawRating,
} from "../../../../lib/platform-map-v2/news/compute";
import type { AxisArticleMap, AxisKey, PlatformMapRating } from "../../../../lib/platform-map-v2/types";
import type { CapitalAlignment } from "../../../../lib/platform-map-v2/capital/score";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const CACHE_VERSION = "platform-map-v2:v5";
const CACHE_TTL_SECONDS = 1800;
const RATINGS_PATH = path.join(process.cwd(), "data/platform-map/ratings.json");
const cacheStore = createCacheStore();

type CachePayload = {
  ratings: PlatformMapRating[];
  debug: PlatformMapDebugInfo;
  relativeGradeApplied: boolean;
  regionAxisCounts: Record<string, Record<AxisKey, number>>;
  regionAxisArticles: Record<string, AxisArticleMap>;
  regionCapital: Record<string, CapitalAlignment>;
  updatedAt: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sigungu = searchParams.get("sigungu")?.trim();
  if (!sigungu) {
    return NextResponse.json({ ok: false, error: "sigungu required" }, { status: 400 });
  }

  const ratingsRaw = await readFile(RATINGS_PATH, "utf-8");
  const rawRatings = JSON.parse(ratingsRaw) as RawRating[];
  const dateKey = new Date().toISOString().slice(0, 10);
  const cacheKey = `${CACHE_VERSION}:ratings:${dateKey}`;
  let cached = await cacheStore.get<CachePayload>(cacheKey);
  if (!cached) {
    const computed = await computePlatformMapRatings(rawRatings, aliases);
    cached = {
      ratings: computed.ratings,
      debug: computed.debug,
      relativeGradeApplied: computed.relativeGradeApplied,
      regionAxisCounts: computed.regionAxisCounts,
      regionAxisArticles: computed.regionAxisArticles,
      regionCapital: computed.regionCapital,
      updatedAt: new Date().toISOString(),
    };
    await cacheStore.set(cacheKey, cached, CACHE_TTL_SECONDS);
  }

  const factLayer = await loadFactLayer();
  const ratings = applyFactLayer(cached.ratings, factLayer.entries ?? []);
  const target =
    ratings.find((item) => item.sigunguKey === sigungu) ??
    ratings.find((item) => item.name === sigungu) ??
    ratings.find((item) => item.name.includes(sigungu));

  if (!target) {
    return NextResponse.json({ ok: false, error: "sigungu not found" }, { status: 404 });
  }

  const axisArticles = cached.regionAxisArticles[target.sigunguKey] ?? {};
  const rssMatchesMap = new Map<
    string,
    { title: string; url: string; publishedAt: string; source: string; matchedAxes: AxisKey[]; confidence: number; dedupKey?: string }
  >();
  Object.values(axisArticles).forEach((articles) => {
    articles.forEach((article) => {
      const existing = rssMatchesMap.get(article.id);
      const confidence = article.confidence ?? 0.6;
      if (existing) {
        existing.matchedAxes = Array.from(new Set([...existing.matchedAxes, ...article.axes]));
        existing.confidence = Math.max(existing.confidence, confidence);
        return;
      }
      rssMatchesMap.set(article.id, {
        title: article.title,
        url: article.url,
        publishedAt: article.publishedAt,
        source: article.source,
        matchedAxes: article.axes,
        confidence,
        dedupKey: article.dedupKey,
      });
    });
  });

  const factEntry =
    (factLayer.entries ?? []).find((entry) => entry.sigunguKey === target.sigunguKey) ??
    (factLayer.entries ?? []).find((entry) => entry.sigungu === target.name);
  const reasons: string[] = [];
  if (rssMatchesMap.size === 0) reasons.push("뉴스_매칭_없음");
  if (factEntry) reasons.push("기정사실_레이어");
  if (target.preInstitutionalMove) reasons.push("Pre-Institutional Move");

  const aliasMap = aliases as Record<string, string[]>;
  const payload = {
    ok: true,
    sigungu: target.name,
    matchedAliases: aliasMap[target.name] ?? [],
    factMatches: factEntry
      ? { axes: factEntry.axisFloors, tags: factEntry.tags ?? [], sources: factEntry.sources ?? [] }
      : null,
    rssMatches: Array.from(rssMatchesMap.values()),
    axisScores: target.axisScores,
    totalScore: target.totalScore,
    grade: target.grade,
    reasons,
  };

  console.info(LOG_PREFIX, "debug", { sigungu: target.name, rssMatches: rssMatchesMap.size });
  return NextResponse.json(payload);
}
