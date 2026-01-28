import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { createCacheStore } from "../../../../lib/platform-map-v2/cache";
import { RSS_SOURCES } from "../../../../lib/platform-map-v2/rss/sources";
import {
  computePlatformMapRatings,
  type PlatformMapDebugInfo,
  type RawRating,
} from "../../../../lib/platform-map-v2/news/compute";
import type { AxisArticleMap, AxisKey, PlatformMapRating } from "../../../../lib/platform-map-v2/types";
import type { CapitalAlignment } from "../../../../lib/platform-map-v2/capital/score";
import { loadCapitalHoldings, buildHoldingsIndex } from "../../../../lib/platform-map-v2/capital/holdings";
import { loadFactLayer } from "../../../../lib/platform-map-v2/facts";
import {
  buildStructuralAxis,
  composeRatingScores,
  sumAxisValues,
} from "../../../../lib/platform-map-v2/scoring/compose";
import { assignGrades } from "../../../../lib/platform-map-v2/scoring/grade";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const CACHE_VERSION = "platform-map-v2:v7";
const CACHE_TTL_SECONDS = 1800;
const RATINGS_PATH = path.join(process.cwd(), "data/platform-map/ratings.json");
const GEOJSON_PATH = path.join(process.cwd(), "data/platform-map/korea_sigungu.geojson");
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

const hasKv = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const getMemoryKeysSample = () => {
  const globalAny = globalThis as typeof globalThis & { __pmv2_cache_store__?: Map<string, any> };
  const store = globalAny.__pmv2_cache_store__;
  if (!store) return [];
  return Array.from(store.keys()).slice(0, 5);
};

