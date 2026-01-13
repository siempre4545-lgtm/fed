import { NextRequest, NextResponse } from 'next/server';
import { parseH41PDF } from '@/lib/pdf-parser';
import { normalizeH41Data } from '@/lib/pdf-normalizer';

/**
 * 특정 날짜의 H.4.1 리포트 가져오기 및 파싱
 * Node.js 런타임 필수 (PDF 파싱은 Edge에서 지원 안 됨)
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

    // 날짜에서 PDF URL 구성
    const yyyymmdd = date.replace(/-/g, '');
    const pdfUrl = `https://www.federalreserve.gov/releases/h41/${yyyymmdd}/h41.pdf`;

    // PDF 다운로드 (타임아웃 및 재시도)
    let pdfBuffer: Buffer;
    let contentType: string | null = null;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
      
      const pdfResponse = await fetch(pdfUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: controller.signal,
        next: { revalidate: 21600 }, // 6시간 캐시
      });

      clearTimeout(timeoutId);
      contentType = pdfResponse.headers.get('content-type');

      // Content-Type 검증
      if (!pdfResponse.ok || !contentType?.includes('application/pdf')) {
        // fallback: default.pdf 시도
        const fallbackUrl = `https://www.federalreserve.gov/releases/h41/${yyyymmdd}/default.pdf`;
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        if (!fallbackResponse.ok) {
          throw new Error(`PDF not found for date ${date}. Status: ${pdfResponse.status}, Content-Type: ${contentType}`);
        }

        pdfBuffer = Buffer.from(await fallbackResponse.arrayBuffer());
      } else {
        pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      }
    } catch (error) {
      console.error('PDF fetch error:', {
        date,
        pdfUrl,
        contentType,
        error: error instanceof Error ? error.message : String(error),
      });
      
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to fetch PDF: ${error instanceof Error ? error.message : String(error)}`,
          ...(debug && { contentType, pdfUrl }),
        },
        { status: 404 }
      );
    }

    // PDF 파싱
    let parsedData;
    try {
      parsedData = await parseH41PDF(pdfBuffer);
      
      if (debug) {
        console.log('PDF parsed:', {
          releaseDate: parsedData.releaseDate,
          weekEnded: parsedData.weekEnded,
          tableCount: parsedData.tables.length,
          pdfSize: pdfBuffer.length,
        });
      }
    } catch (error) {
      console.error('PDF parse error:', error);
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`,
          ...(debug && { rawError: String(error), pdfSize: pdfBuffer.length }),
        },
        { status: 500 }
      );
    }

    // 정규화된 데이터 생성
    let normalizedData;
    try {
      normalizedData = normalizeH41Data(parsedData, date, pdfUrl);
    } catch (error) {
      console.error('Normalization error:', error);
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to normalize data: ${error instanceof Error ? error.message : String(error)}`,
          ...(debug && { rawError: String(error) }),
        },
        { status: 500 }
      );
    }

    // 디버그 정보 추가
    if (debug) {
      normalizedData.raw = {
        parsedTables: parsedData.tables,
      };
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
