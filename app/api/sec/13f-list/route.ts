import { NextRequest, NextResponse } from "next/server";
import { fetchFilingsForCik, padCik } from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sec/13f-list?cik=...
 * 기관 CIK에 대한 13F-HR(및 13F-HR/A) 제출 목록만 반환 (최신순).
 * - 기존 API 수정 없음. 신규 route만 추가.
 */
export async function GET(request: NextRequest) {
  try {
    const cikParam = request.nextUrl.searchParams.get("cik");
    const cik = typeof cikParam === "string" ? cikParam.trim() : "";
    const padded = padCik(cik);
    if (!padded) {
      return NextResponse.json(
        { ok: false, error: "invalid_cik", message: "유효한 CIK가 필요합니다." },
        { status: 400 }
      );
    }

    const result = await fetchFilingsForCik(padded);
    if (!result.ok) {
      const status =
        result.error === "forbidden" ? 403 : result.error === "rate_limit" ? 429 : 502;
      const message =
        result.error === "forbidden"
          ? "SEC 접근이 제한되었습니다."
          : result.error === "rate_limit"
            ? "요청 한도를 초과했습니다."
            : "공시 데이터를 불러올 수 없습니다.";
      return NextResponse.json({ ok: false, error: result.error, message }, { status });
    }

    const list13f = result.filings.filter(
      (f) => f.formType === "13F-HR" || f.formType === "13F-HR/A"
    );

    return NextResponse.json({
      ok: true,
      cik: padded,
      filings: list13f,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "server_error", message }, { status: 500 });
  }
}
