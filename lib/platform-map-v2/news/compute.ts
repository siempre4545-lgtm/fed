import Parser from "rss-parser";
import { createHash } from "crypto";
import type { AxisKey, AxisScore, PlatformMapGrade, PlatformMapRating, AxisArticle, AxisArticleMap } from "../types";
import { AXIS_DEFINITIONS } from "../types";
import { getReliabilityFromUrl } from "../classify";
import { RSS_SOURCES } from "../rss/sources";
import { dedupeNewsItems } from "./dedupe";
import { classifyArticle } from "./classify";
import {
  buildRegionContexts,
  getContextDebugTokens,
  matchRegionNormalizedDetailed,
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
  fetchedLast24h: number;
  dedupedLast24h: number;
  matchedLast24h: number;
  duplicates: number;
  sidoOnlyMatches: number;
  keywordFiltered: number;
};

export type PlatformMapScoringStatus = {
  scoringApplied: boolean;
  fallbackUsed: boolean;
  reason: Array<
    | "뉴스_매칭_없음"
    | "점수계산_미실행"
    | "캐시_기본값"
    | "기타"
    | "점수분산_없음"
    | "최근기사_매칭_0"
  >;
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
  category: "gov" | "thinktank" | "media" | "local" | "industry";
};

const MAX_ITEMS_PER_SOURCE = 80;
const FETCH_TIMEOUT_MS = 6000;
const DAYS = 30;

const SOURCE_WEIGHT: Record<NewsItem["category"], number> = {
  gov: 0.9,
  thinktank: 0.9,
  local: 0.7,
  media: 0.6,
  industry: 0.6,
};

const CATEGORY_KEYWORDS = [
  "플랫폼",
  "금융",
  "리츠",
  "btr",
  "pf",
  "부동산",
  "정책",
  "특구",
  "규제",
  "지구",
  "지정",
  "착공",
  "개발",
  "산업단지",
  "업무지구",
  "도시계획",
];

const CORE_REGION_KEYWORDS = [
  "개발",
  "지구",
  "특구",
  "산업단지",
  "업무지구",
  "도시계획",
  "금융",
  "리츠",
  "btr",
  "기업",
  "거점",
  "센터",
];

const buildKeywordMatcher = (keywords: string[]) => {
  const tokens = keywords.map((keyword) => normalizeText(keyword)).filter(Boolean);
  return (normalizedText: string) => tokens.some((token) => normalizedText.includes(token));
};

