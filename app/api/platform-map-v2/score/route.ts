import { NextRequest, NextResponse } from "next/server";
import type { ScoreState } from "../../../../lib/platform-map-v2/store";
import { loadKvScoreState, saveKvScoreState } from "../../../../lib/platform-map-v2/store/serverStore";

export const runtime = "nodejs";
const LOG_PREFIX = "[PMV2]";

const hasKv = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sigungu = searchParams.get("sigungu")?.trim();
  if (!sigungu) {
    console.warn(LOG_PREFIX, "score missing sigungu");
    return NextResponse.json({ ok: false, error: "sigungu is required" }, { status: 400 });
  }

  if (!hasKv()) {
    console.info(LOG_PREFIX, "score kv unavailable");
    return NextResponse.json({ ok: false, reason: "kv_unavailable" });
  }

  console.info(LOG_PREFIX, "score get", { sigungu });
  const state = await loadKvScoreState(sigungu);
  return NextResponse.json({ ok: true, state });
}

export async function POST(request: NextRequest) {
  let body: { sigungu?: string; state?: ScoreState } = {};
  try {
    body = (await request.json()) as { sigungu?: string; state?: ScoreState };
  } catch (error) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.sigungu || !body.state) {
    console.warn(LOG_PREFIX, "score invalid payload");
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  if (!hasKv()) {
    console.info(LOG_PREFIX, "score kv unavailable");
    return NextResponse.json({ ok: false, reason: "kv_unavailable" });
  }

  console.info(LOG_PREFIX, "score save", {
    sigungu: body.sigungu,
    axes: Object.keys(body.state.axes ?? {}).length,
  });
  await saveKvScoreState(body.sigungu, body.state);
  return NextResponse.json({ ok: true });
}
