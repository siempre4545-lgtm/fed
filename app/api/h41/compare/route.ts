import { NextRequest, NextResponse } from 'next/server';
import type { ParsedTable } from '@/lib/pdf-parser';

/**
 * 두 날짜의 H.4.1 리포트 비교
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const debug = url.searchParams.get('debug') === '1';

    if (!from || !to) {
      return NextResponse.json(
        { ok: false, error: 'from and to parameters are required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // 두 날짜의 리포트 가져오기
    const origin = url.origin;
    const [fromReport, toReport] = await Promise.all([
      fetch(`${origin}/api/h41/report?date=${from}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`${origin}/api/h41/report?date=${to}`, { cache: 'no-store' }).then(r => r.json()),
    ]);

    if (!fromReport.ok || !toReport.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to fetch one or both reports',
          fromError: fromReport.error,
          toError: toReport.error,
        },
        { status: 500 }
      );
    }

    // 비교 데이터 생성
    const comparisons: Array<{
      key: string;
      label: string;
      from: number;
      to: number;
      delta: number;
      deltaPercent: number;
      direction: 'up' | 'down' | 'neutral';
    }> = [];

    // 각 테이블의 동일 키 기준으로 비교
    for (const table of (toReport.tables || []) as ParsedTable[]) {
      const fromTable = (fromReport.tables || [] as ParsedTable[]).find((t: ParsedTable) => t.name === table.name);
      if (!fromTable) continue;

      // 각 행 비교
      for (const toRow of table.rows || []) {
        const fromRow = fromTable.rows?.find((r: Record<string, string | number>) => r.label === toRow.label);
        if (!fromRow) continue;

        // 숫자 필드 찾기
        const numericFields = Object.keys(toRow).filter(
          key => typeof toRow[key] === 'number'
        );

        for (const field of numericFields) {
          const fromValue = fromRow[field] as number || 0;
          const toValue = toRow[field] as number || 0;
          const delta = toValue - fromValue;
          const deltaPercent = fromValue !== 0 ? (delta / fromValue) * 100 : 0;

          comparisons.push({
            key: `${table.name}-${toRow.label}-${field}`,
            label: `${toRow.label} (${field})`,
            from: fromValue,
            to: toValue,
            delta,
            deltaPercent,
            direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral',
          });
        }
      }
    }

    const result = {
      ok: true,
      from: {
        date: from,
        releaseDate: fromReport.releaseDate,
        weekEnded: fromReport.weekEnded,
      },
      to: {
        date: to,
        releaseDate: toReport.releaseDate,
        weekEnded: toReport.weekEnded,
      },
      comparisons,
      ...(debug && {
        meta: {
          comparedAt: new Date().toISOString(),
          comparisonCount: comparisons.length,
          fromTableCount: fromReport.tables?.length || 0,
          toTableCount: toReport.tables?.length || 0,
        },
      }),
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error in compare route:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
