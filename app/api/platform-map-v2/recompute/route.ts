import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { createCacheStore } from "../../../../lib/platform-map-v2/cache";
import { ensureHistorySnapshot } from "../../../../lib/platform-map-v2/history/store";
import type { HistoryEntry } from "../../../../lib/platform-map-v2/history/types";
import {
  computePlatformMapRatings,
  type PlatformMapDebugInfo,
  type RawRating,
} from "../../../../lib/platform-map-v2/news/compute";
import type { AxisArticleMap, AxisKey, PlatformMapRating } from "../../../../lib/platform-map-v2/types";
import type { CapitalAlignment } from "../../../../lib/platform-map-v2/capital/score";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const CACHE_VERSION = "platform-map-v2:v4";
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

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";

  if (!force) {
    console.warn(LOG_PREFIX, "recompute rejected");
    return NextResponse.json({ ok: false, error: "force=1 required" }, { status: 400 });
  }

  const ratingsRaw = await readFile(RATINGS_PATH, "utf-8");
  const rawRatings = JSON.parse(ratingsRaw) as RawRating[];
  const updatedAt =
    rawRatings
      .map((item) => item.updatedAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || new Date().toISOString();

  const computed = await computePlatformMapRatings(rawRatings, aliases);
  const dateKey = new Date().toISOString().slice(0, 10);
  const cacheKey = `${CACHE_VERSION}:ratings:${dateKey}`;
  const payload: CachePayload = {
    ratings: computed.ratings,
    debug: computed.debug,
    relativeGradeApplied: computed.relativeGradeApplied,
    regionAxisCounts: computed.regionAxisCounts,
    regionAxisArticles: computed.regionAxisArticles,
    regionCapital: computed.regionCapital,
    updatedAt,
  };

  await cacheStore.set(cacheKey, payload, CACHE_TTL_SECONDS);
  const historyEntries: HistoryEntry[] = computed.ratings.map((rating) => ({
    sigungu: rating.name,
    date: dateKey,
    totalScore: rating.totalScore,
    axes: rating.axisScores.reduce(
      (acc, axis) => ({
        ...acc,
        [axis.key]: axis.score,
      }),
      {} as Record<AxisKey, number>,
    ),
  }));
  await ensureHistorySnapshot(dateKey, historyEntries);
  console.info(LOG_PREFIX, "recompute done", { cacheKey });

  return NextResponse.json({ ok: true, recomputedAt: new Date().toISOString() });
}
