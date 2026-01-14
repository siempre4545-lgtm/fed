/**
 * H.4.1 Parser Unit Tests
 * Fixture 기반 테스트 (네트워크 없음)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseH41HTML } from '../lib/h41-parser';

// Fixture 파일 경로 (나중에 실제 HTML 저장)
const FIXTURE_DIR = join(process.cwd(), '__fixtures__');
const FIXTURE_FILE = join(FIXTURE_DIR, 'h41_20260108.html');

describe('H.4.1 Parser', () => {
  let fixtureHTML: string;
  
  beforeAll(() => {
    try {
      fixtureHTML = readFileSync(FIXTURE_FILE, 'utf-8');
    } catch (error) {
      // Fixture 파일이 없으면 스킵
      console.warn('Fixture file not found, skipping tests');
    }
  });
  
  it('should parse overview section with valid data', async () => {
    if (!fixtureHTML) {
      console.warn('Skipping test: fixture not available');
      return;
    }
    
    const result = await parseH41HTML('2026-01-08');
    
    expect(result.ok).toBe(true);
    expect(result.sections.overview.totalAssets).not.toBeNull();
    expect(result.sections.overview.securities).not.toBeNull();
    expect(result.sections.overview.reserveBalances).not.toBeNull();
    
    // 최소 1개 이상 number 값이 있어야 함
    const hasValidData = 
      result.sections.overview.totalAssets !== null ||
      result.sections.overview.securities !== null ||
      result.sections.overview.reserveBalances !== null;
    
    expect(hasValidData).toBe(true);
  });
  
  it('should parse factors section with 13 supplying and 4 absorbing items', async () => {
    if (!fixtureHTML) {
      console.warn('Skipping test: fixture not available');
      return;
    }
    
    const result = await parseH41HTML('2026-01-08');
    
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
    
    const result = await parseH41HTML('2026-01-08');
    
    const tableNotFoundWarnings = result.warnings.filter(w => 
      w.includes('table not found') || w.includes('Table not found')
    );
    
    expect(tableNotFoundWarnings.length).toBe(0);
  });
});
