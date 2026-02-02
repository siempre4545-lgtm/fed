import { NextRequest, NextResponse } from "next/server";
import { padCik } from "@/lib/sec";
import { fetchSecDocument } from "@/lib/secFetch";
import { find13fInfoTableUrl } from "@/lib/edgarArchives";
import { parse13fInfoTableXml, parse13fInfoTableTxt, type Holding13F } from "@/lib/parse13fInfoTable";
import { compute13fChanges } from "@/lib/compute13fChanges";
import { formatSummary } from "@/lib/formatSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPARE_CACHE_TTL_MS = 30 * 60 * 1000;
const compareCache = new Map<string, { ts: number; data: unknown }>();

async function getHoldingsForAccession(
  cik: string,
  accession: string
): Promise<Holding13F[] | null> {
  const candidate = await find13fInfoTableUrl(cik, accession);
  if (!candidate) return null;
  const raw = await fetchSecDocument(candidate.url);
  if (!raw) return null;
  const isXml = /\.xml$/i.test(candidate.fileName);
  const holdings = isXml ? parse13fInfoTableXml(raw) : parse13fInfoTableTxt(raw);
  return holdings.length > 0 ? holdings : null;
}

/**
 * GET /api/sec/13f-compare?cik=...&accession1=...(직전)&accession2=...(최신)
 * 두 13F 제출의 보유 비교 → 신규편입/청산/증가/감소.
 * - 둘 중 하나라도 파싱 실패 시 changes 미제공.
 */
export async function GET(request: NextRequest) {
  try {
    const cikParam = request.nextUrl.searchParams.get("cik");
    const acc1 = request.nextUrl.searchParams.get("accession1") ?? "";
    const acc2 = request.nextUrl.searchParams.get("accession2") ?? "";
    const cik = typeof cikParam === "string" ? cikParam.trim() : "";
    const padded = padCik(cik);
    if (!padded || !acc1 || !acc2) {
      return NextResponse.json(
        { ok: false, message: "cik, accession1, accession2가 필요합니다." },
        { status: 400 }
      );
    }

    const cacheKey = `compare:${padded}:${acc1.replace(/-/g, "")}:${acc2.replace(/-/g, "")}`;
    const cached = compareCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < COMPARE_CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    const [prevHoldings, latestHoldings] = await Promise.all([
      getHoldingsForAccession(padded, acc1),
      getHoldingsForAccession(padded, acc2),
    ]);

    if (!prevHoldings || !latestHoldings) {
      return NextResponse.json({
        ok: false,
        message: "전분기 또는 최신 분기 정보표를 찾지 못해 비교할 수 없습니다.",
      });
    }

    const changes = compute13fChanges(prevHoldings, latestHoldings);
    const summary = formatSummary(latestHoldings, changes);

    const data = {
      ok: true,
      accessionPrev: acc1,
      accessionLatest: acc2,
      changes: {
        newEntries: changes.newEntries.slice(0, 50),
        soldOut: changes.soldOut.slice(0, 50),
        increased: changes.increased.slice(0, 30),
        decreased: changes.decreased.slice(0, 30),
      },
      summary,
    };
    compareCache.set(cacheKey, { ts: Date.now(), data });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, message: "비교 처리 중 오류가 발생했습니다." },
      { status: 200 }
    );
  }
}
