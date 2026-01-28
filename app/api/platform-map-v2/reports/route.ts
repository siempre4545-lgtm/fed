import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { loadCapitalHoldings, buildHoldingsIndex } from "../../../../lib/platform-map-v2/capital/holdings";
import { loadFactLayer } from "../../../../lib/platform-map-v2/facts";
import { buildStructuralAxis, composeRatingScores, sumAxisValues } from "../../../../lib/platform-map-v2/scoring/compose";
import { computePlatformMapRatings, type RawRating } from "../../../../lib/platform-map-v2/news/compute";
import { generateCapitalReport } from "../../../../lib/platform-map-v2/reports/generate";
import { loadReportById, loadReports, saveReport } from "../../../../lib/platform-map-v2/reports/store";
import type { PlatformMapReportPeriod } from "../../../../lib/platform-map-v2/types";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";
const RATINGS_PATH = path.join(process.cwd(), "data/platform-map/ratings.json");

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const report = await loadReportById(id);
    if (!report) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, report }, { status: 200 });
  }
  const reports = await loadReports();
  return NextResponse.json({ ok: true, reports }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as { period?: PlatformMapReportPeriod }));
  const period = body?.period ?? "manual";
  console.info(LOG_PREFIX, "report generate", { period });

  const ratingsRaw = await readFile(RATINGS_PATH, "utf-8");
  const rawRatings = JSON.parse(ratingsRaw) as RawRating[];
  const computed = await computePlatformMapRatings(rawRatings, aliases);
  const holdings = await loadCapitalHoldings();
  const factLayer = await loadFactLayer();
  const factEntries = factLayer.entries ?? [];
  const factEntryMap = new Map<string, (typeof factEntries)[number]>();
  factEntries.forEach((entry) => {
    factEntryMap.set(entry.sigungu, entry);
    if (entry.sigunguKey) factEntryMap.set(`key:${entry.sigunguKey}`, entry);
  });
  const holdingsIndex = buildHoldingsIndex(holdings, computed.ratings);
  const structuralTotals = computed.ratings.map((rating) => {
    const factEntry = factEntryMap.get(`key:${rating.sigunguKey}`) ?? factEntryMap.get(rating.name);
    const structuralAxis = buildStructuralAxis(factEntry);
    return Math.round(sumAxisValues(structuralAxis) * 10) / 10;
  });
  const sorted = [...structuralTotals].sort((a, b) => b - a);
  const thresholdIndex = Math.max(0, Math.floor(sorted.length * 0.15) - 1);
  const structuralThreshold = sorted[thresholdIndex] ?? 0;

  const composedRatings = computed.ratings.map((rating, index) => {
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
      Object.values(computed.regionAxisCounts[rating.sigunguKey] ?? {}).reduce(
        (sum, count) => sum + count,
        0,
      ) > 0;

    const composed = composeRatingScores({
      rating,
      factEntry,
      holdings: holdingsList,
      rssObserved,
      holdingsEstimated,
    });
    const top3Axes = [...composed.axisScores].sort((a, b) => b.score - a.score).slice(0, 3);
    return {
      ...rating,
      axisScores: composed.axisScores,
      totalScore: composed.totalScore,
      top3Axes,
      scoreComponents: composed.components,
    };
  });

  const report = await generateCapitalReport({
    ratings: composedRatings,
    capitalMap: computed.regionCapital,
    holdingsMap: holdingsIndex.bySigunguKey,
    period,
  });

  const saved = await saveReport(report);
  const response = NextResponse.json(
    { ok: true, report, warnings: saved.warnings ?? [] },
    { status: 200 },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
