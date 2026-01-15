/**
 * Table 1 컬럼 해석 테스트
 * 병합 헤더(colspan/rowspan) 케이스를 고정 HTML fixture로 테스트
 */

import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { getLeafColumns, resolveTable1Columns, parseNumber } from '../lib/h41-parser-core';

describe('Table 1 Column Resolution', () => {
  // 케이스 A: 병합 헤더 + "Change from week ended" 존재
  const fixtureA = `
    <table>
      <thead>
        <tr>
          <th rowspan="2">Item</th>
          <th colspan="2">Averages of daily figures</th>
          <th colspan="2">Change from week ended</th>
          <th colspan="2">Change from year ago</th>
        </tr>
        <tr>
          <th>Week ended<br>Jan 8, 2026</th>
          <th>Dec 24, 2025</th>
          <th>Dec 24, 2025</th>
          <th>Jan 8, 2025</th>
          <th>Jan 8, 2025</th>
          <th>Jan 8, 2024</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Total factors supplying reserve funds</td>
          <td>8,330,930</td>
          <td>8,250,000</td>
          <td>+80,930</td>
          <td>+100,000</td>
          <td>+200,000</td>
          <td>+300,000</td>
        </tr>
        <tr>
          <td>Securities held outright</td>
          <td>7,500,000</td>
          <td>7,400,000</td>
          <td>+100,000</td>
          <td>+150,000</td>
          <td>+250,000</td>
          <td>+350,000</td>
        </tr>
      </tbody>
    </table>
  `;

  // 케이스 B: change 컬럼이 없고 level 3개(현재/전주/전년)만 있는 케이스
  const fixtureB = `
    <table>
      <thead>
        <tr>
          <th rowspan="2">Item</th>
          <th colspan="3">Averages of daily figures</th>
        </tr>
        <tr>
          <th>Week ended<br>Jan 8, 2026</th>
          <th>Dec 31, 2025</th>
          <th>Jan 8, 2025</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Total factors supplying reserve funds</td>
          <td>8,330,930</td>
          <td>8,250,000</td>
          <td>8,130,930</td>
        </tr>
        <tr>
          <td>Securities held outright</td>
          <td>7,500,000</td>
          <td>7,400,000</td>
          <td>7,250,000</td>
        </tr>
      </tbody>
    </table>
  `;

  it('should extract leaf columns from merged headers (Case A)', () => {
    const $ = cheerio.load(fixtureA);
    const table = $('table');
    const leafCols = getLeafColumns($, table);

    expect(leafCols.length).toBeGreaterThan(0);
    
    // 첫 번째 컬럼은 라벨 컬럼
    expect(leafCols[0].isLabelColumn).toBe(true);
    expect(leafCols[0].headerPath).toContain('Item');
    
    // valueCol 후보: "Week ended" 포함하고 "Change" 미포함
    const valueCol = leafCols.find(l => 
      l.headerPath.toLowerCase().includes('week ended') &&
      !l.headerPath.toLowerCase().includes('change')
    );
    expect(valueCol).toBeDefined();
    expect(valueCol?.colIndex).toBeGreaterThan(0);
  });

  it('should resolve columns in directChange mode (Case A)', () => {
    const $ = cheerio.load(fixtureA);
    const table = $('table');
    const result = resolveTable1Columns($, table, '2026-01-08');

    expect(result.valueCol).toBeGreaterThanOrEqual(0);
    expect(result.mode).toBe('directChange');
    expect(result.weeklyCol).toBeDefined();
    expect(result.yearlyCol).toBeDefined();
    
    // valueCol이 라벨 컬럼이 아닌지 확인
    expect(result.valueCol).not.toBe(0);
    
    // weeklyCol과 yearlyCol이 valueCol과 다른지 확인
    if (result.weeklyCol !== undefined) {
      expect(result.weeklyCol).not.toBe(result.valueCol);
    }
    if (result.yearlyCol !== undefined) {
      expect(result.yearlyCol).not.toBe(result.valueCol);
    }
  });

  it('should resolve columns in computeFromLevels mode (Case B)', () => {
    const $ = cheerio.load(fixtureB);
    const table = $('table');
    const result = resolveTable1Columns($, table, '2026-01-08');

    expect(result.valueCol).toBeGreaterThanOrEqual(0);
    expect(result.mode).toBe('computeFromLevels');
    expect(result.levelPrevWeekCol).toBeDefined();
    expect(result.levelYearAgoCol).toBeDefined();
    
    // valueCol이 라벨 컬럼이 아닌지 확인
    expect(result.valueCol).not.toBe(0);
    
    // level 컬럼들이 valueCol과 다른지 확인
    if (result.levelPrevWeekCol !== undefined) {
      expect(result.levelPrevWeekCol).not.toBe(result.valueCol);
    }
    if (result.levelYearAgoCol !== undefined) {
      expect(result.levelYearAgoCol).not.toBe(result.valueCol);
    }
  });

  it('should compute weekly/yearly from levels correctly (Case B)', () => {
    const $ = cheerio.load(fixtureB);
    const table = $('table');
    const result = resolveTable1Columns($, table, '2026-01-08');

    if (result.mode === 'computeFromLevels' && 
        result.valueCol >= 0 && 
        result.levelPrevWeekCol !== undefined && 
        result.levelYearAgoCol !== undefined) {
      
      // "Total factors supplying reserve funds" 행에서 값 추출
      const rows = table.find('tbody tr');
      const totalRow = rows.filter((_, row) => {
        const firstCell = $(row).find('td').first();
        return firstCell.text().includes('Total factors');
      }).first();

      if (totalRow.length > 0) {
        const cells = totalRow.find('td');
        const valueText = $(cells[result.valueCol]).text().trim();
        const prevWeekText = $(cells[result.levelPrevWeekCol]).text().trim();
        const yearAgoText = $(cells[result.levelYearAgoCol]).text().trim();

        const value = parseNumber(valueText);
        const prevWeek = parseNumber(prevWeekText);
        const yearAgo = parseNumber(yearAgoText);

        expect(value).not.toBeNull();
        expect(prevWeek).not.toBeNull();
        expect(yearAgo).not.toBeNull();

        if (value !== null && prevWeek !== null && yearAgo !== null) {
          const weekly = value - prevWeek;
          const yearly = value - yearAgo;

          // 예상값: 8,330,930 - 8,250,000 = 80,930
          expect(weekly).toBe(80930);
          // 예상값: 8,330,930 - 8,130,930 = 200,000
          expect(yearly).toBe(200000);
        }
      }
    }
  });

  it('should handle headerPath correctly', () => {
    const $ = cheerio.load(fixtureA);
    const table = $('table');
    const leafCols = getLeafColumns($, table);

    // headerPath가 " > "로 구분되어 있는지 확인
    const valueCol = leafCols.find(l => 
      l.headerPath.toLowerCase().includes('week ended') &&
      !l.headerPath.toLowerCase().includes('change')
    );

    if (valueCol) {
      expect(valueCol.headerPath).toContain('Averages of daily figures');
      expect(valueCol.headerPath).toContain('Week ended');
      expect(valueCol.headerTokens.length).toBeGreaterThan(1);
    }
  });
});
