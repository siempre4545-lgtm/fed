import { NextRequest, NextResponse } from "next/server";
import {
  fetchFilingsForCik,
  summarizeFilings,
  padCik,
  type SecFilingItem,
} from "@/lib/sec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEC_DOC_BASE = "https://www.sec.gov/cgi-bin/browse-edgar";

/**
 * GET /api/sec/filings?cik=0001234567
 * CIK에 대한 13D/13G/13F 공시 목록 (최신순).
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
        result.error === "forbidden"
          ? 403
          : result.error === "rate_limit"
            ? 429
            : 502;
      const message =
        result.error === "forbidden"
          ? "SEC 접근이 제한되었습니다."
          : result.error === "rate_limit"
            ? "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."
            : result.error === "timeout"
              ? "요청 시간이 초과되었습니다."
              : "공시 데이터를 불러올 수 없습니다.";
      return NextResponse.json(
        { ok: false, error: result.error, message },
        { status }
      );
    }

    const summary = summarizeFilings(result.filings);
    const cikNumeric = parseInt(padded, 10);
    const baseArchives = "https://www.sec.gov/Archives/edgar/data";
    const filingsWithDocLink = result.filings.map((f) => {
      const acc = f.accessionNumber;
      let docLink = "";
      if (acc) {
        const noDashes = acc.replace(/-/g, "");
        const doc = f.primaryDocument?.trim() || `${noDashes}-index.htm`;
        docLink = `${baseArchives}/${cikNumeric}/${noDashes}/${doc}`;
      } else {
        docLink = `${SEC_DOC_BASE}?action=getcompany&CIK=${padded}`;
      }
      return { ...f, secLink: docLink };
    });

    return NextResponse.json({
      ok: true,
      cik: padded,
      summary: {
        count90d: summary.count90d,
        latestFilingDate: summary.latestFilingDate,
        formCounts: summary.formCounts,
        latestEventLabel: summary.latestEventLabel,
      },
      filings: filingsWithDocLink,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "server_error", message },
      { status: 500 }
    );
  }
}
