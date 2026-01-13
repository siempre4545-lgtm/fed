import { NextRequest, NextResponse } from 'next/server';
import { parseH41PDF } from '@/lib/pdf-parser';

/**
 * 특정 날짜의 H.4.1 리포트 가져오기 및 파싱
 */
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

    // 날짜에서 PDF URL 구성
    const yyyymmdd = date.replace(/-/g, '');
    const pdfUrl = `https://www.federalreserve.gov/releases/h41/${yyyymmdd}/h41.pdf`;

    // PDF 다운로드
    let pdfBuffer: Buffer;
    try {
      const pdfResponse = await fetch(pdfUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 21600 }, // 6시간 캐시
      });

      if (!pdfResponse.ok) {
        // fallback: default.pdf 시도
        const fallbackUrl = `https://www.federalreserve.gov/releases/h41/${yyyymmdd}/default.pdf`;
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        if (!fallbackResponse.ok) {
          throw new Error(`PDF not found for date ${date}`);
        }

        pdfBuffer = Buffer.from(await fallbackResponse.arrayBuffer());
      } else {
        pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      }
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch PDF: ${error instanceof Error ? error.message : String(error)}`,
        },
        { status: 404 }
      );
    }

    // PDF 파싱
    let parsedData;
    try {
      parsedData = await parseH41PDF(pdfBuffer);
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`,
          ...(debug && { rawError: String(error) }),
        },
        { status: 500 }
      );
    }

    // 정규화된 데이터 반환
    const result = {
      ok: true,
      date,
      pdfUrl,
      releaseDate: parsedData.releaseDate,
      weekEnded: parsedData.weekEnded,
      tables: parsedData.tables,
      ...(debug && {
        meta: {
          parsedAt: new Date().toISOString(),
          pdfSize: pdfBuffer.length,
          tableCount: parsedData.tables.length,
        },
      }),
    };

    return NextResponse.json(result, {
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
