import Parser from "rss-parser";
import type { AxisKey, AxisScore, PlatformMapGrade, PlatformMapRating } from "../types";
import { AXIS_DEFINITIONS } from "../types";
import { getGrade } from "../scoring";
import { classifyText, getReliabilityFromUrl } from "../classify";
import { RSS_SOURCES } from "../rss/sources";
import { dedupeByTitleDate } from "./dedupe";
import { buildRegionContexts, getContextDebugTokens, matchRegionNormalized, normalizeText, type RegionAliasMap } from "./match";

export type RawRating = {
  sigunguCode: string;
  sigunguName: string;
  grade?: string;
  score?: number;
  axes?: Record<string, number>;
  updatedAt?: string;
};

export type PlatformMapScoreStats = {
  minScore: number;
  maxScore: number;
  avgScore: number;
  uniqueScoreCount: number;
};

export type PlatformMapAxisStats = Record<AxisKey, { min: number; max: number; uniqueCount: number }>;

export type PlatformMapNewsStats = {
  regionsWithNews: number;
  totalItems: number;
  avgItemsPerRegion: number;
  noNewsRegions: string[];
  noNewsRegionSamples: Array<{ name: string; tokens: string[] }>;
};

export type PlatformMapScoringStatus = {
  scoringApplied: boolean;
  fallbackUsed: boolean;
  reason: Array<"뉴스_매칭_없음" | "점수계산_미실행" | "캐시_기본값" | "기타">;
};

export type PlatformMapSampleDebug = {
  name: string;
  sigunguKey: string;
  articles: number;
  axisDelta: Partial<Record<AxisKey, number>>;
  totalBeforeClamp: number;
  totalAfterClamp: number;
};

export type PlatformMapDebugInfo = {
  totalRegions: number;
  gradeCounts: Record<PlatformMapGrade, number>;
  scoreStats: PlatformMapScoreStats;
  axisStats: PlatformMapAxisStats;
  newsStats: PlatformMapNewsStats;
  scoringStatus: PlatformMapScoringStatus;
  samples: PlatformMapSampleDebug[];
};

export type PlatformMapComputeResult = {
  ratings: PlatformMapRating[];
  debug: PlatformMapDebugInfo;
  relativeGradeApplied: boolean;
};

type NewsItem = {
  title: string;
  url: string;
  publishedAt: string;
  snippet: string;
  source: string;
  reliability: "A" | "B" | "C";
};

type AxisStat = {
  pos: number;
  neg: number;
  items: number;
};

type RegionStat = {
  itemCount: number;
  axes: Record<AxisKey, AxisStat>;
};

const RELIABILITY_WEIGHT: Record<string, number> = { A: 1, B: 0.7, C: 0.4 };
const MAX_ITEMS_PER_SOURCE = 80;
const FETCH_TIMEOUT_MS = 6000;
const DAYS = 30;

const AXIS_MAP: Record<AxisKey, string> = {
  data_infra: "data_infra",
  residency_mobility: "residency_mobility",
  institutional_bid: "institutional_demand",
  financialization: "financialization",
  city_services: "city_services",
  subscription_profit: "subscription_housing",
  jobs_industry: "jobs_future",
  digital_payment_cbdc: "cbdc_payments",
  network_infra: "network_infra",
  governance: "governance",
  skilled_inflow: "talent_inflow",
  masterplan: "future_blueprint",
};

const normalizeAxisScore = (value: number | undefined) => {
  const raw = Number.isFinite(value) ? Number(value) : 50;
  const score = Math.max(0, Math.min(10, raw / 10));
  return Math.round(score * 10) / 10;
};

const clampAxisScore = (value: number) => Math.max(0, Math.min(10, value));

const clampTotalScore = (value: number) => Math.max(0, Math.min(100, value));

const createAxisStats = () =>
  AXIS_DEFINITIONS.reduce(
    (acc, axis) => ({
      ...acc,
      [axis.key]: { pos: 0, neg: 0, items: 0 },
    }),
    {} as Record<AxisKey, AxisStat>,
  );

const createRegionStat = (): RegionStat => ({
  itemCount: 0,
  axes: createAxisStats(),
});