export async function GET() {
  const errors: string[] = [];
  let geojsonCount = 0;
  let seoulCount = 0;
  let sampleSeoulNames: string[] = [];

  try {
    const geoRaw = await readFile(GEOJSON_PATH, "utf-8");
    const geojson = JSON.parse(geoRaw);
    geojsonCount = Array.isArray(geojson?.features) ? geojson.features.length : 0;
    const seoulFeatures = (geojson?.features ?? []).filter((feature: any) => {
      const props = feature?.properties ?? {};
      const codeValue = String(props.code ?? props.SIG_CD ?? "");
      if (codeValue && codeValue.startsWith("11")) return true;
      const values = Object.values(props).filter((value) => typeof value === "string");
      const codeLike = values.find((value) => /^\d{5}$/.test(String(value)));
      if (codeLike && String(codeLike).startsWith("11")) return true;
      return values.some((value) => String(value).includes("서울"));
    });
    seoulCount = seoulFeatures.length;
    sampleSeoulNames = seoulFeatures
      .slice(0, 3)
      .map((feature: any) => {
        const props = feature?.properties ?? {};
        const values = Object.values(props).filter((value) => typeof value === "string");
        return (
          values.find((value) => String(value).includes("서울")) ??
          values.find((value) => String(value).includes("구")) ??
          values[0] ??
          ""
        );
      })
      .filter(Boolean) as string[];
  } catch (error) {
    errors.push("geojson_load_failed");
  }

  const ratingsRaw = await readFile(RATINGS_PATH, "utf-8");
  const rawRatings = JSON.parse(ratingsRaw) as RawRating[];
  if (seoulCount === 0) {
    const seoulRatings = rawRatings.filter((item) => item.sigunguName.startsWith("서울"));
    seoulCount = seoulRatings.length;
    sampleSeoulNames = seoulRatings.slice(0, 3).map((item) => item.sigunguName);
  }
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
  const factEntries = factLayer.entries ?? [];
  const factEntryMap = new Map<string, (typeof factEntries)[number]>();
  factEntries.forEach((entry) => {
    factEntryMap.set(entry.sigungu, entry);
    if (entry.sigunguKey) factEntryMap.set(`key:${entry.sigunguKey}`, entry);
  });
  const holdings = await loadCapitalHoldings();
  const holdingsIndex = buildHoldingsIndex(holdings, cached.ratings);
  const structuralTotals = cached.ratings.map((rating) => {
    const factEntry = factEntryMap.get(`key:${rating.sigunguKey}`) ?? factEntryMap.get(rating.name);
    const structuralAxis = buildStructuralAxis(factEntry);
    return Math.round(sumAxisValues(structuralAxis) * 10) / 10;
  });
  const sorted = [...structuralTotals].sort((a, b) => b - a);
  const thresholdIndex = Math.max(0, Math.floor(sorted.length * 0.15) - 1);
  const structuralThreshold = sorted[thresholdIndex] ?? 0;

  const composedRatings = cached.ratings.map((rating, index) => {
    if (rating.scoreComponents) return rating;
    const factEntry = factEntryMap.get(`key:${rating.sigunguKey}`) ?? factEntryMap.get(rating.name);
    const structuralTotal = structuralTotals[index] ?? 0;
    const axisFloors = factEntry?.axisFloors ?? {};
    const meetsAxisFloor =
      (axisFloors.financialization ?? 0) >= 5 &&
      (axisFloors.governance ?? 0) >= 5 &&
      (axisFloors.residency_mobility ?? 0) >= 4;
    const holdingsList = holdingsIndex.bySigunguKey[rating.sigunguKey] ?? [];
    const holdingsEstimated =
      holdingsList.length === 0 &&
      structuralTotal > 0 &&
      structuralTotal >= structuralThreshold &&
      meetsAxisFloor;
    const rssObserved =
      Object.values(cached.regionAxisCounts[rating.sigunguKey] ?? {}).reduce(
        (sum, count) => sum + count,
        0,
      ) > 0;

    const composed = composeRatingScores({
      rating,
      factEntry,
      holdings: holdingsList,
      rssObserved,
      holdingsEstimated,
    });
    const top3Axes = [...composed.axisScores].sort((a, b) => b.score - a.score).slice(0, 3);
    return {
      ...rating,
      axisScores: composed.axisScores,
      totalScore: composed.totalScore,
      top3Axes,
      scoreComponents: composed.components,
    };
  });

  const gradeMap = assignGrades(
    composedRatings.map((rating) => ({ key: rating.sigunguKey, score: rating.totalScore })),
    { minRelativeCount: 150, allowRelative: true },
  );
  const gradeDistribution = Object.values(gradeMap.grades).reduce(
    (acc, grade) => {
      acc[grade] = (acc[grade] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const nonDefaultRegionsCount = composedRatings.filter((rating) => rating.totalScore > 0).length;
  const seoulScoredCount = composedRatings.filter(
    (rating) => rating.name.startsWith("서울") && rating.totalScore > 0,
  ).length;
  if (geojsonCount > 0 && cached.ratings.length !== geojsonCount) {
    errors.push("geojson_rating_mismatch");
  }
  if (seoulCount < 25) {
    errors.push("seoul_count_low");
  }
  if (seoulCount > 0 && seoulScoredCount === 0) {
    errors.push("seoul_unscored");
  }

  const status = {
    ok: errors.length === 0,
    timestamp: new Date().toISOString(),
    build: {
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      vercelRegion: process.env.VERCEL_REGION,
      runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    },
    data: {
      sigunguCountGeojson: geojsonCount,
      sigunguCountMaster: rawRatings.length,
      ratingsCount: composedRatings.length,
      seoulCount,
      sampleSeoulNames,
      aliases: Object.keys(aliases).length,
    },
    rss: {
      sourcesCount: RSS_SOURCES.length,
      fetchedLast24h: cached.debug.newsStats.fetchedLast24h ?? 0,
      matchedArticlesLast24h: cached.debug.newsStats.matchedLast24h ?? 0,
      dedupedLast24h: cached.debug.newsStats.dedupedLast24h ?? 0,
    },
    scoring: {
      defaultScoreValue: 0,
      defaultAxisValue: 0,
      nonDefaultRegionsCount,
      gradeDistribution,
    },
    cache: {
      provider: hasKv() ? "kv" : "memory",
      hitRate: null,
      keysSample: hasKv() ? [] : getMemoryKeysSample(),
    },
    errors,
  };

  console.info(LOG_PREFIX, "health", status);
  return NextResponse.json(status);
}
