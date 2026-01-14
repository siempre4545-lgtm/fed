/**
 * H.4.1 Release API
 * 특정 날짜의 H.4.1 HTML을 파싱하여 구조화된 데이터 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseH41HTML } from '@/lib/h41-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  
  if (!date) {
    return NextResponse.json(
      { ok: false, error: 'Date parameter is required (format: YYYY-MM-DD)' },
      { status: 400 }
    );
  }
  
  // 날짜 형식 검증
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid date format. Use YYYY-MM-DD' },
      { status: 400 }
    );
  }
  
  try {
    const data = await parseH41HTML(date);
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('[H41 Release API] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        date,
      },
      { status: 500 }
    );
  }
}
