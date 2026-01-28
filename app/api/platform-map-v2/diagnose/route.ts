import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { createCacheStore } from "../../../../lib/platform-map-v2/cache";
import { loadFactLayer } from "../../../../lib/platform-map-v2/facts";
import { loadHistoryForSigungu } from "../../../../lib/platform-map-v2/history/store";
import { loadCapitalHoldings, buildHoldingsIndex } from "../../../../lib/platform-map-v2/capital/holdings";
import { RSS_SOURCES } from "../../../../lib/platform-map-v2/rss/sources";
import { dedupeNewsItems } from "../../../../lib/platform-map-v2/news/dedupe";
import { classifyArticle } from "../../../../lib/platform-map-v2/news/classify";
import {
  buildRegionContexts,
  matchRegionNormalizedDetailed,
  normalizeText,
  type RegionAliasMap,
} from "../../../../lib/platform-map-v2/news/match";
import {
  buildStructuralAxis,
  composeRatingScores,
  sumAxisValues,
} from "../../../../lib/platform-map-v2/scoring/compose";
import { getReliabilityFromUrl } from "../../../../lib/platform-map-v2/classify";
import {
  computePlatformMapRatings,
  type PlatformMapDebugInfo,
  type RawRating,
} from "../../../../lib/platform-map-v2/news/compute";
import type {
  AxisKey,
  PlatformMapDiagnoseResponse,
  PlatformMapRating,
} from "../../../../lib/platform-map-v2/types";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const CACHE_VERSION = "platform-map-v2:v7";
const CACHE_TTL_SECONDS = 1800;
const RATINGS_PATH = path.join(process.cwd(), "data/platform-map/ratings.json");
const cacheStore = createCacheStore();

const FETCH_TIMEOUT_MS = 6000;
const MAX_ITEMS_PER_SOURCE = 80;
const DAYS = 30;
const CONCURRENCY = 3;

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

type CachePayload = {
  ratings: PlatformMapRating[];
  debug: PlatformMapDebugInfo;
  relativeGradeApplied: boolean;
  regionAxisCounts: Record<string, Record<AxisKey, number>>;
  updatedAt: string;
};

type DiagnoseItem = {
  title: string;
  url: string;
  publishedAt: string;
  snippet: string;
  source: string;
  sourceId: string;
  reliability: "A" | "B" | "C";
  category: "gov" | "thinktank" | "media" | "local" | "industry";
};

const buildKeywordMatcher = (keywords: string[]) => {
  const tokens = keywords.map((keyword) => normalizeText(keyword)).filter(Boolean);
  return (normalizedText: string) => tokens.some((token) => normalizedText.includes(token));
};

