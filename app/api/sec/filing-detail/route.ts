import { NextRequest, NextResponse } from "next/server";
import { parse13DGOwnership } from "@/lib/secParser";
import { fetchSecDocument, buildSecDocUrl } from "@/lib/secFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FORMS = new Set(["13D", "13D/A", "13G", "13G/A"]);

/**
 * GET /api/sec/filing-detail?cik=...&accession=...&primaryDoc=...&formType=...
 * 13D/13G 문서에서 지분율·보유주식 최소 파싱 (확장 기능).
 * - 기존 API 수정 없음.
 */
export async function GET(request: NextRequest) {
  try {
    const cik = request.nextUrl.searchParams.get("cik") ?? "";
    const accession = request.nextUrl.searchParams.get("accession") ?? "";
    const primaryDoc = request.nextUrl.searchParams.get("primaryDoc") ?? "";
    const formType = request.nextUrl.searchParams.get("formType") ?? "";

    const form = formType.trim();
    if (!ALLOWED_FORMS.has(form)) {
      return NextResponse.json(
        { ok: false, message: "13D/13G 문서만 지원합니다." },
        { status: 400 }
      );
    }
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
        message: "지분 정보 미확인",
      });
    }

    const parsed = parse13DGOwnership(html);
    if (!parsed || (parsed.percentOfClass === null && parsed.sharesOwned === null)) {
      return NextResponse.json({
        ok: false,
        message: "지분 정보 미확인",
      });
    }

    return NextResponse.json({
      ok: true,
      percentOfClass: parsed.percentOfClass,
      sharesOwned: parsed.sharesOwned,
      source: form,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "지분 정보 미확인" },
      { status: 200 }
    );
  }
}
