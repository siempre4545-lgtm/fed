import { NextRequest, NextResponse } from 'next/server';
import { parseFactorsTable1 } from '@/lib/h41-factors-parser';
import { fetchH41Report, getFedReleaseDates } from '@/lib/h41-parser';

/**
 * 준비금 요인 (Factors Affecting Reserve Balances) 전용 API
 * Table 1을 직접 파싱하여 원문과 1:1로 일치하는 데이터 반환
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
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

    // 실제 H.4.1 release 날짜 찾기
    const releaseDates = await getFedReleaseDates();
    
    const findClosestReleaseDate = (targetDate: string, availableDates: string[]): string => {
      if (availableDates.length === 0) return targetDate;
      
      const target = new Date(targetDate);
      let closest: string | null = null;
      let minDiff = Infinity;
      
      if (availableDates.includes(targetDate)) {
        return targetDate;
      }
      
      for (const releaseDate of availableDates) {
        const release = new Date(releaseDate);
        const diff = Math.abs(release.getTime() - target.getTime());
        
        if (diff < minDiff) {
          minDiff = diff;
          closest = releaseDate;
        }
      }
      
      return closest || targetDate;
    };
    
    const actualReleaseDate = findClosestReleaseDate(date, releaseDates);
    
    console.log(`[${requestId}] Fetching factors for date: ${date} -> actual: ${actualReleaseDate}`);
    
    // H.4.1 리포트 가져오기
    let h41Report;
    try {
      h41Report = await fetchH41Report(actualReleaseDate, releaseDates);
      
      if (!h41Report.rawText) {
        throw new Error('rawText not available in H41Report');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[${requestId}] Failed to fetch H.4.1 report:`, errorMsg);
      
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch H.4.1 report: ${errorMsg}`,
          ...(debug && { date, actualReleaseDate }),
        },
        { status: 500 }
      );
    }

    // Table 1 직접 파싱
    let factorsData;
    try {
      factorsData = await parseFactorsTable1(h41Report.rawText, h41Report.sourceUrl);
      
      if (debug) {
        console.log(`[${requestId}] Factors parsed:`, {
          supplyingCount: factorsData.supplying.length,
          absorbingCount: factorsData.absorbing.length,
          totalSupplying: factorsData.totals.totalSupplying.value,
          totalAbsorbing: factorsData.totals.totalAbsorbingExReserves.value,
          reserveBalances: factorsData.totals.reserveBalances.value,
          integrity: factorsData.integrity,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[${requestId}] Failed to parse Table 1:`, errorMsg);
      
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to parse Factors Table 1: ${errorMsg}`,
          ...(debug && { date, actualReleaseDate, stack: error instanceof Error ? error.stack : undefined }),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        ...factorsData,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error) {
    console.error(`[${requestId}] Error in factors route:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