const hasCategoryKeyword = buildKeywordMatcher(CATEGORY_KEYWORDS);
const hasCoreRegionKeyword = buildKeywordMatcher(CORE_REGION_KEYWORDS);

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const buildSnippet = (value: string, maxLength = 240) => {
  const cleaned = stripHtml(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3)}...`;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sigungu = searchParams.get("sigungu")?.trim();
  const sigunguKey = searchParams.get("sigunguKey")?.trim();

  if (!sigungu) {
    return NextResponse.json({ ok: false, error: "sigungu is required" }, { status: 400 });
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
      updatedAt: new Date().toISOString(),
    };
    await cacheStore.set(cacheKey, cached, CACHE_TTL_SECONDS);
  }

  const ratingTarget =
    cached.ratings.find((item) => item.sigunguKey === sigunguKey) ??
    cached.ratings.find((item) => item.sigunguKey === sigungu) ??
    cached.ratings.find((item) => item.name === sigungu) ??
    cached.ratings.find((item) => item.name.includes(sigungu));

  if (!ratingTarget) {
    return NextResponse.json({ ok: false, error: "sigungu not found" }, { status: 404 });
  }

  const factLayer = await loadFactLayer();
  const factEntry =
    (factLayer.entries ?? []).find((entry) => entry.sigunguKey === ratingTarget.sigunguKey) ??
    (factLayer.entries ?? []).find((entry) => entry.sigungu === ratingTarget.name);
  const structuralAxis = buildStructuralAxis(factEntry);
  const structuralScore = Math.round(sumAxisValues(structuralAxis) * 10) / 10;

  const holdings = await loadCapitalHoldings();
  const holdingsIndex = buildHoldingsIndex(holdings, cached.ratings);
  const holdingsList = holdingsIndex.bySigunguKey[ratingTarget.sigunguKey] ?? [];
  const holdingsSources = Array.from(new Set(holdingsList.map((item) => item.source)));

  const structuralTotals = cached.ratings.map((rating) => {
    const entry =
      (factLayer.entries ?? []).find((item) => item.sigunguKey === rating.sigunguKey) ??
      (factLayer.entries ?? []).find((item) => item.sigungu === rating.name);
    const axis = buildStructuralAxis(entry);
    return Math.round(sumAxisValues(axis) * 10) / 10;
  });
  const sorted = [...structuralTotals].sort((a, b) => b - a);
  const thresholdIndex = Math.max(0, Math.floor(sorted.length * 0.15) - 1);
  const structuralThreshold = sorted[thresholdIndex] ?? 0;
  const axisFloors = factEntry?.axisFloors ?? {};
  const meetsAxisFloor =
    (axisFloors.financialization ?? 0) >= 5 &&
    (axisFloors.governance ?? 0) >= 5 &&
    (axisFloors.residency_mobility ?? 0) >= 4;
  const holdingsEstimated =
    holdingsList.length === 0 &&
    structuralScore > 0 &&
    structuralScore >= structuralThreshold &&
    meetsAxisFloor;

  const rssObserved =
    Object.values(cached.regionAxisCounts[ratingTarget.sigunguKey] ?? {}).reduce(
      (sum, count) => sum + count,
      0,
    ) > 0;

  const composed = composeRatingScores({
    rating: ratingTarget,
    factEntry,
    holdings: holdingsList,
    rssObserved,
    holdingsEstimated,
  });

  const regionContexts = buildRegionContexts(rawRatings, aliases as RegionAliasMap);
  const regionContext =
    regionContexts.find((context) => context.sigunguKey === ratingTarget.sigunguKey) ??
    regionContexts.find((context) => context.name === ratingTarget.name);

  const parser = new Parser();
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const collected: DiagnoseItem[] = [];
  const sourceResults: Array<PlatformMapDiagnoseResponse["rss"]["sources"][number]> = [];
  const queue = [...RSS_SOURCES];

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, async () => {
    while (queue.length) {
      const source = queue.shift();
      if (!source) return;
      const start = Date.now();
      try {
        const response = await fetchWithTimeout(source.url, FETCH_TIMEOUT_MS);
        const elapsedMs = Date.now() - start;
        if (!response.ok) {
          sourceResults.push({
            source: source.id,
            ok: false,
            status: response.status,
            elapsedMs,
            itemCount: 0,
            matchedCount: 0,
            errorReason: `HTTP ${response.status}`,
          });
          continue;
        }
        const text = await response.text();
        const feed = await parser.parseString(text);
        const items = (feed.items ?? []).slice(0, MAX_ITEMS_PER_SOURCE);
        items.forEach((item) => {
          const publishedAt = item.isoDate || item.pubDate || item.published || item.date;
          const iso = publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString();
          if (new Date(iso) < cutoff) return;
          const snippetRaw = item.contentSnippet || item.content || item.summary || item.description || "";
          const title = item.title?.trim() ?? "제목 없음";
          const link = item.link || item.guid || source.url;
          collected.push({
            title,
            url: link,
            publishedAt: iso,
            snippet: buildSnippet(snippetRaw),
            source: source.title,
            sourceId: source.id,
            reliability: source.reliability ?? getReliabilityFromUrl(link),
            category: source.category,
          });
        });
        sourceResults.push({
          source: source.id,
          ok: true,
          status: response.status,
          elapsedMs,
          itemCount: items.length,
          matchedCount: 0,
        });
      } catch (error) {
        sourceResults.push({
          source: source.id,
          ok: false,
          elapsedMs: Date.now() - start,
          itemCount: 0,
          matchedCount: 0,
          errorReason: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  });

  await Promise.all(workers);
  const { unique: deduped } = dedupeNewsItems(collected);

  const matchedBySource = new Map<string, number>();
  const topMatches: PlatformMapDiagnoseResponse["rss"]["topMatches"] = [];
  let classified = 0;
  let keywordFiltered = 0;
  let matchedArticles = 0;
  let sidoOnlyMatches = 0;

  if (regionContext) {
    deduped.forEach((item) => {
      const text = `${item.title} ${item.snippet}`;
      const normalizedText = normalizeText(text);
      const classification = classifyArticle(text);
      const axes = classification.matchedAxes;
      if (axes.length === 0) return;
      classified += 1;
      if (!hasCategoryKeyword(normalizedText)) {
        keywordFiltered += 1;
        return;
      }
      const match = matchRegionNormalizedDetailed(normalizedText, regionContext);
      if (!match.matched) return;
      const coreMatch = hasCoreRegionKeyword(normalizedText);
      if (match.level === "sido" && !coreMatch) {
        sidoOnlyMatches += 1;
        return;
      }
      if (match.level !== "sigungu" && match.level !== "sido") return;
      matchedArticles += 1;
      matchedBySource.set(item.sourceId, (matchedBySource.get(item.sourceId) ?? 0) + 1);
      const confidence = Math.max(
        ...axes.map((axis) => classification.confidenceByAxis[axis] ?? 0.6),
      );
      if (topMatches.length < 8) {
        topMatches.push({
          title: item.title,
          publishedAt: item.publishedAt,
          source: item.source,
          matchedAxes: axes,
          confidence,
          matchLevel: match.level,
          matchedTokens: match.matchedTokens,
        });
      }
    });
  }

  const sources = sourceResults.map((item) => ({
    ...item,
    matchedCount: matchedBySource.get(item.source) ?? 0,
  }));

  const historyEntries = await loadHistoryForSigungu(ratingTarget.name, 30);
  const cacheProvider = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN ? "kv" : "memory";

  const payload: PlatformMapDiagnoseResponse = {
    ok: true,
    region: ratingTarget.name,
    structure: {
      score: structuralScore,
      axes: structuralAxis,
    },
    institution: {
      enabled: true,
      rawSignalsCount: holdingsList.length,
      sourcesTried: holdingsSources,
      errors: [],
      score: composed.components.holdings.score,
      status: composed.components.holdings.status,
      reasonSamples: holdingsList.slice(0, 3).map((item) => `${item.entity}(${item.status ?? "보유"})`),
    },
    rss: {
      feedsTried: RSS_SOURCES.length,
      fetchOk: sources.filter((item) => item.ok).length,
      fetchFail: sources.filter((item) => !item.ok).length,
      matchedArticles,
      deduped: deduped.length,
      classified,
      keywordFiltered,
      sidoOnlyMatches,
      score: composed.components.rss.score,
      status: composed.components.rss.status,
      sources,
      topMatches: topMatches.sort((a, b) => b.confidence - a.confidence).slice(0, 6),
    },
    persistence: {
      snapshotStore: cacheProvider,
      hasHistory: historyEntries.length > 0,
      historyCount: historyEntries.length,
    },
    debugHints: {
      scoringStatus: cached.debug?.scoringStatus,
      newsStats: cached.debug?.newsStats,
    },
  };

  console.info(LOG_PREFIX, "diagnose", {
    sigungu: ratingTarget.name,
    holdings: holdingsList.length,
    matchedArticles,
  });

  const response = NextResponse.json(payload);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
