import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { createCacheStore } from "../../../../lib/platform-map-v2/cache";
import {
  ensureHistorySnapshot,
  ensureWeeklySnapshot,
  loadHistoryWindow,
} from "../../../../lib/platform-map-v2/history/store";
import type { HistoryEntry } from "../../../../lib/platform-map-v2/history/types";
import { buildNotAReasons } from "../../../../lib/platform-map-v2/analysis/notAReason";
import { buildInstitutionSummary } from "../../../../lib/platform-map-v2/analysis/institutionSummary";
import { computeCapitalWarnings, type CapitalAlignment } from "../../../../lib/platform-map-v2/capital/score";
import { getRegionType } from "../../../../lib/platform-map-v2/capital/signals";
import { loadCapitalHoldings, buildHoldingsIndex } from "../../../../lib/platform-map-v2/capital/holdings";
import { buildCapitalComparison } from "../../../../lib/platform-map-v2/capital/compare";
import { loadFactLayer } from "../../../../lib/platform-map-v2/facts";
import { computePisMap, computeScoreDeltaMap } from "../../../../lib/platform-map-v2/pis/compute";
import {
  buildStructuralAxis,
  composeRatingScores,
  sumAxisValues,
} from "../../../../lib/platform-map-v2/scoring/compose";
import { assignGrades } from "../../../../lib/platform-map-v2/scoring/grade";
import {
  computePlatformMapRatings,
  type PlatformMapDebugInfo,
  type RawRating,
} from "../../../../lib/platform-map-v2/news/compute";
import {
  AXIS_DEFINITIONS,
  type AxisArticleMap,
  type AxisKey,
  type PlatformMapRating,
} from "../../../../lib/platform-map-v2/types";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const CACHE_VERSION = "platform-map-v2:v6";
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

const buildSigunguList = (geojson: any) => {
  const features: any[] = geojson?.features ?? [];
  return features
    .map((feature) => {
      const key = String(feature.properties?.code || feature.properties?.SIG_CD || "");
      const name = String(feature.properties?.name || feature.properties?.SIG_KOR_NM || "");
      if (!key || !name) return null;
      return { sigunguKey: key, name };
    })
    .filter(Boolean) as Array<{ sigunguKey: string; name: string }>;
};

