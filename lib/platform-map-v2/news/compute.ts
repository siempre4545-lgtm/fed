import Parser from "rss-parser";
import { createHash } from "crypto";
import type { AxisKey, AxisScore, PlatformMapGrade, PlatformMapRating, AxisArticle, AxisArticleMap } from "../types";
import { AXIS_DEFINITIONS } from "../types";
import { getReliabilityFromUrl } from "../classify";
import { RSS_SOURCES } from "../rss/sources";
import { dedupeNewsItems } from "./dedupe";
import { classifyArticle, mapAxesNumberToKeys } from "./classify";
import {
  buildRegionContexts,
  getContextDebugTokens,
  matchRegionNormalized,
  normalizeText,
  type RegionAliasMap,
} from "./match";
import { calcAxisScores, type ArticleScoreInput, type AxisScoreCalc } from "../scoring/calc";
import { assignGrades } from "../scoring/grade";
import { extractCapitalSignal, getRegionType, type CapitalSignal } from "../capital/signals";
import { computeCapitalAlignment } from "../capital/score";

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
  regionAxisCounts: Record<string, Record<AxisKey, number>>;
  regionAxisArticles: Record<string, AxisArticleMap>;
  regionCapital: Record<string, ReturnType<typeof computeCapitalAlignment>>;
};

type NewsItem = {
  title: string;
  url: string;
  publishedAt: string;
  snippet: string;
  source: string;
  reliability: "A" | "B" | "C";
};

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

