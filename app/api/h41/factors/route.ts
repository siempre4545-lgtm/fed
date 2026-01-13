import { NextRequest, NextResponse } from 'next/server';
import { parseFactorsTable1 } from '@/lib/h41-factors-parser';
import { fetchH41Report, getFedReleaseDates } from '@/lib/h41-parser';

/**
 * 준비금 요인 (Factors Affecting Reserve Balances) 전용 API
 * Table 1을 직접 파싱하여 원문과 1:1로 일치하는 데이터 반환
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get('date') ?? '';
    const debug = url.searchParams.get('debug') === '1';

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
    const debugInfo: any = {
      sourceUrl: h41Report.sourceUrl,
      httpStatus: 200,
      htmlLength: h41Report.rawText?.length || 0,
      sectionFound: false,
      tablesFound: 0,
      rowsSupplying: 0,
      rowsAbsorbing: 0,
      headerMap: {},
    };
    
    try {
      console.log(`[${requestId}] Parsing Table 1. rawText length:`, h41Report.rawText?.length || 0);
      
      if (!h41Report.rawText || h41Report.rawText.length < 100) {
        throw new Error(`rawText is too short or empty: ${h41Report.rawText?.length || 0} chars`);
      }
      
      // 섹션 찾기 확인
      const text = h41Report.rawText.toLowerCase();
      debugInfo.sectionFound = text.includes('factors affecting reserve balances');
      
      // 테이블 개수 확인
      const $ = require('cheerio').load(h41Report.rawText);
      debugInfo.tablesFound = $('table').length;
      
      factorsData = await parseFactorsTable1(h41Report.rawText, h41Report.sourceUrl);
      
      debugInfo.rowsSupplying = factorsData.supplying.length;
      debugInfo.rowsAbsorbing = factorsData.absorbing.length;
      
      // 빈 배열이면 실패로 처리
      if (factorsData.supplying.length === 0 && factorsData.absorbing.length === 0) {
        throw new Error('No factors data parsed: both supplying and absorbing arrays are empty');
      }
      
      // 공식 합계 라벨 파싱 실패 확인: totals 3개가 모두 0이면 실패
      const allTotalsZero = 
        factorsData.totals.totalSupplying.value === 0 &&
        factorsData.totals.totalAbsorbingExReserves.value === 0 &&
        factorsData.totals.reserveBalances.value === 0;
      
      // 항목은 있지만 totals가 모두 0이면 공식 합계 라벨 파싱 실패
      if (allTotalsZero && (factorsData.supplying.length > 0 || factorsData.absorbing.length > 0)) {
        const hasNonZeroItems = 
          factorsData.supplying.some(r => r.value !== 0) ||
          factorsData.absorbing.some(r => r.value !== 0);
        
        if (hasNonZeroItems) {
          throw new Error('Official total labels parsing failed: all totals are 0 but items have non-zero values');
        }
      }
      
      // 모든 값이 0이면 실패로 처리
      const hasNonZeroData = 
        factorsData.totals.totalSupplying.value !== 0 ||
        factorsData.totals.totalAbsorbingExReserves.value !== 0 ||
        factorsData.totals.reserveBalances.value !== 0 ||
        factorsData.supplying.some(r => r.value !== 0) ||
        factorsData.absorbing.some(r => r.value !== 0);
      
      if (!hasNonZeroData) {
        throw new Error('All parsed values are zero - likely parsing failure');
      }
      
      console.log(`[${requestId}] Factors parsed successfully:`, {
        supplyingCount: factorsData.supplying.length,
        absorbingCount: factorsData.absorbing.length,
        totalSupplying: factorsData.totals.totalSupplying.value,
        totalAbsorbing: factorsData.totals.totalAbsorbingExReserves.value,
        reserveBalances: factorsData.totals.reserveBalances.value,
        releaseDate: factorsData.releaseDate,
        weekEnded: factorsData.weekEnded,
      });
      
      if (debug) {
        console.log(`[${requestId}] Full factors data:`, JSON.stringify(factorsData, null, 2));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`[${requestId}] Failed to parse Table 1:`, {
        error: errorMsg,
        stack: errorStack,
        rawTextLength: h41Report.rawText?.length || 0,
        sourceUrl: h41Report.sourceUrl,
        debugInfo,
      });
      
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to parse Factors Table 1: ${errorMsg}`,
          debug: {
            ...debugInfo,
            date,
            actualReleaseDate,
            rawTextPreview: h41Report.rawText?.substring(0, 500) || '',
            stack: errorStack,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        ...factorsData,
        ...(debug && { debug: debugInfo }),
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