const buildPlaceholderRating = (name: string, sigunguKey: string): PlatformMapRating => ({
  name,
  sigunguKey,
  grade: "D",
  gradeLabel: "산정중",
  scoreStatus: "산정중",
  scoreComponents: {
    structural: { score: null, status: "not_observed" },
    holdings: { score: null, status: "not_observed" },
    rss: { score: null, status: "not_observed" },
  },
  scoreDelta: 0,
  totalScore: 0,
  axisScores: AXIS_DEFINITIONS.map((axis) => ({ key: axis.key, label: axis.label, score: 0 })),
  top3Axes: AXIS_DEFINITIONS.slice(0, 3).map((axis) => ({ key: axis.key, label: axis.label, score: 0 })),
  capitalAlignmentScore: 0,
  capitalAlignmentBand: "자본 흐름 없음",
  capitalStage: 0,
});

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
  const factLayer = await loadFactLayer();
  const factEntries = factLayer.entries ?? [];
  const factEntryMap = new Map<string, (typeof factEntries)[number]>();
  factEntries.forEach((entry) => {
    factEntryMap.set(entry.sigungu, entry);
    if (entry.sigunguKey) factEntryMap.set(`key:${entry.sigunguKey}`, entry);
  });
  const holdings = await loadCapitalHoldings();

  const mergeTags = (base: string[] | undefined, next: string[] | undefined) => {
    const set = new Set<string>();
    (base ?? []).forEach((tag) => set.add(tag));
    (next ?? []).forEach((tag) => set.add(tag));
    return Array.from(set);
  };

  const composeRatings = (
    ratingsSource: PlatformMapRating[],
    axisCounts: Record<string, Record<AxisKey, number>>,
  ) => {
    const holdingsIndex = buildHoldingsIndex(holdings, ratingsSource);
    const structuralTotals = ratingsSource.map((rating) => {
      const factEntry = factEntryMap.get(`key:${rating.sigunguKey}`) ?? factEntryMap.get(rating.name);
      const structuralAxis = buildStructuralAxis(factEntry);
      return Math.round(sumAxisValues(structuralAxis) * 10) / 10;
    });
    const sorted = [...structuralTotals].sort((a, b) => b - a);
    const thresholdIndex = Math.max(0, Math.floor(sorted.length * 0.15) - 1);
    const structuralThreshold = sorted[thresholdIndex] ?? 0;

    return ratingsSource.map((rating, index) => {
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
        Object.values(axisCounts[rating.sigunguKey] ?? {}).reduce((sum, count) => sum + count, 0) > 0;

      const composed = composeRatingScores({
        rating,
        factEntry,
        holdings: holdingsList,
        rssObserved,
        holdingsEstimated,
      });
      const top3Axes = [...composed.axisScores].sort((a, b) => b.score - a.score).slice(0, 3);
      const tags = mergeTags(rating.tags, factEntry?.tags ?? []);
      return {
        ...rating,
        axisScores: composed.axisScores,
        totalScore: composed.totalScore,
        top3Axes,
        scoreComponents: composed.components,
        tags,
      };
    });
  };

  if (!cached) {
    const computed = await computePlatformMapRatings(rawRatings, aliases);
    const composedRatings = composeRatings(computed.ratings, computed.regionAxisCounts);
    cached = {
      ratings: composedRatings,
      debug: computed.debug,
      relativeGradeApplied: computed.relativeGradeApplied,
      regionAxisCounts: computed.regionAxisCounts,
      regionAxisArticles: computed.regionAxisArticles,
      regionCapital: computed.regionCapital,
      updatedAt,
    };
    await cacheStore.set(cacheKey, cached, CACHE_TTL_SECONDS);

    const historyEntries: HistoryEntry[] = composedRatings.map((rating) => ({
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
    await ensureWeeklySnapshot(dateKey, historyEntries);
  } else {
    cacheHit = true;
  }

  let ratings = cached.ratings;
  const gradeMap = assignGrades(
    ratings.map((rating) => ({ key: rating.sigunguKey, score: rating.totalScore })),
    { minRelativeCount: 150, allowRelative: true },
  );
  ratings = ratings.map((rating) => ({
    ...rating,
    grade: gradeMap.grades[rating.sigunguKey] ?? rating.grade,
  }));

  const historyWindow = await loadHistoryWindow(28);
  const pisMap = computePisMap(historyWindow, ratings);
  const scoreDeltaMap = computeScoreDeltaMap(historyWindow);
  const holdingsIndex = buildHoldingsIndex(holdings, ratings);

  ratings = ratings.map((rating) => {
    const pis = pisMap[rating.sigunguKey];
    const scoreDelta = scoreDeltaMap[rating.name] ?? 0;
    const isSaturated = rating.totalScore >= 85 && Math.abs(scoreDelta) <= 0.2;
    const gradeLabel =
      isSaturated && rating.totalScore >= 85
        ? rating.grade === "A"
          ? "A(Stable)"
          : "A-"
        : rating.grade;
    const hasEvidence = ["structural", "holdings", "rss"].some((key) => {
      const component = rating.scoreComponents?.[key as "structural" | "holdings" | "rss"];
      if (!component) return false;
      if (component.status === "not_observed") return false;
      return component.score !== null;
    });
    const scoreStatus = hasEvidence ? undefined : "데이터 부족";
    const factEntry = factEntryMap.get(`key:${rating.sigunguKey}`) ?? factEntryMap.get(rating.name);
    const reasons: string[] = [];
    if (factEntry) reasons.push("기정사실");
    if (pis?.status === "기관 선행 구간") reasons.push("PIS 상승");
    if ((holdingsIndex.bySigunguKey[rating.sigunguKey] ?? []).length > 0) reasons.push("공시 노출");
    const preInstitutionalMove = reasons.length >= 2;
    const tags = mergeTags(
      rating.tags,
      mergeTags(isSaturated ? ["포화 플랫폼 지역"] : undefined, preInstitutionalMove ? ["Pre-Institutional Move"] : undefined),
    );
    return {
      ...rating,
      pisScore: pis?.score ?? 0,
      pisStatus: pis?.status ?? "정체",
      pisDelta: pis?.delta ?? 0,
      gradeLabel,
      scoreStatus,
      scoreDelta,
      preInstitutionalMove,
      preInstitutionalReasons: reasons,
      tags,
    };
  });
  const meta = { updatedAt: cached.updatedAt, source: "local", relativeGrade: gradeMap.relativeApplied };

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
            axisArticles: cached.regionAxisArticles,
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

  let geojson: any = null;
  let sigunguList: Array<{ sigunguKey: string; name: string }> | undefined;
  let responseRatings = ratings;
  if (!sigungu && !sigunguKey) {
    const geoRaw = await readFile(GEOJSON_PATH, "utf-8");
    geojson = JSON.parse(geoRaw);
    sigunguList = buildSigunguList(geojson);
    if (sigunguList.length > 0) {
      const ratingMap = new Map(ratings.map((item) => [item.sigunguKey, item]));
      responseRatings = sigunguList.map((item) => ratingMap.get(item.sigunguKey) ?? buildPlaceholderRating(item.name, item.sigunguKey));
    }
  }

  const payload: {
    ok: true;
    geojson: any;
    ratings: PlatformMapRating[];
    sigunguList?: Array<{ sigunguKey: string; name: string }>;
    meta: typeof meta;
    debug?: PlatformMapDebugInfo;
  } = {
    ok: true,
    geojson,
    ratings: responseRatings,
    sigunguList,
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

  const response = NextResponse.json(payload, { status: 200 });
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return response;
}
