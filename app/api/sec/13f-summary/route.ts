import { NextRequest, NextResponse } from "next/server";
import { fetchSecDocument, buildSecDocUrl } from "@/lib/secFetch";
import { extract13FHolderNames } from "@/lib/sec13fExtract";
import { aggregateHoldings } from "@/lib/sectorClassifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sec/13f-summary?cik=...&accession=...&primaryDoc=...
 * 13F 문서에서 섹터/ETF 방향성만 추정 (확장 기능).
 * - 기존 API 수정 없음.
 */
export async function GET(request: NextRequest) {
  try {
    const cik = request.nextUrl.searchParams.get("cik") ?? "";
    const accession = request.nextUrl.searchParams.get("accession") ?? "";
    const primaryDoc = request.nextUrl.searchParams.get("primaryDoc") ?? "";

    if (!cik.trim() || !accession.trim()) {
      return NextResponse.json(
        { ok: false, message: "cik, accession이 필요합니다." },
        { status: 400 }
      );
    }

    const url = buildSecDocUrl(cik, accession, primaryDoc);
    const html = await fetchSecDocument(url);
    if (!html) {
      return NextResponse.json({
        ok: false,
        message: "13F 제출 확인됨 (상세 비공개)",
      });
    }

    const names = extract13FHolderNames(html);
    if (names.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "13F 제출 확인됨 (상세 비공개)",
      });
    }

    const agg = aggregateHoldings(names.map((name) => ({ name })));

    return NextResponse.json({
      ok: true,
      topSectors: agg.topSectors,
      etfExposure: agg.etfExposure,
      etfLabels: agg.etfLabels,
      mixLabel: agg.mixLabel,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "13F 제출 확인됨 (상세 비공개)" },
      { status: 200 }
    );
  }
}
