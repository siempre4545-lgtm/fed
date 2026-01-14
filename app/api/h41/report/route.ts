import { NextRequest, NextResponse } from 'next/server';
import { parseH41HTML } from '@/lib/h41-parser';

/**
 * 특정 날짜의 H.4.1 리포트 가져오기 및 파싱
 * 기존 HTML 파싱 로직을 재사용하여 안정적인 데이터 추출
 * Node.js 런타임 필수
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // requestId를 함수 상단에서 정의하여 모든 블록에서 접근 가능하도록 함
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

    // 신규 파서 사용 (parseH41HTML)
    // parseH41HTML이 내부에서 날짜 처리를 하므로 직접 전달
    let parsedData;
    try {
      console.log(`[${requestId}] Parsing H.4.1 report for date: ${date}`);
      
      parsedData = await parseH41HTML(date);
      
      if (!parsedData.ok) {
        console.error(`[${requestId}] Parsing failed:`, parsedData.warnings);
        return NextResponse.json(
          {
            ok: false,
            error: `Failed to parse H.4.1 data: ${parsedData.warnings.join('; ')}`,
            ...(debug && { date, warnings: parsedData.warnings }),
          },
          { status: 500 }
        );
      }
      
      if (debug) {
        console.log(`[${requestId}] H.4.1 data parsed:`, {
          releaseDate: parsedData.releaseDate,
          weekEnded: parsedData.weekEnded,
          hasOverview: !!parsedData.sections.overview.totalAssets,
          hasFactors: parsedData.sections.factors.supplying.length > 0,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[${requestId}] Parse error:`, {
        date,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to parse H.4.1 report: ${errorMsg}`,
          ...(debug && { date, errorDetails: errorMsg }),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsedData, {
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
