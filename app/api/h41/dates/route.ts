import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const FED_BASE_URL = 'https://www.federalreserve.gov/releases/h41/';

interface DateMapping {
  date: string; // YYYY-MM-DD
  pdfUrl: string;
}

/**
 * FED H.4.1 발표일 목록과 PDF URL 매핑 가져오기
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const debug = searchParams.get('debug') === '1';

    // 캐시 확인 (6-24시간)
    const cacheKey = 'h41-dates';
    // TODO: 실제 캐시 구현 (Redis 또는 메모리 캐시)

    // FED H.4.1 메인 페이지에서 날짜 목록 추출
    const response = await fetch(FED_BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      next: { revalidate: 21600 }, // 6시간 캐시
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch FED H.4.1 page: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const dateMappings: DateMapping[] = [];
    const dateSet = new Set<string>();

    // HTML에서 날짜와 PDF 링크 추출
    $('a[href*="/h41/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      // /releases/h41/YYYYMMDD/ 패턴 추출
      const match = href.match(/\/h41\/(\d{8})\//);
      if (!match) return;

      const yyyymmdd = match[1];
      const year = yyyymmdd.substring(0, 4);
      const month = yyyymmdd.substring(4, 6);
      const day = yyyymmdd.substring(6, 8);
      const isoDate = `${year}-${month}-${day}`;

      if (dateSet.has(isoDate)) return;
      dateSet.add(isoDate);

      // PDF URL 구성 (일반적으로 h41.pdf 또는 default.pdf)
      const pdfUrl = `${FED_BASE_URL}${yyyymmdd}/h41.pdf`;

      dateMappings.push({
        date: isoDate,
        pdfUrl,
      });
    });

    // Feed에서도 날짜 목록 가져오기 (fallback)
    try {
      const feedResponse = await fetch('https://www.federalreserve.gov/feeds/h41.html', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 21600 },
      });

      if (feedResponse.ok) {
        const feedText = await feedResponse.text();
        const patterns = [
          /\/releases\/h41\/(\d{8})\//g,
          /\/h41\/(\d{8})\//g,
        ];

        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(feedText)) !== null) {
            const yyyymmdd = match[1];
            const year = yyyymmdd.substring(0, 4);
            const month = yyyymmdd.substring(4, 6);
            const day = yyyymmdd.substring(6, 8);
            const isoDate = `${year}-${month}-${day}`;

            if (!dateSet.has(isoDate)) {
              dateSet.add(isoDate);
              dateMappings.push({
                date: isoDate,
                pdfUrl: `${FED_BASE_URL}${yyyymmdd}/h41.pdf`,
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch feed:', e);
    }

    // 날짜순 정렬 (최신순)
    dateMappings.sort((a, b) => b.date.localeCompare(a.date));

    const result = {
      ok: true,
      dates: dateMappings,
      count: dateMappings.length,
      ...(debug && {
        meta: {
          source: 'fed-website',
          fetchedAt: new Date().toISOString(),
        },
      }),
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching dates:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        dates: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
