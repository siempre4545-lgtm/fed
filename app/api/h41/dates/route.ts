import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const FED_BASE_URL = 'https://www.federalreserve.gov/releases/h41/';

interface DateMapping {
  date: string; // YYYY-MM-DD
  pdfUrl: string;
}

/**
 * FED H.4.1 발표일 목록과 PDF URL 매핑 가져오기
 * Feed 우선, HTML 스크래핑 fallback
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const debug = searchParams.get('debug') === '1';

    const dateMappings: DateMapping[] = [];
    const dateSet = new Set<string>();

    // 1. Feed에서 날짜 목록 가져오기 (우선)
    try {
      const feedResponse = await fetch('https://www.federalreserve.gov/feeds/h41.html', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        next: { revalidate: 21600 }, // 6시간 캐시
      });

      if (feedResponse.ok) {
        const feedText = await feedResponse.text();
        const patterns = [
          /\/releases\/h41\/(\d{8})\//g,
          /\/h41\/(\d{8})\//g,
          /h41\/(\d{8})\//g,
        ];

        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(feedText)) !== null) {
            const yyyymmdd = match[1];
            const year = yyyymmdd.substring(0, 4);
            const month = yyyymmdd.substring(4, 6);
            const day = yyyymmdd.substring(6, 8);
            const isoDate = `${year}-${month}-${day}`;

            // 유효한 날짜인지 확인 (현재 연도 - 2년 이상)
            const yearNum = parseInt(year);
            const currentYear = new Date().getFullYear();
            const minYear = currentYear - 2;
            
            if (yearNum >= minYear && yearNum <= 2100 && !dateSet.has(isoDate)) {
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

    // 2. HTML 스크래핑 (fallback)
    if (dateMappings.length === 0) {
      try {
        const response = await fetch(FED_BASE_URL, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          next: { revalidate: 21600 },
        });

        if (response.ok) {
          const html = await response.text();
          const $ = cheerio.load(html);

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

            dateMappings.push({
              date: isoDate,
              pdfUrl: `${FED_BASE_URL}${yyyymmdd}/h41.pdf`,
            });
          });
        }
      } catch (e) {
        console.warn('Failed to fetch HTML:', e);
      }
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
