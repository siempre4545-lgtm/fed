import { NextRequest, NextResponse } from 'next/server';
import { convertH41ToH4Report } from '@/lib/h41-adapter';

// src/h41.ts는 Next.js 외부이므로 동적 import 또는 API를 통해 접근
// 대신 /api/h41 엔드포인트를 사용하여 기존 로직 재사용

/**
 * 특정 날짜의 H.4.1 리포트 가져오기 및 파싱
 * 기존 HTML 파싱 로직을 재사용하여 안정적인 데이터 추출
 * Node.js 런타임 필수
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const debug = searchParams.get('debug') === '1';

    if (!date) {
      return NextResponse.json(
        { ok: false, error: 'date parameter is required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // 날짜 형식 검증
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // 캐시 키 생성
    const cacheKey = `h41:${date}`;
    // TODO: 실제 캐시 구현 (Vercel KV 또는 메모리 캐시)

    // 날짜에서 PDF URL 구성 (참고용)
    const yyyymmdd = date.replace(/-/g, '');
    const pdfUrl = `https://www.federalreserve.gov/releases/h41/${yyyymmdd}/h41.pdf`;

    // 기존 HTML 파싱 로직 사용 (안정적이고 검증됨)
    // 동적 import를 사용하여 src/h41.ts 접근
    let h41Report: any;
    try {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      console.log(`[${requestId}] Fetching H.4.1 report for date: ${date}`);
      
      // 동적 import로 src/h41.ts 접근
      const { fetchH41Report, getFedReleaseDates } = await import('../../../../src/h41.js');
      
      const releaseDates = await getFedReleaseDates();
      console.log(`[${requestId}] Available dates count: ${releaseDates.length}`);
      
      h41Report = await fetchH41Report(date, releaseDates);
      
      // H41Report 형식 검증
      if (!h41Report || !h41Report.cards || !Array.isArray(h41Report.cards)) {
        throw new Error('Invalid H41Report format: missing cards array');
      }
      
      // 데이터 유효성 검증
      const hasValidData = h41Report.cards.some(c => c.balance_musd !== 0 || c.change_musd !== 0);
      if (!hasValidData) {
        console.error(`[${requestId}] All card values are zero`);
        return NextResponse.json(
          {
            ok: false,
            error: 'Parsed data appears invalid (all zeros). The H.4.1 page structure may have changed.',
            ...(debug && { requestId, date, cardCount: h41Report.cards.length }),
          },
          { status: 500 }
        );
      }
      
      if (debug) {
        console.log(`[${requestId}] H41 Report fetched:`, {
          releaseDate: h41Report.releaseDateText,
          weekEnded: h41Report.asOfWeekEndedText,
          cardCount: h41Report.cards.length,
          coreCardCount: h41Report.coreCards.length,
          sampleCard: h41Report.coreCards[0],
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('H41 fetch error:', {
        date,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch H.4.1 report: ${errorMsg}`,
          ...(debug && { date, pdfUrl, errorDetails: errorMsg }),
        },
        { status: 500 }
      );
    }

    // H41Report를 H4Report로 변환
    let normalizedData;
    try {
      normalizedData = await convertH41ToH4Report(h41Report, date, pdfUrl);
      
      if (debug) {
        console.log('H4 Report converted:', {
          overview: {
            totalAssets: normalizedData.overview.totalAssets.value,
            securitiesHeld: normalizedData.overview.securitiesHeld.value,
            reserves: normalizedData.overview.reserves.value,
          },
          factors: {
            supplyingCount: normalizedData.factors.supplying.length,
            absorbingCount: normalizedData.factors.absorbing.length,
          },
        });
      }
    } catch (error) {
      console.error('Conversion error:', error);
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to convert H41Report to H4Report: ${error instanceof Error ? error.message : String(error)}`,
          ...(debug && { rawError: String(error) }),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(normalizedData, {
      headers: {
        'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error in report route:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
