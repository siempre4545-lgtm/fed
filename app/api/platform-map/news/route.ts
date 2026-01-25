import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import { NEWS_SOURCES } from "../../../../lib/platform-map/news/sources";
import { classifyNewsItem } from "../../../../lib/platform-map/news/classify";
import { getCached, setCached } from "../../../../lib/platform-map/news/cache";
import { PlatformNewsItem, SigunguRating } from "../../../../lib/platform-map/types";

const RATINGS_PATH = path.join(process.cwd(), "data/platform-map/ratings.json");
const CACHE_TTL_MS = 5 * 60 * 1000;

const fetchWithTimeout = async (url: string, timeoutMs: number = 8000, retries: number = 1) => {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; fedreportsh/1.0; +https://fedreportsh.vercel.app)",
          Accept: "application/xml, text/xml, */*",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = `status ${response.status}`;
        continue;
      }
      return await response.text();
    } catch (error: any) {
      lastError = error?.message || "fetch failed";
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError || "fetch failed");
};

const parseRss = (xml: string) => {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: Array<{ title: string; url: string; date: string; summary?: string }> = [];
  $("item").each((_, el) => {
    const title = $(el).find("title").first().text().trim();
    const url = $(el).find("link").first().text().trim();
    const summary = $(el).find("description").first().text().trim();
    const pubDate = $(el).find("pubDate").first().text().trim();
    if (!title || !url) return;
    const parsedDate = new Date(pubDate);
    const date = Number.isNaN(parsedDate.getTime())
      ? new Date().toISOString().slice(0, 10)
      : parsedDate.toISOString().slice(0, 10);
    items.push({ title, url, date, summary });
  });
  return items;
};

const withinDays = (date: string, days: number) => {
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return target >= cutoff;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") || "7");
  const region = searchParams.get("region");
  const cacheKey = `platform-map:news:${days}:${region || "all"}`;

  const cached = getCached<PlatformNewsItem[]>(cacheKey);
  if (cached) {
    const cachedResponse = NextResponse.json({ ok: true, items: cached, meta: { warnings: [] } });
    cachedResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );
    return cachedResponse;
  }

  const warnings: string[] = [];
  let ratings: SigunguRating[] = [];
  try {
    ratings = JSON.parse(await readFile(RATINGS_PATH, "utf-8"));
  } catch (error: any) {
    warnings.push(error?.message || "ratings load failed");
  }

  const rawItems = await Promise.all(
    NEWS_SOURCES.map(async (source) => {
      try {
        const xml = await fetchWithTimeout(source.url);
        const items = parseRss(xml);
        return items.map((item) => ({ ...item, source: source.name }));
      } catch (error: any) {
        warnings.push(`${source.name}: ${error?.message || "fetch failed"}`);
        return [];
      }
    })
  );

  const flattened = rawItems.flat().filter((item) => withinDays(item.date, days));
  const classified = flattened.map((item) => classifyNewsItem(item, ratings));
  const filtered = region
    ? classified.filter((item) => item.regions.includes(region))
    : classified;

  setCached(cacheKey, filtered, CACHE_TTL_MS);

  const response = NextResponse.json({ ok: true, items: filtered, meta: { warnings } });
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return response;
}
