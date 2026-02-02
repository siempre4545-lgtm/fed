import { NextRequest, NextResponse } from "next/server";
import { padCik } from "@/lib/sec";
import { fetchSecDocument } from "@/lib/secFetch";
import { find13fInfoTableUrl } from "@/lib/edgarArchives";
import { parse13fInfoTableXml, parse13fInfoTableTxt, type Holding13F } from "@/lib/parse13fInfoTable";
import { formatSummary } from "@/lib/formatSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLDINGS_CACHE_TTL_MS = 30 * 60 * 1000;
const holdingsCache = new Map<string, { ts: number; data: HoldingsResponse }>();

type HoldingsResponse = {
  ok: true;
  accessionNumber: string;
  filingDate: string | null;
  holdings: Holding13F[];
  totalCount: number;
  totalValueThousands: number;
  top10Pct: number;
  summary: ReturnType<typeof formatSummary>;
};

/**
 * GET /api/sec/13f-holdings?cik=...&accession=...
 * 해당 13F 제출의 정보표를 찾아 파싱 후 holdings + 요약 반환.
 * - 캐시 30분.
 */
export async function GET(request: NextRequest) {
  try {
    const cikParam = request.nextUrl.searchParams.get("cik");
    const accessionParam = request.nextUrl.searchParams.get("accession");
    const cik = typeof cikParam === "string" ? cikParam.trim() : "";
    const accession = typeof accessionParam === "string" ? accessionParam.trim() : "";
    const padded = padCik(cik);
    if (!padded || !accession) {
      return NextResponse.json(
        { ok: false, message: "cik, accession이 필요합니다." },
        { status: 400 }
      );
    }

    const cacheKey = `holdings:${padded}:${accession.replace(/-/g, "")}`;
    const cached = holdingsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < HOLDINGS_CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    const candidate = await find13fInfoTableUrl(padded, accession);
    if (!candidate) {
      return NextResponse.json({
        ok: false,
        message: "정보표를 찾지 못함 (infotable.xml 등 미발견 또는 형식 미지원)",
      });
    }

    const raw = await fetchSecDocument(candidate.url);
    if (!raw) {
      return NextResponse.json({
        ok: false,
        message: "정보표 파일을 불러오지 못했습니다.",
      });
    }

    const isXml = /\.xml$/i.test(candidate.fileName);
    const holdings: Holding13F[] = isXml
      ? parse13fInfoTableXml(raw)
      : parse13fInfoTableTxt(raw);

    if (holdings.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "정보표를 파싱했으나 보유 종목이 없습니다.",
      });
    }

    const totalValueThousands = holdings.reduce((s, h) => s + h.value, 0);
    const sorted = [...holdings].sort((a, b) => b.value - a.value);
    const top10 = sorted.slice(0, 10);
    const top10Sum = top10.reduce((s, h) => s + h.value, 0);
    const top10Pct = totalValueThousands > 0
      ? Math.round((top10Sum / totalValueThousands) * 1000) / 10
      : 0;

    const summary = formatSummary(holdings, null);

    const filingDate = request.nextUrl.searchParams.get("filingDate") ?? null;

    const data: HoldingsResponse = {
      ok: true,
      accessionNumber: accession,
      filingDate: filingDate || null,
      holdings,
      totalCount: holdings.length,
      totalValueThousands,
      top10Pct,
      summary,
    };
    holdingsCache.set(cacheKey, { ts: Date.now(), data });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, message: "정보표 처리 중 오류가 발생했습니다." },
      { status: 200 }
    );
  }
}
