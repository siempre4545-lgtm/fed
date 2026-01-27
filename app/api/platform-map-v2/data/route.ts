import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { createCacheStore } from "../../../../lib/platform-map-v2/cache";
import { ensureHistorySnapshot } from "../../../../lib/platform-map-v2/history/store";
import type { HistoryEntry } from "../../../../lib/platform-map-v2/history/types";
import { buildNotAReasons } from "../../../../lib/platform-map-v2/analysis/notAReason";
import { buildInstitutionSummary } from "../../../../lib/platform-map-v2/analysis/institutionSummary";
import { computeCapitalWarnings, type CapitalAlignment } from "../../../../lib/platform-map-v2/capital/score";
import { getRegionType } from "../../../../lib/platform-map-v2/capital/signals";
import { loadCapitalHoldings, buildHoldingsIndex } from "../../../../lib/platform-map-v2/capital/holdings";
import { buildCapitalComparison } from "../../../../lib/platform-map-v2/capital/compare";
import {
  computePlatformMapRatings,
  type PlatformMapDebugInfo,
  type RawRating,
} from "../../../../lib/platform-map-v2/news/compute";
import type { AxisArticleMap, AxisKey, PlatformMapRating } from "../../../../lib/platform-map-v2/types";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const CACHE_VERSION = "platform-map-v2:v4";
const CACHE_TTL_SECONDS = 1800;

const GEOJSON_PATH = path.join(process.cwd(), "data/platform-map/korea_sigungu.geojson");
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

const buildReasons = (debug: PlatformMapDebugInfo, cacheHit: boolean) => {
  const reasons = new Set<PlatformMapDebugInfo["scoringStatus"]["reason"][number]>();
  if (debug.newsStats.regionsWithNews <= 5) {
    reasons.add("뉴스_매칭_없음");
  }
  if (debug.newsStats.regionsWithNews > 5 && debug.scoreStats.uniqueScoreCount <= 1) {
    reasons.add("점수계산_미실행");
  }
  if (cacheHit && debug.scoreStats.uniqueScoreCount <= 1) {
    reasons.add("캐시_기본값");
  }
  if (reasons.size === 0) {
    reasons.add("기타");
  }
  return Array.from(reasons);
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sigungu = searchParams.get("sigungu")?.trim();
  const sigunguKey = searchParams.get("sigunguKey")?.trim();
  const debug = searchParams.get("debug") === "1";
  console.info(LOG_PREFIX, "data request", { sigungu, sigunguKey, debug });

  const ratingsRaw = await readFile(RATINGS_PATH, "utf-8");
  const rawRatings = JSON.parse(ratingsRaw) as RawRating[];
  const updatedAt =
    rawRatings
      .map((item) => item.updatedAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || new Date().toISOString();

  const dateKey = new Date().toISOString().slice(0, 10);
  const cacheKey = `${CACHE_VERSION}:ratings:${dateKey}`;
  let cacheHit = false;
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
      updatedAt,
    };
    await cacheStore.set(cacheKey, cached, CACHE_TTL_SECONDS);

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
  } else {
    cacheHit = true;
  }

  const ratings = cached.ratings;
  const meta = { updatedAt: cached.updatedAt, source: "local", relativeGrade: cached.relativeGradeApplied };

  if (sigungu || sigunguKey) {
    const target =
      ratings.find((item) => item.sigunguKey === sigunguKey) ??
      ratings.find((item) => item.name === sigungu) ??
      ratings.find((item) => item.name.includes(sigungu || ""));
    const analysis =
      target && cached
        ? buildNotAReasons({
            target,
            ratings,
            axisArticleCounts: cached.regionAxisCounts,
          })
        : null;
    const articlesByAxis = target ? cached.regionAxisArticles[target.sigunguKey] : undefined;
    const capital = target ? cached.regionCapital[target.sigunguKey] : undefined;
    const warnings = target ? computeCapitalWarnings(target.totalScore, target.capitalAlignmentScore) : [];
    const institutionSummary =
      target && capital
        ? buildInstitutionSummary({
            alignment: capital,
            regionType: getRegionType(target.name, target.sigunguKey),
          })
        : undefined;
    const holdings = await loadCapitalHoldings();
    const holdingsIndex = buildHoldingsIndex(holdings, ratings);
    const comparison =
      target && capital
        ? buildCapitalComparison({
            rating: target,
            alignment: capital,
            holdings: holdingsIndex.bySigunguKey[target.sigunguKey] ?? [],
          })
        : undefined;
    const response = NextResponse.json(
      {
        ok: true,
        rating: target ?? null,
        meta,
        analysis,
        ...(articlesByAxis ? { articlesByAxis } : {}),
        ...(capital
          ? {
              capital: {
                score: capital.score,
                band: capital.bandLabel,
                stage: capital.stage,
                warnings,
              },
            }
          : {}),
        ...(institutionSummary ? { institutionSummary } : {}),
        ...(comparison ? { capitalComparison: comparison } : {}),
      },
      { status: 200 },
    );
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return response;
  }

  const payload: {
    ok: true;
    geojson: any;
    ratings: PlatformMapRating[];
    meta: typeof meta;
    debug?: PlatformMapDebugInfo;
  } = {
    ok: true,
    geojson: null,
    ratings,
    meta,
  };

  if (debug) {
    const debugInfo: PlatformMapDebugInfo = {
      ...cached.debug,
      scoringStatus: {
        ...cached.debug.scoringStatus,
        reason: buildReasons(cached.debug, cacheHit),
      },
    };
    payload.debug = debugInfo;
  }

  if (!sigungu && !sigunguKey) {
    const geoRaw = await readFile(GEOJSON_PATH, "utf-8");
    payload.geojson = JSON.parse(geoRaw);
  }

  const response = NextResponse.json(payload, { status: 200 });
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return response;
}
