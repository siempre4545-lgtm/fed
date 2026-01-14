/**
 * H.4.1 Latest Release API
 * 최신 release 날짜를 찾아 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { parseDateToISO, formatDateForURL } from '@/lib/h41-parser-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const response = await fetch('https://www.federalreserve.gov/releases/h41/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      cache: 'no-store',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch H.4.1 main page: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // "Latest Release" 링크 찾기
    const latestLink = $('a:contains("Latest Release"), a:contains("Current Release")').first();
    if (latestLink.length === 0) {
      // 날짜 링크 패턴 찾기 (YYYYMMDD 형식)
      const dateLinks = $('a[href*="/releases/h41/"]');
      let latestDate = '';
      
      dateLinks.each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/\/releases\/h41\/(\d{8})\//);
        if (match) {
          const dateStr = match[1];
          if (!latestDate || dateStr > latestDate) {
            latestDate = dateStr;
          }
        }
      });
      
      if (latestDate) {
        // YYYYMMDD -> YYYY-MM-DD
        const formatted = `${latestDate.slice(0, 4)}-${latestDate.slice(4, 6)}-${latestDate.slice(6, 8)}`;
        return NextResponse.json({
          ok: true,
          date: formatted,
        });
      }
      
      throw new Error('Latest release date not found');
    }
    
    const href = latestLink.attr('href') || '';
    const match = href.match(/\/releases\/h41\/(\d{8})\//);
    if (!match) {
      throw new Error('Could not extract date from latest release link');
    }
    
    const dateStr = match[1];
    const formatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    
    return NextResponse.json({
      ok: true,
      date: formatted,
    });
  } catch (error) {
    console.error('[H41 Latest API] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
