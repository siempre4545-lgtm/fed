import { NextRequest, NextResponse } from "next/server";
import { loadHistoryForSigungu } from "../../../../lib/platform-map-v2/history/store";
import type { HistoryEntry, HistoryResponse } from "../../../../lib/platform-map-v2/history/types";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";

const buildRollingAverage = (entries: HistoryEntry[], windowSize: number) => {
  return entries.map((entry, index) => {
    const slice = entries.slice(Math.max(0, index - windowSize + 1), index + 1);
    const sum = slice.reduce((acc, item) => acc + item.totalScore, 0);
    const avg = slice.length > 0 ? Math.round((sum / slice.length) * 10) / 10 : entry.totalScore;
    return { date: entry.date, totalScore: avg };
  });
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sigungu = searchParams.get("sigungu")?.trim();
  const daysParam = Number(searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 7), 90) : 30;

  if (!sigungu) {
    console.warn(LOG_PREFIX, "history missing sigungu");
    return NextResponse.json({ ok: false, error: "sigungu is required" }, { status: 400 });
  }

  const daily = await loadHistoryForSigungu(sigungu, days);
  const weeklyAverage = buildRollingAverage(daily, 7);
  const monthlyAverage = buildRollingAverage(daily, 30);

  const payload: HistoryResponse = {
    ok: true,
    sigungu,
    daily,
    weeklyAverage,
    monthlyAverage,
  };

  const response = NextResponse.json(payload);
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return response;
}
