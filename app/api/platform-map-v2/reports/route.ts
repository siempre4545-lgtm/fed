import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import aliases from "../../../../data/platform-map-v2/aliases.json";
import { loadCapitalHoldings, buildHoldingsIndex } from "../../../../lib/platform-map-v2/capital/holdings";
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
  const holdingsIndex = buildHoldingsIndex(holdings, computed.ratings);

  const report = await generateCapitalReport({
    ratings: computed.ratings,
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
