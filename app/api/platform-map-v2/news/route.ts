import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { createCacheStore } from "../../../../lib/platform-map-v2/cache";
import { buildRegionContext, matchRegionHints } from "../../../../lib/platform-map-v2/region/match";
import { RSS_SOURCES } from "../../../../lib/platform-map-v2/rss/sources";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const cacheStore = createCacheStore();
const parser = new Parser();
const TIMEOUT_MS = 6000;
const CONCURRENCY = 3;

type SourceResult = {
  source: string;
  ok: boolean;
  status?: number;
  elapsedMs: number;
  titleCount: number;
  errorReason?: string;
};

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const buildDateKey = () => new Date().toISOString().slice(0, 10);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sigungu = searchParams.get("sigungu")?.trim();
  const sigunguKey = searchParams.get("sigunguKey")?.trim();

  if (!sigungu) {
    console.warn(LOG_PREFIX, "news missing sigungu");
    return NextResponse.json({ ok: false, error: "sigungu is required" }, { status: 400 });
  }

  const dateKey = buildDateKey();
  const cacheKey = `pmv2:news:${sigunguKey || sigungu}:${dateKey}`;
  const cached = await cacheStore.get<{ ok: boolean; sources: SourceResult[] }>(cacheKey);
  if (cached) {
    const response = NextResponse.json(cached);
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
    return response;
  }

  console.info(LOG_PREFIX, "news fetch start", { sigungu, sigunguKey });
  const regionContext = buildRegionContext(sigungu, aliases);
  const queue = [...RSS_SOURCES];
  const results: SourceResult[] = [];

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const source = queue.shift();
      if (!source) return;
      const start = Date.now();
      try {
        const response = await fetchWithTimeout(source.url, TIMEOUT_MS);
        const elapsedMs = Date.now() - start;
        if (!response.ok) {
          results.push({
            source: source.id,
            ok: false,
            status: response.status,
            elapsedMs,
            titleCount: 0,
            errorReason: `HTTP ${response.status}`,
          });
          continue;
        }
        const text = await response.text();
        const feed = await parser.parseString(text);
        const items = feed.items ?? [];
        const matched = items.filter((item) => {
          const title = item.title ?? "";
          const snippet = item.contentSnippet || item.summary || item.content || "";
          const textForMatch = `${title} ${snippet}`;
          const hints = matchRegionHints(textForMatch, regionContext);
          return hints.length > 0;
        });
        results.push({
          source: source.id,
          ok: true,
          status: response.status,
          elapsedMs,
          titleCount: matched.length,
        });
      } catch (error) {
        results.push({
          source: source.id,
          ok: false,
          elapsedMs: Date.now() - start,
          titleCount: 0,
          errorReason: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  });

  await Promise.all(workers);
  const payload = { ok: true, sources: results };
  await cacheStore.set(cacheKey, payload, 300);
  console.info(LOG_PREFIX, "news fetch done", {
    sigungu,
    sigunguKey,
    success: results.filter((item) => item.ok).length,
    fail: results.filter((item) => !item.ok).length,
  });

  const response = NextResponse.json(payload);
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
  return response;
}
