import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { AXIS_DEFINITIONS, type AxisKey, type AxisScore, type PlatformMapRating } from "../../../../lib/platform-map-v2/types";
import { getScoreSummary } from "../../../../lib/platform-map-v2/scoring";

const LOG_PREFIX = "[PMV2]";

const GEOJSON_PATH = path.join(process.cwd(), "data/platform-map/korea_sigungu.geojson");
const RATINGS_PATH = path.join(process.cwd(), "data/platform-map/ratings.json");

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sigungu = searchParams.get("sigungu")?.trim();
  const sigunguKey = searchParams.get("sigunguKey")?.trim();
  const debug = searchParams.get("debug") === "1";

  console.info(LOG_PREFIX, "data request", { sigungu, sigunguKey, debug });
  const [geoRaw, ratingsRaw] = await Promise.all([
    readFile(GEOJSON_PATH, "utf-8"),
    readFile(RATINGS_PATH, "utf-8"),
  ]);

  const geojson = JSON.parse(geoRaw);
  const rawRatings: Array<{
    sigunguCode: string;
    sigunguName: string;
    grade?: string;
    score?: number;
    axes?: Record<string, number>;
    updatedAt?: string;
  }> = JSON.parse(ratingsRaw);

  const ratings: PlatformMapRating[] = rawRatings.map((rating) => {
    const axisScores: AxisScore[] = AXIS_DEFINITIONS.map((axis) => {
      const legacyKey = AXIS_MAP[axis.key];
      const raw = rating.axes?.[legacyKey];
      return {
        key: axis.key,
        label: axis.label,
        score: normalizeAxisScore(raw),
      };
    });
    const summary = getScoreSummary(axisScores);
    const top3Axes = [...axisScores].sort((a, b) => b.score - a.score).slice(0, 3);
    return {
      name: rating.sigunguName,
      sigunguKey: rating.sigunguCode,
      grade: summary.grade,
      totalScore: summary.total,
      axisScores,
      top3Axes,
    };
  });

  const updatedAt =
    rawRatings
      .map((item) => item.updatedAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || new Date().toISOString();

  if (sigungu || sigunguKey) {
    const target = ratings.find((item) => item.sigunguKey === sigunguKey) ??
      ratings.find((item) => item.name === sigungu) ??
      ratings.find((item) => item.name.includes(sigungu || ""));
    const response = NextResponse.json(
      { ok: true, rating: target ?? null, meta: { updatedAt, source: "local" } },
      { status: 200 },
    );
    response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return response;
  }

  const payload: {
    ok: true;
    geojson: any;
    ratings: PlatformMapRating[];
    meta: { updatedAt: string; source: string };
    debug?: {
      totalFeatures: number;
      totalRatings: number;
      gradesCount: Record<string, number>;
    };
  } = {
    ok: true,
    geojson,
    ratings,
    meta: { updatedAt, source: "local" },
  };

  if (debug) {
    const gradesCount = ratings.reduce(
      (acc, item) => {
        acc[item.grade] = (acc[item.grade] || 0) + 1;
        return acc;
      },
      { A: 0, B: 0, C: 0, D: 0 } as Record<string, number>,
    );
    payload.debug = {
      totalFeatures: geojson?.features?.length ?? 0,
      totalRatings: ratings.length,
      gradesCount,
    };
  }

  const response = NextResponse.json(payload, { status: 200 });
  response.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  return response;
}