const toIsoDate = (value: string | undefined | null) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const buildSnippet = (value: string, maxLength = 240) => {
  const cleaned = stripHtml(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3)}...`;
};

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const computeAxisDelta = (stat: AxisStat) => {
  if (stat.items === 0) return 0;
  const balance = stat.pos - stat.neg;
  if (balance >= 2.5 || (balance >= 1.6 && stat.items >= 6)) return 2;
  if (balance >= 0.8) return 1;
  if (balance <= -2.5 || (balance <= -1.6 && stat.items >= 6)) return -2;
  if (balance <= -0.8) return -1;
  return 0;
};

const computeGradeCounts = (ratings: PlatformMapRating[]) =>
  ratings.reduce(
    (acc, item) => {
      acc[item.grade] = (acc[item.grade] || 0) + 1;
      return acc;
    },
    { A: 0, B: 0, C: 0, D: 0 } as Record<PlatformMapGrade, number>,
  );

export const computePlatformMapRatings = async (
  rawRatings: RawRating[],
  aliases: RegionAliasMap,
): Promise<PlatformMapComputeResult> => {
  const regionContexts = buildRegionContexts(rawRatings, aliases);
  const regionStats = new Map<string, RegionStat>();
  regionContexts.forEach((context) => {
    regionStats.set(context.sigunguKey, createRegionStat());
  });

  const parser = new Parser();
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const collected: NewsItem[] = [];

  const queue = [...RSS_SOURCES];
  const concurrency = Math.min(3, queue.length || 1);
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const source = queue.shift();
      if (!source) return;
      try {
        const response = await fetchWithTimeout(source.url, FETCH_TIMEOUT_MS);
        if (!response.ok) {
          continue;
        }
        const text = await response.text();
        const feed = await parser.parseString(text);
        const items = (feed.items ?? []).slice(0, MAX_ITEMS_PER_SOURCE);
        items.forEach((item) => {
          const title = item.title?.trim() ?? "제목 없음";
          const link = item.link || item.guid || source.url;
          const publishedAt = toIsoDate(item.isoDate || item.pubDate || item.published || item.date);
          if (new Date(publishedAt) < cutoff) return;
          const snippetRaw = item.contentSnippet || item.content || item.summary || item.description || "";
          collected.push({
            title,
            url: link,
            publishedAt,
            snippet: buildSnippet(snippetRaw),
            source: source.title,
            reliability: source.reliability ?? getReliabilityFromUrl(link),
          });
        });
      } catch (error) {
        // ignore per-source errors
      }
    }
  });

  await Promise.all(workers);
  const deduped = dedupeByTitleDate(collected);

  let totalItemsUsed = 0;
  deduped.forEach((item) => {
    const text = `${item.title} ${item.snippet}`;
    const normalizedText = normalizeText(text);
    const { axes, sentiment } = classifyText(text);
    if (axes.length === 0) return;
    const matched = regionContexts.filter((context) => matchRegionNormalized(normalizedText, context));
    if (matched.length === 0) return;
    totalItemsUsed += 1;

    const weight = RELIABILITY_WEIGHT[item.reliability] ?? 0.4;
    matched.forEach((context) => {
      const stat = regionStats.get(context.sigunguKey);
      if (!stat) return;
      stat.itemCount += 1;
      axes.forEach((axis) => {
        const axisStat = stat.axes[axis];
        axisStat.items += 1;
        if (sentiment === "pos") axisStat.pos += weight;
        if (sentiment === "neg") axisStat.neg += weight;
      });
    });
  });

  const ratings: PlatformMapRating[] = rawRatings.map((rating) => {
    const regionStat = regionStats.get(rating.sigunguCode) ?? createRegionStat();
    const axisScores: AxisScore[] = AXIS_DEFINITIONS.map((axis) => {
      const legacyKey = AXIS_MAP[axis.key];
      const base = normalizeAxisScore(rating.axes?.[legacyKey]);
      const delta = computeAxisDelta(regionStat.axes[axis.key]);
      return {
        key: axis.key,
        label: axis.label,
        score: clampAxisScore(base + delta),
      };
    });
    const totalBeforeClamp = axisScores.reduce((sum, axis) => sum + axis.score, 0);
    const totalScore = clampTotalScore(totalBeforeClamp);
    const top3Axes = [...axisScores].sort((a, b) => b.score - a.score).slice(0, 3);
    return {
      name: rating.sigunguName,
      sigunguKey: rating.sigunguCode,
      grade: getGrade(totalScore),
      totalScore,
      axisScores,
      top3Axes,
    };
  });

  const scoreValues = ratings.map((item) => Number(item.totalScore.toFixed(1)));
  const scoreSum = scoreValues.reduce((sum, value) => sum + value, 0);
  const scoreStats: PlatformMapScoreStats = {
    minScore: Math.min(...scoreValues),
    maxScore: Math.max(...scoreValues),
    avgScore: scoreValues.length > 0 ? Math.round((scoreSum / scoreValues.length) * 10) / 10 : 0,
    uniqueScoreCount: new Set(scoreValues).size,
  };

  const axisStats = AXIS_DEFINITIONS.reduce((acc, axis) => {
    const values = ratings.map((rating) => Number(rating.axisScores.find((item) => item.key === axis.key)?.score ?? 0));
    acc[axis.key] = {
      min: Math.min(...values),
      max: Math.max(...values),
      uniqueCount: new Set(values.map((value) => Number(value.toFixed(1)))).size,
    };
    return acc;
  }, {} as PlatformMapAxisStats);

  const regionsWithNews = Array.from(regionStats.values()).filter((stat) => stat.itemCount > 0).length;
  const totalNewsItems = Array.from(regionStats.values()).reduce((sum, stat) => sum + stat.itemCount, 0);
  const noNewsContexts = regionContexts.filter((context) => (regionStats.get(context.sigunguKey)?.itemCount ?? 0) === 0);

  const newsStats: PlatformMapNewsStats = {
    regionsWithNews,
    totalItems: totalItemsUsed,
    avgItemsPerRegion: regionsWithNews > 0 ? Math.round((totalNewsItems / regionsWithNews) * 10) / 10 : 0,
    noNewsRegions: noNewsContexts.slice(0, 20).map((context) => context.name),
    noNewsRegionSamples: noNewsContexts.slice(0, 20).map((context) => ({
      name: context.name,
      tokens: getContextDebugTokens(context),
    })),
  };

  const samples = Array.from(regionStats.entries())
    .map(([sigunguKey, stat]) => ({
      sigunguKey,
      name: rawRatings.find((item) => item.sigunguCode === sigunguKey)?.sigunguName ?? sigunguKey,
      itemCount: stat.itemCount,
      axisDelta: AXIS_DEFINITIONS.reduce((acc, axis) => {
        const delta = computeAxisDelta(stat.axes[axis.key]);
        if (delta !== 0) acc[axis.key] = delta;
        return acc;
      }, {} as Partial<Record<AxisKey, number>>),
    }))
    .filter((item) => item.itemCount > 0)
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, 3)
    .map((item) => {
      const rating = ratings.find((entry) => entry.sigunguKey === item.sigunguKey);
      const totalBeforeClamp = rating ? rating.axisScores.reduce((sum, axis) => sum + axis.score, 0) : 0;
      const totalAfterClamp = rating ? rating.totalScore : 0;
      return {
        name: item.name,
        sigunguKey: item.sigunguKey,
        articles: item.itemCount,
        axisDelta: item.axisDelta,
        totalBeforeClamp,
        totalAfterClamp,
      };
    });

  const scoringApplied = regionsWithNews > 0;
  const fallbackUsed = regionsWithNews === 0;

  let relativeGradeApplied = false;
  if (regionsWithNews >= 8 && scoreStats.maxScore - scoreStats.minScore <= 4) {
    const newsRegions = ratings.filter((rating) => (regionStats.get(rating.sigunguKey)?.itemCount ?? 0) > 0);
    if (newsRegions.length >= 8) {
      const sorted = [...newsRegions].sort((a, b) => b.totalScore - a.totalScore);
      const total = sorted.length;
      const countA = Math.max(1, Math.round(total * 0.1));
      const countB = Math.max(1, Math.round(total * 0.2));
      const countD = Math.max(1, Math.round(total * 0.2));
      sorted.forEach((item, index) => {
        if (index < countA) item.grade = "A";
        else if (index < countA + countB) item.grade = "B";
        else if (index >= total - countD) item.grade = "D";
        else item.grade = "C";
      });
      relativeGradeApplied = true;
    }
  }

  const gradeCounts = computeGradeCounts(ratings);

  return {
    ratings,
    relativeGradeApplied,
    debug: {
      totalRegions: ratings.length,
      gradeCounts,
      scoreStats,
      axisStats,
      newsStats,
      scoringStatus: {
        scoringApplied,
        fallbackUsed,
        reason: [],
      },
      samples,
    },
  };
};
