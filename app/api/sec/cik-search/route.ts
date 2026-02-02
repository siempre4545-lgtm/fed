import { NextRequest, NextResponse } from "next/server";
import { fetchCompanyTickers, searchCikByKeyword } from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sec/cik-search?q=BlackRock
 * 이름 키워드로 CIK 검색 (company_tickers.json 기반).
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? request.nextUrl.searchParams.get("name") ?? "";
    const keyword = typeof q === "string" ? q.trim() : "";
    if (!keyword) {
      return NextResponse.json(
        { ok: false, error: "missing_query", message: "q 또는 name 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    const tickers = await fetchCompanyTickers();
    if (!tickers) {
      return NextResponse.json(
        { ok: false, error: "tickers_unavailable", message: "SEC 데이터를 불러올 수 없습니다." },
        { status: 502 }
      );
    }

    const result = searchCikByKeyword(tickers, keyword);
    if (!result) {
      return NextResponse.json({
        ok: false,
        error: "cik_not_found",
        message: "CIK를 찾지 못했습니다. 키워드를 확인하거나 수동 입력을 이용하세요.",
      });
    }

    return NextResponse.json({
      ok: true,
      cik: result.cik,
      title: result.title,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
