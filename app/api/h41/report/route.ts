import { NextRequest, NextResponse } from 'next/server';
import { fetchH41Report, getFedReleaseDates } from '../../../src/h41';
import { convertH41ToH4Report } from '@/lib/h41-adapter';

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
    let h41Report;
    try {
      const releaseDates = await getFedReleaseDates();
      h41Report = await fetchH41Report(date, releaseDates);
      
      if (debug) {
        console.log('H41 Report fetched:', {
          releaseDate: h41Report.releaseDateText,
          weekEnded: h41Report.asOfWeekEndedText,
          cardCount: h41Report.cards.length,
          coreCardCount: h41Report.coreCards.length,
        });
      }
    } catch (error) {
      console.error('H41 fetch error:', {
        date,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch H.4.1 report: ${error instanceof Error ? error.message : String(error)}`,
          ...(debug && { date, pdfUrl }),
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
