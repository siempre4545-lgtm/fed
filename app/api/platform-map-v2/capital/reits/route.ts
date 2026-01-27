import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../../data/platform-map-v2/aliases.json";
import reitsConfig from "../../../../../data/platform-map-v2/dart-reits.json";
import { createCacheStore } from "../../../../../lib/platform-map-v2/cache";
import { extractHoldingsFromText } from "../../../../../lib/platform-map-v2/disclosures/extract";
import { fetchDartReportText, fetchDartReports, loadCorpCodeMap, resolveCorpCode } from "../../../../../lib/platform-map-v2/disclosures/dart";
import { buildRegionContexts } from "../../../../../lib/platform-map-v2/news/match";
import type { CapitalHoldingEntity, CapitalHoldingRegion } from "../../../../../lib/platform-map-v2/types";
import type { RawRating } from "../../../../../lib/platform-map-v2/news/compute";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const RATINGS_PATH = path.join(process.cwd(), "data/platform-map/ratings.json");
const CACHE_KEY = "pmv2:capital:auto:reit";
const CACHE_TTL = 60 * 60 * 24 * 14;
const cacheStore = createCacheStore();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  const apiKey = process.env.DART_API_KEY;

  const cached = await cacheStore.get<CapitalHoldingEntity[]>(CACHE_KEY);
  if (cached && !refresh) {
    return NextResponse.json({ ok: true, source: "cache", entities: cached });
  }
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, source: "cache", entities: cached ?? [], error: "DART_API_KEY missing" },
      { status: 200 },
    );
  }

  const warnings: string[] = [];
  const ratingsRaw = await readFile(RATINGS_PATH, "utf-8");
  const rawRatings = JSON.parse(ratingsRaw) as RawRating[];
  const regionContexts = buildRegionContexts(rawRatings, aliases);

  let corpMap: Record<string, string> = {};
  try {
    corpMap = await loadCorpCodeMap(apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "corpCode fetch failed";
    warnings.push(message);
  }

  const entities: CapitalHoldingEntity[] = [];
  for (const item of reitsConfig.entities) {
    const corpCode = resolveCorpCode(item.name, corpMap);
    if (!corpCode) {
      warnings.push(`${item.name} corpCode not found`);
      continue;
    }
    let reports;
    try {
      reports = await fetchDartReports(apiKey, corpCode, reitsConfig.reportTypes);
    } catch (error) {
      warnings.push(`${item.name} reports fetch failed`);
      continue;
    }

    const mergedRegions = new Map<string, CapitalHoldingRegion>();
    let source = "";
    let updatedAt = "";

    for (const report of reports) {
      try {
        const text = await fetchDartReportText(apiKey, report.rceptNo);
        const regions = extractHoldingsFromText(text, regionContexts);
        regions.forEach((region) => {
          const existing = mergedRegions.get(region.sigungu);
          if (!existing) {
            mergedRegions.set(region.sigungu, { ...region, asOf: report.rceptDate });
          } else {
            const status =
              existing.status === "정리" || region.status === "정리"
                ? "정리"
                : existing.status === "확대" || region.status === "확대"
                ? "확대"
                : "보유";
            const confidence =
              existing.confidence === "HIGH" || region.confidence === "HIGH"
                ? "HIGH"
                : existing.confidence === "MEDIUM" || region.confidence === "MEDIUM"
                ? "MEDIUM"
                : "LOW";
            mergedRegions.set(region.sigungu, { ...existing, status, confidence });
          }
        });
        source = `https://opendart.fss.or.kr/dsaf001/main.do?rcpNo=${report.rceptNo}`;
        updatedAt = report.rceptDate;
      } catch (error) {
        warnings.push(`${item.name} report parse failed`);
      }
    }

    entities.push({
      entity: item.name,
      type: item.type as CapitalHoldingEntity["type"],
      regions: Array.from(mergedRegions.values()),
      source,
      updatedAt,
    });
  }

  await cacheStore.set(CACHE_KEY, entities, CACHE_TTL);
  const response = NextResponse.json({ ok: true, source: "dart", entities, warnings });
  response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  console.info(LOG_PREFIX, "reit holdings sync", { count: entities.length, warnings: warnings.length });
  return response;
}