const hasCategoryKeyword = buildKeywordMatcher(CATEGORY_KEYWORDS);
const hasCoreRegionKeyword = buildKeywordMatcher(CORE_REGION_KEYWORDS);

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
            category: source.category,
          });
        });
      } catch (error) {
        // ignore per-source errors
      }
    }
  });

  await Promise.all(workers);
  const { unique: deduped, duplicates } = dedupeNewsItems(collected);
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const fetchedLast24h = collected.filter((item) => new Date(item.publishedAt).getTime() >= last24h).length;
  const dedupedLast24h = deduped.filter((item) => new Date(item.publishedAt).getTime() >= last24h).length;

  let totalItemsUsed = 0;
  let matchedArticlesLast24h = 0;
  let sidoOnlyMatches = 0;
  let keywordFiltered = 0;

  deduped.forEach((item) => {
    const text = `${item.title} ${item.snippet}`;
    const normalizedText = normalizeText(text);
    const classification = classifyArticle(text);
    const axes = classification.matchedAxes;
    if (axes.length === 0) return;
    if (!hasCategoryKeyword(normalizedText)) {
      keywordFiltered += 1;
      return;
    }

    const matches = regionContexts
      .map((context) => ({
        context,
        result: matchRegionNormalizedDetailed(normalizedText, context),
      }))
      .filter((entry) => entry.result.matched);
    const sigunguMatches = matches.filter((entry) => entry.result.level === "sigungu");
    const sidoMatches = matches.filter((entry) => entry.result.level === "sido");
    const coreMatch = hasCoreRegionKeyword(normalizedText);
    const finalMatches = sigunguMatches.length > 0 ? sigunguMatches : coreMatch ? sidoMatches : [];
    if (finalMatches.length === 0) {
      if (sidoMatches.length > 0) {
        sidoOnlyMatches += 1;
      }
      return;
    }

    const articleId = createHash("sha1")
      .update(`${item.title}-${item.publishedAt}-${item.url}`)
      .digest("hex")
      .slice(0, 12);
    totalItemsUsed += 1;
    const isRecent = new Date(item.publishedAt).getTime() >= last24h;
    if (isRecent) matchedArticlesLast24h += 1;
    const capitalSignal = extractCapitalSignal(text, item.reliability);
    const sourceWeight = SOURCE_WEIGHT[item.category] ?? 0.6;
    const sourceType =
      item.category === "gov" || item.category === "thinktank"
        ? "public"
        : item.category === "local"
        ? "local"
        : "media";

    finalMatches.forEach(({ context, result }) => {
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
        const confidence = classification.confidenceByAxis[axis] ?? 0.6;
        axisInputs[axis].push({
          axis,
          confidence,
          weight: sourceWeight,
          sourceType,
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          dedupKey: item.dedupKey,
        });
        if (axisArticles[axis].length < 10) {
          axisArticles[axis].push({
            id: articleId,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            source: item.source,
            reliability: item.reliability,
            axes,
            confidence,
            dedupKey: item.dedupKey,
            sourceWeight,
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
      const calc = axisCalc[axis.key];
      const score = Math.round((calc?.score ?? 0) * 10) / 10;
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
      grade: "D",
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
    fetchedLast24h,
    dedupedLast24h,
    matchedLast24h: matchedArticlesLast24h,
    duplicates: duplicates.length,
    sidoOnlyMatches,
    keywordFiltered,
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
      const axisCalc = regionAxisCalc.get(item.sigunguKey) ?? createAxisRecord(() => ({ score: 0, articleCount: 0, itemsUsed: [] }));
      const addedScores = AXIS_DEFINITIONS.reduce((acc, axis) => acc + (axisCalc[axis.key]?.score ?? 0), 0);
      return {
        name: item.name,
        sigunguKey: item.sigunguKey,
        articles: item.articleCount,
        axisDelta: AXIS_DEFINITIONS.reduce((acc, axis) => {
          const target = rating?.axisScores.find((entry) => entry.key === axis.key)?.score ?? 0;
          if (target > 0) acc[axis.key] = target;
          return acc;
        }, {} as Partial<Record<AxisKey, number>>),
        totalBeforeClamp: Math.round(addedScores * 10) / 10,
        totalAfterClamp: rating?.totalScore ?? 0,
      };
    });

  const gradeMap = assignGrades(
    ratings.map((rating) => ({ key: rating.sigunguKey, score: rating.totalScore })),
    { minRelativeCount: 150, allowRelative: true },
  );
  ratings.forEach((rating) => {
    rating.grade = gradeMap.grades[rating.sigunguKey] ?? "D";
  });

  const relativeGradeApplied = Boolean(gradeMap.relativeApplied);
  const gradeCounts = computeGradeCounts(ratings);

  const scoringApplied = regionsWithNews > 0;
  const fallbackUsed = regionsWithNews === 0;
  const scoringReasons: PlatformMapScoringStatus["reason"] = [];
  if (regionsWithNews === 0) scoringReasons.push("뉴스_매칭_없음");
  if (scoreStats.uniqueScoreCount <= 1) scoringReasons.push("점수분산_없음");
  if (dedupedLast24h === 0 && fetchedLast24h > 0) scoringReasons.push("최근기사_매칭_0");

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
        reason: scoringReasons,
      },
      samples,
    },
    regionAxisCounts,
    regionAxisArticles: regionAxisArticlesPayload,
    regionCapital,
  };
};