const createAxisRecord = <T,>(value: () => T) =>
  AXIS_DEFINITIONS.reduce(
    (acc, axis) => ({
      ...acc,
      [axis.key]: value(),
    }),
    {} as Record<AxisKey, T>,
  );

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
  const regionArticleIds = new Map<string, Set<string>>();
  const regionAxisInputs = new Map<string, Record<AxisKey, ArticleScoreInput[]>>();
  const regionAxisArticles = new Map<string, AxisArticleMap>();
  const regionCapitalSignals = new Map<string, CapitalSignal[]>();

  regionContexts.forEach((context) => {
    regionArticleIds.set(context.sigunguKey, new Set<string>());
    regionAxisInputs.set(
      context.sigunguKey,
      createAxisRecord(() => [] as ArticleScoreInput[]),
    );
    regionAxisArticles.set(
      context.sigunguKey,
      createAxisRecord(() => [] as AxisArticle[]),
    );
    regionCapitalSignals.set(context.sigunguKey, []);
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
  const { unique: deduped } = dedupeNewsItems(collected);

  let totalItemsUsed = 0;
  deduped.forEach((item) => {
    const text = `${item.title} ${item.snippet}`;
    const normalizedText = normalizeText(text);
    const classification = classifyArticle(text);
    const axes = mapAxesNumberToKeys(classification.matched_axes);
    if (axes.length === 0) return;
    const matched = regionContexts.filter((context) => matchRegionNormalized(normalizedText, context));
    if (matched.length === 0) return;

    const articleId = createHash("sha1")
      .update(`${item.title}-${item.publishedAt}-${item.url}`)
      .digest("hex")
      .slice(0, 12);
    totalItemsUsed += 1;
    const capitalSignal = extractCapitalSignal(text, item.reliability);

    matched.forEach((context) => {
      const ids = regionArticleIds.get(context.sigunguKey);
      const axisInputs = regionAxisInputs.get(context.sigunguKey);
      const axisArticles = regionAxisArticles.get(context.sigunguKey);
      const capitalSignals = regionCapitalSignals.get(context.sigunguKey);
      if (!ids || !axisInputs || !axisArticles) return;
      ids.add(articleId);
      if (capitalSignal && capitalSignals) {
        capitalSignals.push(capitalSignal);
      }
      axes.forEach((axis) => {
        axisInputs[axis].push({ axis, reliability: item.reliability });
        if (axisArticles[axis].length < 10) {
          axisArticles[axis].push({
            id: articleId,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            source: item.source,
            reliability: item.reliability,
            axes,
          });
        }
      });
    });
  });

  const regionAxisCounts: Record<string, Record<AxisKey, number>> = {};
  const regionAxisArticlesPayload: Record<string, AxisArticleMap> = {};
  const regionCapital: Record<string, ReturnType<typeof computeCapitalAlignment>> = {};

  const regionAxisCalc = new Map<string, Record<AxisKey, AxisScoreCalc>>();
  const ratings: PlatformMapRating[] = rawRatings.map((rating) => {
    const axisInputs = regionAxisInputs.get(rating.sigunguCode) ?? createAxisRecord(() => []);
    const axisCalc = calcAxisScores(axisInputs);
    regionAxisCalc.set(rating.sigunguCode, axisCalc);
    const axisScores: AxisScore[] = AXIS_DEFINITIONS.map((axis) => {
      const legacyKey = AXIS_MAP[axis.key];
      const base = normalizeAxisScore(rating.axes?.[legacyKey]);
      const calc = axisCalc[axis.key];
      const score = Math.min(10, Math.round((base + calc.score) * 10) / 10);
      return {
        key: axis.key,
        label: axis.label,
        score,
      };
    });
    const totalScore = Math.round(axisScores.reduce((sum, axis) => sum + axis.score, 0) * 10) / 10;
    const top3Axes = [...axisScores].sort((a, b) => b.score - a.score).slice(0, 3);

    regionAxisCounts[rating.sigunguCode] = AXIS_DEFINITIONS.reduce(
      (acc, axis) => ({
        ...acc,
        [axis.key]: axisCalc[axis.key]?.articleCount ?? 0,
      }),
      {} as Record<AxisKey, number>,
    );
    regionAxisArticlesPayload[rating.sigunguCode] =
      regionAxisArticles.get(rating.sigunguCode) ?? createAxisRecord(() => [] as AxisArticle[]);
    const capitalSignals = regionCapitalSignals.get(rating.sigunguCode) ?? [];
    const alignment = computeCapitalAlignment(
      capitalSignals,
      getRegionType(rating.sigunguName, rating.sigunguCode),
    );
    regionCapital[rating.sigunguCode] = alignment;

    return {
      name: rating.sigunguName,
      sigunguKey: rating.sigunguCode,
      grade: "C",
      totalScore,
      axisScores,
      top3Axes,
      capitalAlignmentScore: alignment.score,
      capitalAlignmentBand: alignment.bandLabel,
      capitalStage: alignment.stage,
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
    const values = ratings.map(
      (rating) => Number(rating.axisScores.find((item) => item.key === axis.key)?.score ?? 0),
    );
    acc[axis.key] = {
      min: Math.min(...values),
      max: Math.max(...values),
      uniqueCount: new Set(values.map((value) => Number(value.toFixed(1)))).size,
    };
    return acc;
  }, {} as PlatformMapAxisStats);

  const regionsWithNews = Array.from(regionArticleIds.values()).filter((set) => set.size > 0).length;
  const totalNewsItems = Array.from(regionArticleIds.values()).reduce((sum, set) => sum + set.size, 0);
  const noNewsContexts = regionContexts.filter(
    (context) => (regionArticleIds.get(context.sigunguKey)?.size ?? 0) === 0,
  );

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

  const samples = Array.from(regionArticleIds.entries())
    .map(([sigunguKey, set]) => ({
      sigunguKey,
      name: rawRatings.find((item) => item.sigunguCode === sigunguKey)?.sigunguName ?? sigunguKey,
      articleCount: set.size,
    }))
    .filter((item) => item.articleCount > 0)
    .sort((a, b) => b.articleCount - a.articleCount)
    .slice(0, 3)
    .map((item) => {
      const rating = ratings.find((entry) => entry.sigunguKey === item.sigunguKey);
      const axisCalc = regionAxisCalc.get(item.sigunguKey) ?? createAxisRecord(() => ({ score: 0, articleCount: 0, weightedTotal: 0 }));
      const baseScores = AXIS_DEFINITIONS.reduce((acc, axis) => {
        const raw = rawRatings.find((rawItem) => rawItem.sigunguCode === item.sigunguKey)?.axes?.[AXIS_MAP[axis.key]];
        return acc + normalizeAxisScore(raw);
      }, 0);
      const addedScores = AXIS_DEFINITIONS.reduce((acc, axis) => acc + (axisCalc[axis.key]?.weightedTotal ?? 0), 0);
      return {
        name: item.name,
        sigunguKey: item.sigunguKey,
        articles: item.articleCount,
        axisDelta: AXIS_DEFINITIONS.reduce((acc, axis) => {
          const target = rating?.axisScores.find((entry) => entry.key === axis.key)?.score ?? 0;
          const raw = rawRatings.find((rawItem) => rawItem.sigunguCode === item.sigunguKey)?.axes?.[AXIS_MAP[axis.key]];
          const base = normalizeAxisScore(raw);
          const delta = Math.round((target - base) * 10) / 10;
          if (delta !== 0) acc[axis.key] = delta;
          return acc;
        }, {} as Partial<Record<AxisKey, number>>),
        totalBeforeClamp: Math.round((baseScores + addedScores) * 10) / 10,
        totalAfterClamp: rating?.totalScore ?? 0,
      };
    });

  const newsRegionKeys = ratings
    .filter((rating) => (regionArticleIds.get(rating.sigunguKey)?.size ?? 0) > 0)
    .map((rating) => rating.sigunguKey);

  const gradeMap =
    newsRegionKeys.length >= 10
      ? assignGrades(
          newsRegionKeys.map((key) => ({
            key,
            score:
              (ratings.find((item) => item.sigunguKey === key)?.totalScore ?? 0) +
              ((regionCapital[key]?.score ?? 0) * 0.05),
          })),
          { minRelativeCount: 10, allowRelative: true },
        )
      : null;

  ratings.forEach((rating) => {
    const hasNews = (regionArticleIds.get(rating.sigunguKey)?.size ?? 0) > 0;
    if (!hasNews) {
      rating.grade = "C";
      return;
    }
    if (gradeMap) {
      rating.grade = gradeMap.grades[rating.sigunguKey] ?? "C";
    } else {
      rating.grade = "C";
    }
  });

  const relativeGradeApplied = Boolean(gradeMap?.relativeApplied);
  const gradeCounts = computeGradeCounts(ratings);

  const scoringApplied = regionsWithNews > 0;
  const fallbackUsed = regionsWithNews === 0;

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
    regionAxisCounts,
    regionAxisArticles: regionAxisArticlesPayload,
    regionCapital,
  };
};
