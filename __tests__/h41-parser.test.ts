/**
 * H.4.1 Parser Unit Tests
 * Fixture 기반 테스트 (네트워크 없음)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as cheerio from 'cheerio';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseH41HTML } from '../lib/h41-parser';
import { getTable1ColumnIndices, pickH41Table } from '../lib/h41-parser-core';

// Fixture 파일 경로
const FIXTURE_DIR = join(process.cwd(), '__tests__', 'fixtures');
const FIXTURE_FILE = join(FIXTURE_DIR, 'h41-20260108.html');

describe('H.4.1 Parser', () => {
  let fixtureHTML: string | null = null;
  
  beforeAll(() => {
    try {
      if (existsSync(FIXTURE_FILE)) {
        fixtureHTML = readFileSync(FIXTURE_FILE, 'utf-8');
      } else {
        console.warn(`Fixture file not found at ${FIXTURE_FILE}, skipping tests`);
      }
    } catch (error) {
      console.warn('Error reading fixture file:', error);
    }
  });
  
  it('should parse overview section with valid data', async () => {
    if (!fixtureHTML) {
      console.warn('Skipping test: fixture not available');
      return;
    }
    
    const result = await parseH41HTML('2026-01-08', fixtureHTML);
    
    expect(result.ok).toBe(true);
    
    // 최소 5개 필드가 null이 아님을 검증
    const nonNullFields = [
      result.sections.overview.totalAssets,
      result.sections.overview.securities,
      result.sections.overview.reserveBalances,
      result.sections.overview.tga,
      result.sections.overview.reverseRepos,
      result.sections.overview.currency,
    ].filter(v => v !== null);
    
    expect(nonNullFields.length).toBeGreaterThanOrEqual(5);
    
    // 컬럼 인덱스 실패 경고가 없어야 함
    const columnIndexFailures = result.warnings.filter(w => 
      w.includes('Column indices FAILED') || w.includes('missing column indices')
    );
    expect(columnIndexFailures.length).toBe(0);
  });
  
  it('should parse factors section with 13 supplying and 4 absorbing items', async () => {
    if (!fixtureHTML) {
      console.warn('Skipping test: fixture not available');
      return;
    }
    
    const result = await parseH41HTML('2026-01-08', fixtureHTML);
    
    expect(result.ok).toBe(true);
    expect(result.sections.factors.supplying.length).toBe(13);
    expect(result.sections.factors.absorbing.length).toBe(4);
    
    // Totals가 최소 1개 이상 number 값이 있어야 함
    const hasValidTotals = 
      result.sections.factors.totals.totalSupplying.value !== null ||
      result.sections.factors.totals.totalAbsorbing.value !== null ||
      result.sections.factors.totals.reserveBalances.value !== null;
    
    expect(hasValidTotals).toBe(true);
  });
  
  it('should not have "table not found" warnings for valid date', async () => {
    if (!fixtureHTML) {
      console.warn('Skipping test: fixture not available');
      return;
    }
    
    const result = await parseH41HTML('2026-01-08', fixtureHTML);
    
    const tableNotFoundWarnings = result.warnings.filter(w => 
      w.includes('table not found') || w.includes('Table not found') || w.includes('Table 1 not found')
    );
    
    expect(tableNotFoundWarnings.length).toBe(0);
  });
  
  describe('getTable1ColumnIndices', () => {
    it('should find column indices from fixture HTML', () => {
      if (!fixtureHTML) {
        console.warn('Skipping test: fixture not available');
        return;
      }
      
      const $ = cheerio.load(fixtureHTML);
      const body = $('body');
      
      // Table 1 찾기
      const table = pickH41Table($, body, [
        'Reserve Bank credit',
        'Total factors supplying reserve funds',
        'Currency in circulation',
        'U.S. Treasury, General Account',
      ]);
      
      expect(table).not.toBeNull();
      expect(table && table.length > 0).toBe(true);
      
      if (table && table.length > 0) {
        const indices = getTable1ColumnIndices($, table);
        
        // 컬럼 인덱스가 모두 찾아져야 함
        expect(indices.valueCol).toBeGreaterThanOrEqual(0);
        expect(indices.weeklyCol).toBeGreaterThanOrEqual(0);
        expect(indices.yearlyCol).toBeGreaterThanOrEqual(0);
        
        // 헤더 텍스트 확인
        const headerRows = table.find('tr').slice(0, 3);
        const headerTexts = Array.from(headerRows).map((row) => {
          const cells = $(row).find('td, th');
          return Array.from(cells).map((cell) => $(cell).text().trim());
        });
        
        // 'Week ended'가 포함된 헤더가 있어야 함
        const hasWeekEnded = headerTexts.some(row => 
          row.some(cell => cell.toLowerCase().includes('week ended'))
        );
        expect(hasWeekEnded).toBe(true);
        
        // 'Change from week ended'가 포함된 헤더가 있어야 함
        const hasChangeFromWeekEnded = headerTexts.some(row => 
          row.some(cell => cell.toLowerCase().includes('change from week ended'))
        );
        expect(hasChangeFromWeekEnded).toBe(true);
      }
    });
  });
});
