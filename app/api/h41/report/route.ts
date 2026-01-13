import { NextRequest, NextResponse } from 'next/server';
import { convertH41ToH4Report } from '@/lib/h41-adapter';
import { fetchH41Report, getFedReleaseDates } from '@/lib/h41-parser';

/**
 * 특정 날짜의 H.4.1 리포트 가져오기 및 파싱
 * 기존 HTML 파싱 로직을 재사용하여 안정적인 데이터 추출
 * Node.js 런타임 필수
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // requestId를 함수 상단에서 정의하여 모든 블록에서 접근 가능하도록 함
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
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

    // 실제 H.4.1 release 날짜 찾기 (선택한 날짜와 가장 가까운 날짜)
    const releaseDates = await getFedReleaseDates();
    console.log(`[${requestId}] Available dates count: ${releaseDates.length}`);
    
    // 선택한 날짜와 가장 가까운 release 날짜 찾기
    const findClosestReleaseDate = (targetDate: string, availableDates: string[]): string => {
      if (availableDates.length === 0) {
        return targetDate; // fallback to original date
      }
      
      const target = new Date(targetDate);
      let closest: string | null = null;
      let minDiff = Infinity;
      
      // 정확히 일치하는 날짜가 있으면 우선 사용
      if (availableDates.includes(targetDate)) {
        console.log(`[${requestId}] Exact match found: ${targetDate}`);
        return targetDate;
      }
      
      // 가장 가까운 날짜 찾기 (과거 또는 미래 모두 고려)
      for (const releaseDate of availableDates) {
        const release = new Date(releaseDate);
        const diff = Math.abs(release.getTime() - target.getTime());
        
        if (diff < minDiff) {
          minDiff = diff;
          closest = releaseDate;
        }
      }
      
      if (closest) {
        const daysDiff = Math.round(minDiff / (1000 * 60 * 60 * 24));
        console.log(`[${requestId}] Closest release date found: ${closest} (${daysDiff} days from ${targetDate})`);
        return closest;
      }
      
      return targetDate; // fallback
    };
    
    const actualReleaseDate = findClosestReleaseDate(date, releaseDates);
    
    // 날짜에서 PDF URL 구성 (실제 사용된 날짜 기준)
    const yyyymmdd = actualReleaseDate.replace(/-/g, '');
    const pdfUrl = `https://www.federalreserve.gov/releases/h41/${yyyymmdd}/h41.pdf`;

    // 기존 HTML 파싱 로직 사용 (안정적이고 검증됨)
    // 동적 import를 사용하여 src/h41.ts 접근
    let h41Report: any;
    try {
      console.log(`[${requestId}] Fetching H.4.1 report for date: ${date} -> actual release date: ${actualReleaseDate}`);
      
      // 실제 release 날짜로 데이터 가져오기
      h41Report = await fetchH41Report(actualReleaseDate, releaseDates);
      
      // H41Report 형식 검증
      if (!h41Report || !h41Report.cards || !Array.isArray(h41Report.cards)) {
        throw new Error('Invalid H41Report format: missing cards array');
      }
      
      // 데이터 유효성 검증
      const hasValidData = h41Report.cards.some((c: any) => c.balance_musd !== 0 || c.change_musd !== 0);
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

    // H41Report를 H4Report로 변환 (실제 사용된 release 날짜 전달)
    let normalizedData;
    try {
      // 실제 사용된 release 날짜를 reportDate로 사용
      normalizedData = await convertH41ToH4Report(h41Report, actualReleaseDate, pdfUrl);
      
      // meta가 없는 경우 에러 반환
      if (!normalizedData.meta) {
        throw new Error('convertH41ToH4Report returned data without meta field');
      }
      
      // 검증 로그 출력
      console.log(`[${requestId}] H4 Report converted:`, {
        overview: normalizedData.overview ? {
          totalAssets: {
            value: normalizedData.overview.totalAssets.value,
            weeklyChange: normalizedData.overview.totalAssets.weeklyChange,
            yearlyChange: normalizedData.overview.totalAssets.yearlyChange,
          },
          securitiesHeld: {
            value: normalizedData.overview.securitiesHeld.value,
            weeklyChange: normalizedData.overview.securitiesHeld.weeklyChange,
            yearlyChange: normalizedData.overview.securitiesHeld.yearlyChange,
          },
          reserves: {
            value: normalizedData.overview.reserves.value,
            weeklyChange: normalizedData.overview.reserves.weeklyChange,
            yearlyChange: normalizedData.overview.reserves.yearlyChange,
          },
        } : null,
        weekEnded: normalizedData.meta.weekEnded,
        factors: normalizedData.factors ? {
          supplyingCount: normalizedData.factors.supplying.length,
          absorbingCount: normalizedData.factors.absorbing.length,
        } : null,
      });
      
      if (debug) {
        console.log(`[${requestId}] Full H4 Report:`, JSON.stringify(normalizedData, null, 2));
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
