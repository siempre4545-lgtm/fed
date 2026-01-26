import { NextRequest, NextResponse } from "next/server";
import { AXIS_DEFINITIONS, type AxisKey } from "../../../../../lib/platform-map-v2/types";

export const runtime = "nodejs";

const AXIS_KEYS = new Set<AxisKey>(AXIS_DEFINITIONS.map((axis) => axis.key));

export async function POST(request: NextRequest) {
  let body: {
    sigungu?: string;
    axis?: AxisKey;
    approvedEvidenceIds?: string[];
    memo?: string;
    applyToScore?: boolean;
  } = {};

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.sigungu || !body.axis || !AXIS_KEYS.has(body.axis)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    note: "client_storage_only",
    saved: {
      sigungu: body.sigungu,
      axis: body.axis,
      approvedEvidenceIds: body.approvedEvidenceIds ?? [],
      memo: body.memo ?? "",
      applyToScore: Boolean(body.applyToScore),
    },
  });
}
