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

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const CACHE_VERSION = "platform-map-v2:v5";
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

  const gradeDistribution = cached.ratings.reduce(
    (acc, rating) => {
      acc[rating.grade] = (acc[rating.grade] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const nonDefaultRegionsCount = cached.ratings.filter((rating) => rating.totalScore > 0).length;
  const seoulScoredCount = cached.ratings.filter(
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
      ratingsCount: cached.ratings.length,
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
