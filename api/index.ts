import express from "express";
import * as cheerio from "cheerio";
import { parseH41Html } from "../lib/h41-parser-fed-report.js";
import { fetchH41Report, toKoreanDigest, ITEM_DEFS, getConcept, getFedReleaseDates } from "../src/h41.js";
import { fetchAllEconomicIndicators, diagnoseEconomicStatus, getIndicatorDetail } from "../src/economic-indicators.js";
import { fetchEconomicNews } from "../src/news.js";
import { fetchAllSecretIndicators, fetchSOFRIORBSpread, fetchSOFRIORBSpreadChartData, generateSOFRIORBSpreadDetailedInterpretation, fetchWRESBALChartData, fetchFRED } from "../src/secret-indicators.js";
import { fetchH41CalendarDates, isoToYmd, ymdToIso, yyyymmddFromISO } from "../src/h41-calendar.js";
import { fetchH41ArchivesBatch, calculateDeltas, ParsedRow } from "../src/h41-archive.js";
import { discoverReleaseDates } from "../src/h41-reverse-probe.js";

const app = express();

// 정적 파일 서빙 (public 폴더)
// Vercel에서는 public 폴더가 자동으로 서빙되므로 필요시에만 사용
// app.use(express.static('public'));

// macro-trace 진입 경로: 정적 페이지로 이동
app.get(["/macro-trace", "/macro-trace/"], (_req, res) => {
  res.redirect("/macro-trace/index.html");
});

// API: Summary (숫자만, 경량화)
app.get("/api/h41/summary", async (req, res) => {
  try {
    const targetDate = req.query.date as string | undefined;
    const report = await fetchH41Report(targetDate);
    
    // 숫자 데이터만 추출 (해석 제외)
    const summary = {
      asOfWeekEndedText: report.asOfWeekEndedText,
      releaseDateText: report.releaseDateText,
      sourceUrl: report.sourceUrl,
      warningLevel: report.warningLevel,
      assetGuidance: report.assetGuidance,
      teamSignal: report.teamSignal,
      cards: report.coreCards.map(c => ({
        key: c.key,
        title: c.title,
        fedLabel: c.fedLabel,
        balance_okeusd: c.balance_okeusd,
        change_okeusd: c.change_okeusd,
        dataDate: c.dataDate,
        liquidityTag: c.liquidityTag,
        // interpretation 제외
      })),
    };
    
    // H.4.1은 주간 업데이트이므로 10분 캐시
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.json(summary);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// API: H.4.1 파싱 (fed_report_sh 통합)
app.get("/api/h41", async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "invalid_date" });
    }

    const compactDate = date.replace(/-/g, "");
    const url = `https://www.federalreserve.gov/releases/h41/${compactDate}/`;
    console.log(`[H41] 선택 날짜=${date}`);
    console.log(`[H41] 요청 URL=${url}`);

    let html = "";
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "FED Dashboard Parser",
        },
      });
      if (!response.ok) {
        return res.status(404).json({ error: "not_found", date, url });
      }
      html = await response.text();
    } catch (error) {
      console.error("[H41] 요청 실패", error);
      return res.status(502).json({ error: "fetch_failed", date, url });
    }

    try {
      const result = parseH41Html(html, date);
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      return res.json({ date, url, ...result });
    } catch (error) {
      console.error("[H41] 파싱 실패", error);
      return res.status(500).json({ error: "parse_failed", date, url });
    }
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// Canonicalize 함수: 라벨을 표준 키로 변환 (서버 사이드)
function canonicalizeItemKey(label: string): string {
  if (!label) return "";
  // 공백/괄호/마침표/유니코드 공백 제거 후 소문자 변환
  const s = label
    .replace(/\u00a0/g, " ") // 유니코드 공백
    .replace(/[()]/g, " ") // 괄호 제거
    .replace(/\./g, " ") // 마침표 제거
    .replace(/\s+/g, " ") // 연속 공백 정리
    .toLowerCase()
    .trim();
  
  // 국채 우선 매칭 (treasury가 general account와 혼동되지 않도록)
  if (s.includes("treasury") && !s.includes("general") && !s.includes("account")) return "treasury";
  if (s.includes("국채")) return "treasury";
  if (s.includes("u.s. treasury") || s.includes("us treasury")) return "treasury";
  if (s.includes("treasury securities")) return "treasury";
  
  // TGA는 treasury보다 먼저 체크 (treasury general account)
  if (s.includes("tga") || (s.includes("treasury") && s.includes("general"))) return "tga";
  
  if (s.includes("mbs") || s.includes("mortgage")) return "mbs";
  if (s.includes("repo") && !s.includes("reverse")) return "repo";
  if (s.includes("loan") || s.includes("대출") || s.includes("primary credit")) return "loans";
  if (s.includes("currency") || s.includes("통화")) return "currency";
  if (s.includes("reverse") && s.includes("repo")) return "rrp";
  if (s.includes("reserve") && s.includes("balance")) return "reserves";
  
  // 이미 canonical key인 경우 그대로 반환
  const canonicalKeys = ["treasury", "mbs", "repo", "loans", "currency", "rrp", "tga", "reserves"];
  if (canonicalKeys.includes(s)) return s;
  
  return s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// API: Interpretation (자산/부채 해석)
app.get("/api/h41/interpretation", async (req, res) => {
  try {
    const targetDate = (req.query.date || req.query.release) as string | undefined;
    const key = req.query.key as string;
    
    if (!key) {
      return res.status(400).json({ error: "key parameter is required" });
    }
    
    // 캐시 헤더 설정
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    
    const report = await fetchH41Report(targetDate);
    
    // Canonical key로 변환
    const canonKey = canonicalizeItemKey(key);
    console.log('[API] INTERP_KEY_RAW:', key, 'INTERP_KEY_CANON:', canonKey);
    
    // key에 따라 해당 카드 찾기 (fedLabel로 매칭)
    const keyToFedLabelMap: Record<string, string> = {
      'treasury': 'U.S. Treasury securities',
      'mbs': 'Mortgage-backed securities',
      'repo': 'Repurchase agreements',
      'loans': 'Primary credit',
      'currency': 'Currency in circulation',
      'rrp': 'Reverse repurchase agreements',
      'tga': 'U.S. Treasury, General Account',
      'reserves': 'Reserve balances with Federal Reserve Banks',
    };
    
    // cards와 coreCards 모두 확인 (국채는 coreCards에 없을 수 있음)
    const allCards = [...(report.cards || []), ...(report.coreCards || [])];
    
    // 사용 가능한 모든 카드 키 로깅
    const availableKeys = allCards.map(c => ({
      key: c.key,
      fedLabel: c.fedLabel,
      title: c.title,
      canon: canonicalizeItemKey(c.fedLabel),
      hasInterp: !!c.interpretation
    }));
    console.log('[API] INTERP_KEYS:', availableKeys);
    
    const targetFedLabel = keyToFedLabelMap[canonKey] || keyToFedLabelMap[key.toLowerCase()];
    
    // 매칭 시도: 1) 정확한 fedLabel 매칭, 2) canonical key로 매칭, 3) fallback
    let card = allCards.find(c => {
      if (targetFedLabel) {
        return c.fedLabel === targetFedLabel;
      }
      // canonical key로 매칭
      const cardCanon = canonicalizeItemKey(c.fedLabel);
      if (cardCanon === canonKey) {
        return true;
      }
      // fallback: key가 fedLabel에 포함되는지 확인
      return c.fedLabel.toLowerCase().includes(key.toLowerCase());
    });
    
    // 국채 특별 처리: treasury로 명시적으로 찾기 (coreCards와 cards 모두 확인)
    if (canonKey === 'treasury' && !card) {
      console.log('[API] TREASURY_INTERP_KEY: searching for treasury with fallback');
      card = allCards.find(c => {
        const fedLabelLower = c.fedLabel.toLowerCase();
        return c.fedLabel === 'U.S. Treasury securities' ||
               fedLabelLower.includes('treasury securities') ||
               (fedLabelLower.includes('treasury') && !fedLabelLower.includes('general') && !fedLabelLower.includes('account'));
      });
      
      if (card) {
        console.log('[API] TREASURY_INTERP_FOUND: matched via fallback', {
          fedLabel: card.fedLabel,
          hasInterp: !!card.interpretation
        });
      } else {
        console.warn('[API] TREASURY_INTERP_MISS: not found even with fallback', {
          canon: canonKey,
          availableLabels: allCards.map(c => c.fedLabel)
        });
      }
    }
    
    if (card) {
      const hasInterp = !!card.interpretation;
      const interpLength = card.interpretation ? card.interpretation.length : 0;
      console.log('[API] INTERP_FOUND:', { 
        key: canonKey, 
        fedLabel: card.fedLabel, 
        hasInterpretation: hasInterp,
        interpretationLength: interpLength,
        interpretationPreview: card.interpretation ? card.interpretation.substring(0, 50) : 'N/A'
      });
      
      // 국채인데 해석이 없으면 에러 로그
      if (canonKey === 'treasury' && !hasInterp) {
        console.error('[API] TREASURY_INTERP_MISSING:', {
          canon: canonKey,
          fedLabel: card.fedLabel,
          availableCards: allCards.map(c => ({ fedLabel: c.fedLabel, hasInterp: !!c.interpretation }))
        });
      }
    } else {
      console.warn('[API] INTERP_TARGET_MISSING:', { 
        key: canonKey, 
        rawKey: key,
        availableLabels: allCards.map(c => c.fedLabel) 
      });
    }
    
    if (!card || !card.interpretation) {
      return res.status(404).json({ 
        error: "Interpretation not found", 
        key: canonKey,
        rawKey: key,
        availableKeys: availableKeys.map(k => k.canon)
      });
    }
    
    res.json({
      interpretation: card.interpretation,
      title: card.title,
      key: canonKey,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// API: Detail (해석만)
app.get("/api/h41/detail", async (req, res) => {
  try {
    const targetDate = req.query.date as string | undefined;
    const key = req.query.key as string;
    
    if (!key) {
      return res.status(400).json({ error: 'key parameter required' });
    }
    
    const report = await fetchH41Report(targetDate);
    const card = report.coreCards.find(c => c.key === key);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.json({
      key: card.key,
      interpretation: card.interpretation,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// API: Weekly Summary (주간 요약 리포트만)
app.get("/api/h41/weekly-summary", async (req, res) => {
  try {
    const targetDate = req.query.date as string | undefined;
    const report = await fetchH41Report(targetDate);
    
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.json({
      summary: report.weeklySummary,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// API: JSON (기존 호환성 유지)
app.get("/api/h41", async (req, res) => {
  try {
    const targetDate = req.query.date as string | undefined;
    const report = await fetchH41Report(targetDate);
    
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// API: 최근 10회분 히스토리 데이터 (디버깅용)
app.get("/api/h41/history", async (req, res) => {
  try {
    const releaseDates = await getFedReleaseDates();
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;
    const datesToFetch = releaseDates.slice(offset, Math.min(offset + limit, releaseDates.length));
    
    const historicalData: Array<{
      date: string;
      assets: { treasury: number; mbs: number; repo: number; loans: number };
      liabilities: { currency: number; rrp: number; tga: number; reserves: number };
      error?: string;
    }> = [];
    
    // 병렬 fetch로 성능 개선 (배치 크기 5)
    const batchSize = 5;
    for (let i = 0; i < datesToFetch.length; i += batchSize) {
      const batch = datesToFetch.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (dateStr) => {
          try {
            const histReport = await fetchH41Report(dateStr, releaseDates);
            
            if (!histReport || !histReport.cards || histReport.cards.length === 0) {
              return {
                date: dateStr,
                assets: { treasury: 0, mbs: 0, repo: 0, loans: 0 },
                liabilities: { currency: 0, rrp: 0, tga: 0, reserves: 0 },
                error: "No cards found"
              };
            }
            
            const histAssets = {
              treasury: histReport.cards.find(c => c.fedLabel === "U.S. Treasury securities")?.balance_musd || 0,
              mbs: histReport.cards.find(c => c.fedLabel === "Mortgage-backed securities")?.balance_musd || 0,
              repo: histReport.cards.find(c => c.fedLabel === "Repurchase agreements")?.balance_musd || 0,
              loans: histReport.cards.find(c => c.fedLabel === "Primary credit")?.balance_musd || 0,
            };
            const histLiabilities = {
              currency: histReport.cards.find(c => c.fedLabel === "Currency in circulation")?.balance_musd || 0,
              rrp: histReport.cards.find(c => c.fedLabel === "Reverse repurchase agreements")?.balance_musd || 0,
              tga: histReport.cards.find(c => c.fedLabel === "U.S. Treasury, General Account")?.balance_musd || 0,
              reserves: histReport.cards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks")?.balance_musd || 0,
            };
            
            const totalAssets = histAssets.treasury + histAssets.mbs + histAssets.repo + histAssets.loans;
            const totalLiabilities = histLiabilities.currency + histLiabilities.rrp + histLiabilities.tga + histLiabilities.reserves;
            
            if (totalAssets === 0 && totalLiabilities === 0) {
              return {
                date: dateStr,
                assets: histAssets,
                liabilities: histLiabilities,
                error: "All values are zero"
              };
            }
            
            return {
              date: dateStr,
              assets: histAssets,
              liabilities: histLiabilities,
            };
          } catch (e) {
            return {
              date: dateStr,
              assets: { treasury: 0, mbs: 0, repo: 0, loans: 0 },
              liabilities: { currency: 0, rrp: 0, tga: 0, reserves: 0 },
              error: e instanceof Error ? e.message : String(e)
            };
          }
        })
      );
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          historicalData.push(result.value);
        } else {
          const dateStr = batch[batchResults.indexOf(result)];
          historicalData.push({
            date: dateStr,
            assets: { treasury: 0, mbs: 0, repo: 0, loans: 0 },
            liabilities: { currency: 0, rrp: 0, tga: 0, reserves: 0 },
            error: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
        }
      });
    }
    
    historicalData.sort((a, b) => b.date.localeCompare(a.date));
    
    // 에러가 있는 항목과 성공한 항목 분리
    const rows = historicalData.filter(d => !d.error);
    const errors = historicalData.filter(d => d.error).map(d => d.error || 'Unknown error');
    const fetchedCount = rows.length;
    const totalAttempts = historicalData.length;
    
    // 고정 스키마: 항상 동일한 형태로 반환 (undefined 금지)
    const response = {
      ok: true,
      releaseDates: Array.isArray(releaseDates) ? releaseDates : [],
      attemptedDates: Array.isArray(datesToFetch) ? datesToFetch : [],
      fetchedCount: Number.isFinite(fetchedCount) ? fetchedCount : 0,
      rows: Array.isArray(rows) ? rows : [],
      errors: Array.isArray(errors) ? errors : [],
      meta: {
        source: 'feed',
        offset: Number.isFinite(offset) ? offset : 0,
        limit: Number.isFinite(limit) ? limit : 10,
        hasMore: offset + limit < releaseDates.length,
        totalAttempts: Number.isFinite(totalAttempts) ? totalAttempts : 0
      }
    };
    
    // H.4.1 히스토리는 주간 업데이트이므로 10분 캐시
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.json(response);
  } catch (e: any) {
    // 에러 상황에서도 고정 스키마로 반환 (undefined 금지)
    const errorMessage = e?.message ?? String(e);
    const errorResponse = {
      ok: false,
      releaseDates: [] as string[],
      attemptedDates: [] as string[],
      fetchedCount: 0,
      rows: [] as any[],
      errors: [errorMessage],
      meta: {
        source: 'error',
        offset: parseInt(req.query.offset as string) || 0,
        limit: parseInt(req.query.limit as string) || 10,
        hasMore: false,
        totalAttempts: 0
      }
    };
    res.status(500).json(errorResponse);
  }
});

// API: H.4.1 releases (역탐색 기반, 페이징 지원)
app.get("/api/h41/releases", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const cursor = req.query.cursor as string | undefined; // ISO 형식 (YYYY-MM-DD) 또는 YYYYMMDD 형식
    const debug = req.query.debug === '1' || req.query.debug === 'true';

    // 역탐색을 통해 실제 존재하는 릴리즈 날짜 수집
    const discoveryResult = await discoverReleaseDates({
      limit: limit + 1, // delta 계산을 위해 limit+1개 가져오기
      startDateISO: cursor ? (cursor.includes('-') ? cursor : ymdToIso(cursor)) : undefined,
      maxLookbackDays: 120,
    });

    const datesISO = discoveryResult.datesISO;

    console.log(`[API /h41/releases] Discovered ${datesISO.length} dates (limit: ${limit}, cursor: ${cursor || 'none'})`);
    console.log(`[API /h41/releases] Top 15 dates:`, datesISO.slice(0, 15));
    
    // 최소 검증: 상위 15개 중에 2026-01-02, 2025-12-29 포함 여부 확인
    const criticalDates = ['2026-01-02', '2025-12-29'];
    const foundCriticalDates = criticalDates.filter(d => datesISO.includes(d));
    console.log(`[API /h41/releases] Critical dates check - Found: [${foundCriticalDates.join(', ')}], Missing: [${criticalDates.filter(d => !datesISO.includes(d)).join(', ')}]`);

    if (datesISO.length === 0) {
      console.error(`[API /h41/releases] No dates discovered from reverse probe`);
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      res.json({
        ok: false,
        dates: [],
        rows: [],
        nextCursor: null,
        errors: ['No dates discovered from reverse probe'],
        meta: { source: 'reverse-probe-error', ...(discoveryResult.debug || {}) }
      });
      return;
    }

    // ISO 형식을 YYYYMMDD 형식으로 변환하여 fetchH41ArchivesBatch에 전달
    const datesToFetch = datesISO.slice(0, limit + 1).map(iso => yyyymmddFromISO(iso));

    console.log(`[API /h41/releases] Fetching ${datesToFetch.length} dates for archive parsing`);
    console.log(`[API /h41/releases] Dates to fetch (YYYYMMDD):`, datesToFetch.slice(0, 10));

    // 병렬로 아카이브 데이터 fetch & parse
    const fetchedRows = await fetchH41ArchivesBatch(datesToFetch, 4);

    console.log(`[API /h41/releases] Fetched ${fetchedRows.length} rows out of ${datesToFetch.length} attempts`);

    // 빈 결과 처리: 최소한 1개는 성공해야 함
    if (fetchedRows.length === 0) {
      console.error(`[API /h41/releases] No rows fetched successfully. All ${datesToFetch.length} dates failed.`);
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      res.json({
        ok: false,
        dates: [],
        rows: [],
        nextCursor: null,
        errors: [`Failed to fetch archive data for all ${datesToFetch.length} dates`],
        meta: { source: 'reverse-probe-error', totalAttempts: datesToFetch.length, ...(discoveryResult.debug || {}) }
      });
      return;
    }

    // Delta 계산 (빈 배열이어도 안전)
    if (fetchedRows.length > 0) {
      calculateDeltas(fetchedRows);
    }

    // limit개만 반환 (마지막 것은 delta 계산용으로만 사용)
    const responseRows = fetchedRows.slice(0, limit);
    const nextCursorISO = discoveryResult.nextCursorISO;

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.json({
      ok: true,
      dates: responseRows.map(r => r.date),
      rows: responseRows,
      nextCursor: nextCursorISO || null, // ISO 형식으로 반환
      errors: [],
      meta: { 
        source: 'reverse-probe', 
        totalAttempts: datesToFetch.length,
        ...(debug && discoveryResult.debug ? discoveryResult.debug : {})
      }
    });

  } catch (e: any) {
    console.error("[API /h41/releases] Error:", e);
    res.status(500).json({
      ok: false,
      dates: [],
      rows: [],
      nextCursor: null,
      errors: [e?.message ?? String(e)],
      meta: { source: 'reverse-probe-error' }
    });
  }
});

// API: 텍스트(알림용)
app.get("/api/h41.txt", async (_req, res) => {
  try {
    const report = await fetchH41Report();
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.send(toKoreanDigest(report));
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// UI: 개선된 대시보드
app.get("/", async (req, res) => {
  try {
    // 날짜 파라미터 확인 (YYYY-MM-DD 형식)
    const targetDate = req.query.date as string | undefined;
    let report: Awaited<ReturnType<typeof fetchH41Report>>;
    try {
      report = await fetchH41Report(targetDate);
    } catch (error: any) {
      // 아카이브 데이터 가져오기 실패 시 에러 메시지 표시
      const errorMessage = error?.message || String(error);
      console.error(`[Dashboard] Failed to fetch H.41 report for date ${targetDate}:`, errorMessage);
      
      // 에러 페이지 렌더링
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>FED H.4.1 대시보드 - 오류</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; }
            .error-container { max-width: 600px; margin: 0 auto; }
            .error-title { font-size: 24px; margin-bottom: 20px; color: #ff6b6b; }
            .error-message { background: #2d2d2d; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .back-link { color: #4dabf7; text-decoration: none; }
            .back-link:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1 class="error-title">데이터를 불러올 수 없습니다</h1>
            <div class="error-message">
              <p>선택한 날짜(${targetDate || 'N/A'})의 FED H.4.1 데이터를 가져오는 중 오류가 발생했습니다.</p>
              <p><strong>오류 내용:</strong> ${escapeHtml(errorMessage)}</p>
              <p>다른 날짜를 선택하거나 최신 데이터를 확인해주세요.</p>
            </div>
            <a href="/" class="back-link">← 대시보드로 돌아가기</a>
          </div>
        </body>
        </html>
      `);
    }
    
    // 병렬 fetch로 성능 개선
    const [releaseDatesResult, indicatorsResult, newsResult, usdKrwResult] = await Promise.allSettled([
      getFedReleaseDates(),
      fetchAllEconomicIndicators().then(indicators => ({
        indicators,
        status: diagnoseEconomicStatus(indicators)
      })).catch(e => {
        console.error("Failed to fetch economic indicators:", e);
        return { indicators: [], status: null };
      }),
      fetchEconomicNews().catch(e => {
        console.error("Failed to fetch economic news:", e);
        return [];
      }),
      (async () => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=2d`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 timeout
          
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
            const data = await response.json();
            const result = data.chart?.result?.[0];
            if (result) {
              const quote = result.indicators?.quote?.[0];
              if (quote) {
                const prices = quote.close.filter((p: number | null) => p !== null);
                if (prices.length >= 2) {
                  const currentPrice = prices[prices.length - 1];
                  const previousPrice = prices[prices.length - 2];
                  const change = currentPrice - previousPrice;
                  const changePercent = (change / previousPrice) * 100;
                  return { price: currentPrice, change, changePercent };
                }
              }
            }
          }
          return null;
        } catch (e) {
          console.error("Failed to fetch USD/KRW rate:", e);
          return null;
        }
      })()
    ]);
    
    // 결과 추출
    const releaseDates = releaseDatesResult.status === 'fulfilled' ? releaseDatesResult.value : [];
    const { indicators, status: economicStatus } = indicatorsResult.status === 'fulfilled' ? indicatorsResult.value : { indicators: [], status: null };
    const economicNews = newsResult.status === 'fulfilled' ? newsResult.value : [];
    const usdKrwRate = usdKrwResult.status === 'fulfilled' ? usdKrwResult.value : null;
    
    const levelText = ["안정", "주의", "경계", "위험"][report.warningLevel];
    const levelColors = ["#22c55e", "#f59e0b", "#f97316", "#ef4444"];
    
    // 신호등 색상 및 상태
    const trafficLightColor = economicStatus 
      ? (economicStatus.status === "green" ? "#22c55e" : economicStatus.status === "yellow" ? "#f59e0b" : "#ef4444")
      : "#808080";
    const trafficLightText = economicStatus
      ? (economicStatus.status === "green" ? "양호" : economicStatus.status === "yellow" ? "주의" : "위험")
      : "데이터 없음";

    // 상단 고정 영역: 경고 레벨 + 가이드 + 청팀/백팀
    const headerSection = `
    <div class="warning-header" style="border-left: 4px solid ${levelColors[report.warningLevel]}">
      <div class="warning-level">
        <span class="level-badge" style="background: ${levelColors[report.warningLevel]}">LEVEL ${report.warningLevel}</span>
        <span class="level-text">${levelText}</span>
        <a href="/levels" class="level-info-link">ℹ️ 레벨 설명 보기</a>
      </div>
      <div class="asset-guidance">${escapeHtml(report.assetGuidance).replace(/\n/g, "<br/>")}</div>
      <div class="team-signal">
        <div class="signal-summary">${escapeHtml(report.teamSignal.summary)}</div>
        <div class="signal-detail">
          <span class="blue-team">청팀: ${escapeHtml(report.teamSignal.blueTeam)}</span>
          <span class="white-team">백팀: ${escapeHtml(report.teamSignal.whiteTeam)}</span>
        </div>
      </div>
    </div>`;

    // 핵심 6개 카드 (클릭 시 확장)
    const cardsHtml = report.coreCards.map((c, idx) => {
      const chSign = c.change_okeusd > 0 ? "+" : c.change_okeusd < 0 ? "-" : "";
      const chColor = c.change_okeusd > 0 ? "#ff6b6b" : c.change_okeusd < 0 ? "#51cf66" : "#adb5bd";
      
      // 유동성 효과를 동적으로 계산
      let liquidityEffect = "";
      if (c.fedLabel === "U.S. Treasury, General Account") {
        // TGA: 증가 → 유동성 흡수, 감소 → 유동성 공급
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 흡수 (정부 자금 모집)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 공급 (정부 지출 확대)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Reverse repurchase agreements") {
        // RRP: 증가 → 유동성 흡수, 감소 → 유동성 공급
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 흡수 (기관 자금 연준 예치)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 공급 (기관 자금 시장 복귀)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Repurchase agreements") {
        // Repo: 증가 → 유동성 공급, 감소 → 유동성 흡수
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 공급 (연준 자금 시장 공급)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 흡수 (연준 자금 회수)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Primary credit") {
        // Primary Credit: 증가 → 유동성 공급, 감소 → 유동성 흡수
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 공급 (연준 융자 확대)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 흡수 (연준 융자 축소)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Securities held outright") {
        // 보유증권: 감소 → QT (유동성 흡수), 증가 → QE (유동성 공급)
        if (c.change_okeusd < 0) {
          liquidityEffect = "QT 진행 (유동성 흡수)";
        } else if (c.change_okeusd > 0) {
          liquidityEffect = "QE 신호 (유동성 공급)";
        } else {
          liquidityEffect = "중립";
        }
      } else if (c.fedLabel === "Currency in circulation") {
        // 통화발행: 증가 → 유동성 흡수 (현금이 시장에서 빠져나감), 감소 → 유동성 공급
        if (c.change_okeusd > 0) {
          liquidityEffect = "유동성 흡수 (현금 발행 증가)";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "유동성 공급 (현금 회수)";
        } else {
          liquidityEffect = "유동성 중립";
        }
      } else if (c.fedLabel === "Reserve balances with Federal Reserve Banks") {
        // 지준금: 시스템 상태 표시
        if (c.change_okeusd > 0) {
          liquidityEffect = "은행 유동성 여유 증가";
        } else if (c.change_okeusd < 0) {
          liquidityEffect = "은행 유동성 여유 감소";
        } else {
          liquidityEffect = "은행 유동성 안정";
        }
      } else {
        // 기본값: 기존 liquidityTag 사용하되 더 명확하게
        if (c.liquidityTag === "흡수(약재)") {
          liquidityEffect = c.change_okeusd > 0 ? "유동성 흡수" : c.change_okeusd < 0 ? "유동성 공급" : "유동성 중립";
        } else if (c.liquidityTag === "공급(해열)") {
          liquidityEffect = c.change_okeusd > 0 ? "유동성 공급" : c.change_okeusd < 0 ? "유동성 흡수" : "유동성 중립";
        } else {
          liquidityEffect = c.liquidityTag;
        }
      }
      
      return `
      <div class="card" data-card-id="${idx}" data-card-key="${escapeHtml(c.key)}">
        <div class="card-header" data-card-toggle="${idx}">
          <div class="k">${c.key}</div>
          <div class="t">${escapeHtml(c.title)}</div>
          <div class="expand-icon" id="expand-icon-${idx}">▼</div>
        </div>
        <div class="card-body">
          <div class="m">
            <div><b>잔액</b> : <span class="highlight-number">$${c.balance_okeusd.toFixed(1)}억</span></div>
            <div><b>변동</b> : <span style="color: ${chColor};font-weight:700">${chSign}$${Math.abs(c.change_okeusd).toFixed(1)}억</span></div>
            <div class="tag">${escapeHtml(liquidityEffect)}</div>
            <div class="data-date">데이터 기준: ${escapeHtml(c.dataDate)}</div>
          </div>
          <div class="card-expanded" id="card-expanded-${idx}">
            <div class="expanded-section">
              <div class="expanded-label">지난주 대비</div>
              <div class="expanded-value" style="color: ${chColor};font-weight:700">${chSign}$${Math.abs(c.change_okeusd).toFixed(1)}억</div>
            </div>
            <div class="i" id="interpretation-${idx}">
              <div class="interpretation-label">해석</div>
              <div class="interpretation-text" id="interpretation-text-${idx}">
                <div style="color: #808080; font-style: italic;">로딩 중...</div>
              </div>
            </div>
          </div>
        </div>
        <div class="s">${escapeHtml(c.fedLabel)}</div>
      </div>`;
    }).join("\n");

    // 종합 QT/QE 평가 계산
    const securities = report.coreCards.find(c => c.fedLabel === "Securities held outright");
    const reserves = report.coreCards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks");
    const tga = report.coreCards.find(c => c.fedLabel === "U.S. Treasury, General Account");
    const rrp = report.coreCards.find(c => c.fedLabel === "Reverse repurchase agreements");
    const repo = report.coreCards.find(c => c.fedLabel === "Repurchase agreements");
    const primaryCredit = report.coreCards.find(c => c.fedLabel === "Primary credit");

    let qtScore = 0;
    let qeScore = 0;

    if (securities) {
      if (securities.change_musd < -20000) qtScore += 2;
      else if (securities.change_musd < -5000) qtScore += 1;
      else if (securities.change_musd > 20000) qeScore += 2;
      else if (securities.change_musd > 5000) qeScore += 1;
    }

    if (reserves) {
      if (reserves.change_musd < -50000) qtScore += 1;
      else if (reserves.change_musd > 50000) qeScore += 1;
    }

    if (tga && tga.change_musd > 50000) qtScore += 1;
    if (rrp && rrp.change_musd > 30000) qtScore += 1;
    if (repo && repo.change_musd > 10000) qeScore += 1;
    if (primaryCredit && primaryCredit.change_musd > 5000) qeScore += 1;

    let overallSignal: "QT" | "QE" | "중립" = "중립";
    let signalColor = "#adb5bd";
    let signalText = "중립";
    
    if (qtScore > qeScore && qtScore >= 2) {
      overallSignal = "QT";
      signalColor = "#ff6b6b";
      signalText = "양적긴축(QT)";
    } else if (qeScore > qtScore && qeScore >= 2) {
      overallSignal = "QE";
      signalColor = "#51cf66";
      signalText = "양적완화(QE)";
    }

    // 종합 QT/QE 평가 상세 설명 생성
    let qtQeAnalysis = "";
    if (overallSignal === "QT") {
      const securitiesChange = securities ? securities.change_okeusd : 0;
      const reservesChange = reserves ? reserves.change_okeusd : 0;
      qtQeAnalysis = `
        <div class="qt-qe-analysis">
          <p><strong>연준의 양적긴축(QT)이 진행 중입니다.</strong> 보유증권 총계가 ${securitiesChange > 0 ? "증가" : "감소"}(${Math.abs(securitiesChange).toFixed(1)}억 달러)하고 있으며, 지준금이 ${reservesChange > 0 ? "증가" : "감소"}(${Math.abs(reservesChange).toFixed(1)}억 달러)하고 있습니다. 연준의 대차대조표 축소는 시중 유동성을 흡수하여 자금 시장의 금리 상승 압력과 자산 가격 조정 압력으로 작용합니다.</p>
          <p>연준은 FOMC 회의록과 연준 의장의 연설을 통해 QT 속도와 규모를 조절하고 있으며, 금융 시장의 스트레스 지표(SOFR, Libor-OIS 스프레드 등)를 모니터링하면서 QT 진행 속도를 조정할 수 있습니다. 현재 QT 진행 상황은 연준의 통화정책 정상화 과정의 일환으로, 인플레이션 관리와 금융 안정성 사이의 균형을 유지하기 위한 노력으로 해석됩니다.</p>
        </div>`;
    } else if (overallSignal === "QE") {
      const securitiesChange = securities ? securities.change_okeusd : 0;
      const reservesChange = reserves ? reserves.change_okeusd : 0;
      qtQeAnalysis = `
        <div class="qt-qe-analysis">
          <p><strong>연준의 양적완화(QE) 신호가 관측되고 있습니다.</strong> 보유증권 총계가 ${securitiesChange > 0 ? "증가" : "감소"}(${Math.abs(securitiesChange).toFixed(1)}억 달러)하고 있으며, 지준금이 ${reservesChange > 0 ? "증가" : "감소"}(${Math.abs(reservesChange).toFixed(1)}억 달러)하고 있습니다. 연준의 대차대조표 확대는 시장 유동성 공급을 늘려 자금 시장의 금리 하락 압력과 자산 가격 상승 요인으로 작용할 수 있습니다.</p>
          <p>연준이 QE를 재개하거나 QT를 중단하는 경우, 이는 금융 시장의 스트레스 완화나 경제 성장 지원을 위한 통화정책 전환 신호로 해석될 수 있습니다. 연준의 FOMC 성명과 연준 의장의 연설을 통해 정책 의도를 파악할 수 있으며, 대차대조표 변화 추세와 금융 시장 지표를 함께 모니터링하는 것이 중요합니다.</p>
        </div>`;
    } else {
      const securitiesChange = securities ? securities.change_okeusd : 0;
      const reservesChange = reserves ? reserves.change_okeusd : 0;
      qtQeAnalysis = `
        <div class="qt-qe-analysis">
          <p><strong>현재 양적정책은 중립적 수준을 유지하고 있습니다.</strong> 보유증권 총계가 ${securitiesChange > 0 ? "증가" : securitiesChange < 0 ? "감소" : "변동없음"}(${Math.abs(securitiesChange).toFixed(1)}억 달러)하고 있으며, 지준금이 ${reservesChange > 0 ? "증가" : reservesChange < 0 ? "감소" : "변동없음"}(${Math.abs(reservesChange).toFixed(1)}억 달러)하고 있습니다. 연준의 대차대조표 변화가 제한적이어서 시장 유동성에 미치는 영향이 중립적입니다.</p>
          <p>연준은 FOMC 회의록과 연준 의장의 연설을 통해 양적정책의 방향성을 제시하고 있으며, 현재는 QT 진행 속도를 조절하거나 일시적으로 정지하는 단계일 수 있습니다. 금융 시장의 스트레스 지표와 경제 지표를 모니터링하면서 향후 정책 방향을 결정할 것으로 예상됩니다.</p>
        </div>`;
    }

    // 종합 QT/QE 평가 섹션
    const qtQeSummarySection = `
    <div class="qt-qe-summary">
      <div class="qt-qe-header">
        <h2>종합 QT/QE 평가 📊</h2>
      </div>
      <div class="qt-qe-content">
        <div class="qt-qe-main" style="border-left: 4px solid ${signalColor}">
          <div class="qt-qe-label">현재 유동성 정책 방향</div>
          <div class="qt-qe-value" style="color: ${signalColor}">${signalText}</div>
          <div class="qt-qe-detail">
            ${overallSignal === "QT" ? "연준의 양적긴축(QT)이 진행 중이에요. 시장 유동성이 흡수되고 있어서, 자산 가격에 압박이 가해질 수 있습니다." : 
              overallSignal === "QE" ? "연준의 양적완화(QE) 신호가 보여요. 시장 유동성 공급이 확대되고 있어서, 자산 가격 상승 여지가 생길 수 있습니다." : 
              "현재 양적정책은 중립적 수준을 유지하고 있어요. 큰 변화 없이 안정적으로 흐르고 있습니다."}
          </div>
          ${qtQeAnalysis}
        </div>
      </div>
    </div>`;

    // 주간 요약 리포트는 lazy load로 변경 (초기 HTML에서 제거하여 payload 축소)
    const weeklyReportSection = `
    <div class="weekly-report">
      <div class="report-header" data-report-toggle>
        <h2>주간 요약 리포트 📄</h2>
        <div class="expand-icon" id="report-icon">▼</div>
      </div>
      <div class="report-content" id="report-content">
        <div style="color: #808080; font-style: italic; padding: 20px; text-align: center;">클릭하여 리포트 로드</div>
      </div>
    </div>`;

    // Info 접힘 영역
    const infoSection = `
    <div class="info-section">
      <div class="info-header" data-info-toggle>
        <span class="info-icon">ℹ️</span>
        <span>이 페이지는 무엇을 알려주는가?</span>
        <div class="expand-icon" id="info-icon">▼</div>
      </div>
      <div class="info-content" id="info-content">
        <p>이 페이지는 FED 대차대조표(H.4.1)를 통해 '유동성 환경'을 읽고 '자산군에 유리한 방향'을 해석하는 도구예요. 거대 자본가들이 어떻게 움직이는지, 그리고 당신의 포트폴리오를 어떻게 조정해야 하는지 알려드립니다.</p>
        <p><strong>투자 유의:</strong> 특정 종목을 추천하는 게 아니라, 거시 환경을 해석하는 참고 자료예요. 이 정보를 바탕으로 스스로 판단하셔야 합니다.</p>
      </div>
    </div>`;

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>FED H.4.1 유동성 대시보드</title>
  <script src="/toggles.js" defer></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100;display:flex;justify-content:space-between;align-items:flex-start}
    .page-header-content{flex:1}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    
    /* 날짜 선택기 */
    .date-selector{margin-top:12px;display:flex;align-items:center;gap:8px}
    .date-selector label{font-size:13px;color:#c0c0c0}
    .date-selector input[type="date"]{padding:6px 12px;border:1px solid #2d2d2d;border-radius:6px;background:#1f1f1f;color:#ffffff;font-size:13px;cursor:pointer}
    .date-selector input[type="date"]:hover{border-color:#3d3d3d}
    .date-selector input[type="date"]:focus{outline:none;border-color:#4dabf7}
    .date-selector button{padding:6px 16px;border:1px solid #4dabf7;border-radius:6px;background:#4dabf7;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s}
    .date-selector button:hover{background:#74c0fc;border-color:#74c0fc}
    .date-selector .reset-btn{padding:6px 12px;border:1px solid #2d2d2d;background:transparent;color:#808080}
    .date-selector .reset-btn:hover{background:#2d2d2d;color:#c0c0c0}
    
    /* 신호등 UI */
    .header-right-buttons{display:flex;gap:12px;align-items:flex-start;flex-shrink:0}
    .traffic-light-container{position:relative}
    .traffic-light-link{display:flex;flex-direction:column;align-items:center;text-decoration:none;padding:12px 16px;border-radius:12px;background:#1f1f1f;border:1px solid #2d2d2d;transition:all 0.2s;min-width:80px}
    .traffic-light-link:hover{background:#252525;border-color:#3d3d3d;transform:translateY(-2px)}
    .traffic-light-circle{width:32px;height:32px;border-radius:50%;margin-bottom:8px;box-shadow:0 0 12px rgba(0,0,0,0.3),inset 0 2px 4px rgba(255,255,255,0.1)}
    .traffic-light-label{font-size:12px;font-weight:600;color:#c0c0c0;text-align:center}
    .traffic-light-score{font-size:10px;color:#808080;margin-top:4px}
    
    .warning-header{padding:24px;border-bottom:1px solid #2d2d2d;margin:0;background:#1a1a1a;margin-bottom:24px}
    .warning-level{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
    .level-badge{padding:6px 14px;border-radius:6px;font-weight:700;font-size:13px;color:#ffffff}
    .level-text{font-size:18px;font-weight:700;color:#ffffff}
    .level-info-link{font-size:12px;color:#4dabf7;text-decoration:none;margin-left:auto;padding:4px 8px;border-radius:4px;transition:background 0.2s;font-weight:500}
    .level-info-link:hover{background:#2d2d2d;text-decoration:none;color:#74c0fc}
    .asset-guidance{font-size:14px;line-height:1.8;margin-bottom:16px;white-space:pre-line;color:#c0c0c0}
    .team-signal{margin-top:16px;padding-top:16px;border-top:1px solid #2d2d2d}
    .signal-summary{font-size:15px;font-weight:700;margin-bottom:10px;color:#ffffff}
    .signal-detail{display:flex;gap:20px;font-size:13px;color:#c0c0c0}
    .blue-team{color:#4dabf7;font-weight:600}
    .white-team{color:#ffd43b;font-weight:600}
    
    /* 뉴스 섹션 */
    .news-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:20px;margin:0 24px 24px 24px}
    .news-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #2d2d2d}
    .news-title{font-size:16px;font-weight:700;color:#ffffff}
    .news-count{font-size:12px;color:#808080;background:#2d2d2d;padding:4px 10px;border-radius:6px}
    .news-list{display:flex;flex-direction:column;gap:12px}
    .news-item{padding:12px;background:#1a1a1a;border-radius:8px;border:1px solid #2d2d2d;transition:all 0.2s}
    .news-item:hover{background:#252525;border-color:#3d3d3d}
    .news-content{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .news-text{flex:1;font-size:14px;line-height:1.6;color:#c0c0c0}
    .news-source{font-size:12px;color:#808080;white-space:nowrap;padding:4px 8px;background:#2d2d2d;border-radius:4px}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-bottom:32px}
    .card{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;overflow:hidden;transition:all 0.2s}
    .card:hover{border-color:#3d3d3d}
    .card-header{display:flex;align-items:flex-start;gap:12px;padding:20px;cursor:pointer;user-select:none}
    .card-header:hover{background:#252525}
    .expand-icon{font-size:12px;color:#808080;margin-left:auto;transition:transform 0.2s}
    .card.expanded .expand-icon{transform:rotate(180deg);color:#4dabf7}
    .card-body{padding:0 20px 20px}
    .k{font-size:12px;color:#808080;font-weight:600}
    .t{font-size:16px;font-weight:700;margin-top:6px;line-height:1.4;flex:1;color:#ffffff}
    .m{margin-top:16px;font-size:14px;line-height:1.8;color:#c0c0c0}
    .m div{margin-bottom:8px}
    .m b{color:#ffffff;font-weight:700}
    .highlight-number{color:#4dabf7;font-weight:700;font-size:15px}
    .tag{display:inline-block;margin-top:10px;padding:4px 12px;border-radius:6px;background:#2d2d2d;color:#c0c0c0;font-size:12px;font-weight:500}
    .data-date{margin-top:12px;font-size:12px;color:#808080}
    .card-expanded{display:none !important;margin-top:20px;padding-top:20px;border-top:1px solid #2d2d2d}
    .card.expanded .card-expanded{display:block !important}
    .expanded-section{margin-bottom:16px}
    .expanded-label{font-size:12px;color:#808080;margin-bottom:6px;font-weight:500}
    .expanded-value{font-size:16px;font-weight:700;color:#ffffff}
    .i{margin-top:20px;padding-top:20px;border-top:1px solid #2d2d2d}
    .interpretation-label{font-size:12px;font-weight:600;color:#808080;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px}
    .interpretation-text{font-size:14px;line-height:1.8;color:#c0c0c0}
    .interpretation-headline{margin-bottom:12px;font-size:15px;font-weight:700;color:#ffffff}
    .interpretation-headline strong{color:#ffffff;font-weight:700}
    .interpretation-body{font-size:14px;line-height:1.8;color:#c0c0c0;white-space:normal;word-wrap:break-word;font-weight:400}
    .interpretation-body *{font-weight:400 !important}
    .s{margin-top:16px;padding-top:16px;border-top:1px solid #2d2d2d;font-size:12px;color:#808080}
    
    .footer-links{display:flex;gap:20px;justify-content:center;margin-top:40px;padding:20px;border-top:1px solid #2d2d2d}
    .footer-link-item{font-size:13px}
    .footer-link-item a{color:#4dabf7;text-decoration:none;font-weight:500}
    .footer-link-item a:hover{text-decoration:underline;color:#74c0fc}
    
    .qt-qe-summary{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;margin:32px 0;overflow:hidden}
    .qt-qe-header{padding:20px;border-bottom:1px solid #2d2d2d}
    .qt-qe-header h2{margin:0;font-size:18px;font-weight:700;color:#ffffff}
    .qt-qe-content{padding:20px}
    .qt-qe-main{padding:20px;background:#252525;border-radius:8px}
    .qt-qe-label{font-size:12px;color:#808080;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .qt-qe-value{font-size:24px;font-weight:700;margin-bottom:12px}
    .qt-qe-detail{font-size:14px;line-height:1.7;color:#c0c0c0;margin-bottom:16px}
    .qt-qe-analysis{margin-top:20px;padding-top:20px;border-top:1px solid #2d2d2d}
    .qt-qe-analysis p{font-size:14px;line-height:1.8;color:#c0c0c0;margin-bottom:12px}
    .qt-qe-analysis p strong{color:#ffffff;font-weight:700}
    
    .weekly-report{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;margin:40px 0;overflow:hidden}
    .report-header{display:flex;align-items:center;justify-content:space-between;padding:20px;cursor:pointer;user-select:none;border-bottom:1px solid #2d2d2d}
    .report-header:hover{background:#252525}
    .report-header h2{margin:0;font-size:18px;font-weight:700;color:#ffffff}
    .report-content{display:none;padding:20px}
    .weekly-report.expanded .report-content{display:block}
    .weekly-report.expanded .expand-icon{transform:rotate(180deg);color:#4dabf7}
    .report-main-phrase{font-size:20px;font-weight:700;color:#ffffff;margin-bottom:20px;padding:16px;background:#252525;border-radius:8px;border-left:4px solid #4dabf7;line-height:1.5}
    .report-text{font-size:14px;line-height:1.9;white-space:pre-line}
    .report-section-title{margin-top:20px;margin-bottom:12px;font-weight:700;font-size:16px;color:#ffffff}
    .report-bullet{margin-bottom:8px;padding-left:8px;color:#c0c0c0;line-height:1.7}
    .report-sub-bullet{margin-bottom:4px;padding-left:24px;color:#808080;font-size:13px;line-height:1.6}
    .report-paragraph{margin-bottom:12px;color:#c0c0c0;line-height:1.8}
    .report-text strong{color:#ffffff;font-weight:700}
    
    .info-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;margin:20px 0;overflow:hidden}
    .info-header{display:flex;align-items:center;gap:10px;padding:16px 20px;cursor:pointer;user-select:none;font-size:14px;font-weight:500;color:#ffffff;border-bottom:1px solid #2d2d2d}
    .info-header:hover{background:#252525}
    .info-icon{font-size:18px}
    .info-content{display:none;padding:20px;font-size:14px;line-height:1.8;color:#c0c0c0}
    .info-content p{margin-bottom:12px}
    .info-content strong{color:#ffffff;font-weight:700}
    .info-section.expanded .info-content{display:block}
    .info-section.expanded .expand-icon{transform:rotate(180deg);color:#4dabf7}
    
    @media (max-width: 768px) {
      .cards-grid{grid-template-columns:1fr}
      .signal-detail{flex-direction:column;gap:8px}
      .page-header{flex-direction:column;align-items:stretch}
      .header-right-buttons{margin-top:16px;justify-content:center;gap:8px}
      .traffic-light-container{flex:1;max-width:calc(50% - 4px)}
      .traffic-light-link{padding:10px 12px;min-width:auto}
      .traffic-light-circle{width:28px;height:28px;margin-bottom:6px}
      .traffic-light-label{font-size:11px}
      .traffic-light-score{font-size:9px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <div class="page-header-content">
      <h1>FED H.4.1 유동성 대시보드 🎯</h1>
      <div class="sub">
        Release: ${escapeHtml(report.releaseDateText)} · Week ended: ${escapeHtml(report.asOfWeekEndedText)}<br/>
        <a href="/concepts" style="font-weight:600">계정항목 알아보기 📋</a> · 
        <a href="/interest-rate-schedule" style="font-weight:600">2026년 금리 발표 일정 📅</a>
      </div>
      ${usdKrwRate ? `
      <div class="exchange-rate-container">
        <span class="exchange-rate-label">💵 USD/KRW:</span>
        <span class="exchange-rate-value" id="exchangeRateValue">${usdKrwRate.price.toFixed(2)}</span>
        <span class="exchange-rate-change ${usdKrwRate.change > 0 ? 'exchange-rate-up' : usdKrwRate.change < 0 ? 'exchange-rate-down' : 'exchange-rate-neutral'}" id="exchangeRateChange">
          ${usdKrwRate.change > 0 ? '📈' : usdKrwRate.change < 0 ? '📉' : '➡️'} ${usdKrwRate.change > 0 ? '+' : ''}${usdKrwRate.change.toFixed(2)} (${usdKrwRate.changePercent > 0 ? '+' : ''}${usdKrwRate.changePercent.toFixed(2)}%)
        </span>
        <button class="exchange-rate-refresh" id="exchangeRateRefresh" onclick="refreshExchangeRate()" title="환율 새로고침">
          🔄
        </button>
      </div>
      ` : ''}
      <div class="date-selector">
        <label for="dateInput">FED 발표 날짜 선택:</label>
        <input type="date" id="dateInput" value="${targetDate || ''}" style="padding:6px 12px;border:1px solid #2d2d2d;border-radius:6px;background:#1f1f1f;color:#ffffff;font-size:13px;cursor:pointer" />
        <button onclick="loadDate()">조회</button>
        ${targetDate ? `<button class="reset-btn" onclick="resetDate()">초기화</button>` : ''}
      </div>
    </div>
    <div class="header-right-buttons">
      <div class="traffic-light-container">
        <a href="/economic-indicators" class="traffic-light-link" title="${economicStatus ? escapeHtml(economicStatus.summary) : "경제 지표 데이터를 불러오는 중..."}">
          <div class="traffic-light-circle" style="background:${trafficLightColor}"></div>
          <div class="traffic-light-label">경제 진단</div>
          <div class="traffic-light-label" style="color:${trafficLightColor};font-weight:700">${trafficLightText}</div>
          ${economicStatus ? `<div class="traffic-light-score">점수: ${economicStatus.score}/100</div>` : ""}
        </a>
      </div>
      <div class="traffic-light-container">
        <a href="/macro-trace" class="traffic-light-link" title="목금월 루틴 워크북">
          <div class="traffic-light-circle" style="background:linear-gradient(135deg,#22d3ee 0%,#38bdf8 100%)"></div>
          <div class="traffic-light-label">목금월</div>
          <div class="traffic-light-label" style="color:#38bdf8;font-weight:700">루틴</div>
          <div class="traffic-light-score">워크북</div>
        </a>
      </div>
      <div class="traffic-light-container">
        <a href="/secret-indicators" class="traffic-light-link" title="자본주의 내부 신경계를 해부하는 12개 선행 지표">
          <div class="traffic-light-circle" style="background:linear-gradient(135deg,#8b5cf6 0%,#6366f1 100%)"></div>
          <div class="traffic-light-label">비밀지표</div>
          <div class="traffic-light-label" style="color:#a78bfa;font-weight:700">12개</div>
          <div class="traffic-light-score">선행지표</div>
        </a>
      </div>
      <div class="traffic-light-container">
        <a href="/fed_report_sh" class="traffic-light-link" title="FED H.4.1 상세 대시보드">
          <div class="traffic-light-circle" style="background:linear-gradient(135deg,#4dabf7 0%,#339af0 100%)"></div>
          <div class="traffic-light-label">fed_dashboard</div>
        </a>
      </div>
    </div>
  </div>
  
  ${headerSection}
  
  <div class="main-content">
    <div class="cards-grid">
      ${cardsHtml}
    </div>
    
    ${qtQeSummarySection}
    
    ${weeklyReportSection}
    
    ${infoSection}
    
    <div class="footer-links">
      <div class="footer-link-item">
        <a href="/api/h41">API (JSON)</a>
      </div>
      <div class="footer-link-item">
        <a href="/api/h41.txt">알림용 텍스트</a>
      </div>
    </div>
  </div>
  
  <script>
    function loadDate() {
      const dateInput = document.getElementById('dateInput');
      const selectedDate = dateInput ? dateInput.value : null;
      if (selectedDate) {
        window.location.href = '/?date=' + selectedDate;
      } else {
        window.location.href = '/';
      }
    }
    
    function resetDate() {
      window.location.href = '/';
    }
    
    async function refreshExchangeRate() {
      const refreshBtn = document.getElementById('exchangeRateRefresh');
      const valueEl = document.getElementById('exchangeRateValue');
      const changeEl = document.getElementById('exchangeRateChange');
      
      if (!refreshBtn || !valueEl || !changeEl) return;
      
      refreshBtn.classList.add('loading');
      refreshBtn.disabled = true;
      
      try {
        const response = await fetch('/api/exchange-rate');
        if (response.ok) {
          const data = await response.json();
          if (data.price) {
            valueEl.textContent = data.price.toFixed(2);
            const changeSign = data.change > 0 ? '+' : '';
            const changePercentSign = data.changePercent > 0 ? '+' : '';
            const emoji = data.change > 0 ? '📈' : data.change < 0 ? '📉' : '➡️';
            const changeClass = data.change > 0 ? 'exchange-rate-up' : data.change < 0 ? 'exchange-rate-down' : 'exchange-rate-neutral';
            changeEl.className = 'exchange-rate-change ' + changeClass;
            changeEl.innerHTML = emoji + ' ' + changeSign + data.change.toFixed(2) + ' (' + changePercentSign + data.changePercent.toFixed(2) + '%)';
          }
        }
      } catch (error) {
        console.error('Failed to refresh exchange rate:', error);
      } finally {
        refreshBtn.classList.remove('loading');
        refreshBtn.disabled = false;
      }
    }
    
    function toggleNews() {
      const newsList = document.getElementById('newsList');
      const newsToggle = document.getElementById('newsToggle');
      if (newsList && newsToggle) {
        newsList.classList.toggle('expanded');
        newsToggle.textContent = newsList.classList.contains('expanded') ? '숨기기' : '더보기';
      }
    }
    
    // 토글 바인딩은 /toggles.js에서 처리
    
  </script>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// 레벨 설명 페이지
app.get("/levels", async (_req, res) => {
  try {
      const levelDescriptions = {
      0: {
        title: "LEVEL 0 - 안정",
        emoji: "✅",
        description: "유동성 환경이 안정적인 국면이에요.",
        details: [
          "성장주, 기술주, 장기 테마 자산에 대한 비중을 늘릴 수 있는 구간이에요. 거대 자본가들도 이런 시점에 성장 자산의 비중을 늘립니다.",
          "시장 유동성 공급이 흡수 요인을 상쇄하고 있어서, 자산 가격에 긍정적 영향을 줄 수 있는 환경이에요.",
          "고변동성 자산의 상승 여력이 충분해요. 리스크 관리보다는 성장 포트폴리오를 확대하는 데 집중하는 게 좋을 것 같아요."
        ]
      },
      1: {
        title: "LEVEL 1 - 주의",
        emoji: "⚠️",
        description: "유동성 흡수 신호가 일부 보여요.",
        details: [
          "공격적 자산 비중은 유지하되, 변동성 확대에 대비해서 분산하는 게 좋아요. 거대 자본가들도 이런 시점을 '관찰 모드'로 보고 있어요.",
          "일부 유동성 압박 신호가 보이지만, 전반적으로는 안정적인 수준을 유지하고 있어요.",
          "성장 자산과 방어 자산의 균형을 유지하면서 점진적으로 포트폴리오를 조정하는 게 좋을 것 같아요."
        ]
      },
      2: {
        title: "LEVEL 2 - 경계",
        emoji: "🔶",
        description: "유동성 압박이 가시화되고 있어요.",
        details: [
          "방어적 자산과 현금성 비중을 점진적으로 높이는 게 좋아요. 거대 자본가들도 이런 환경에서 방어적으로 포지션을 조정합니다.",
          "시장 유동성이 전주 대비 더 타이트해졌어요. 변동성 확대 가능성이 있으니 주의해야 합니다.",
          "고변동성 자산의 리스크 관리가 필요한 시점이에요. 방어적 자산에 유리한 환경이 지속되고 있어요."
        ]
      },
      3: {
        title: "LEVEL 3 - 위험",
        emoji: "🚨",
        description: "유동성 급감과 긴축 가속이 동시에 진행 중이에요.",
        details: [
          "고위험 자산 비중을 줄이고 방어적 포지션을 유지하는 게 우선이에요. 거대 자본가들도 이런 시점에 방어 모드로 전환합니다.",
          "유동성 흡수 요인의 증가와 공급 요인의 감소가 동시에 진행되어서, 시장 변동성이 크게 확대될 수 있어요.",
          "현금성 자산과 방어적 섹터에 집중하고, 고위험 자산의 노출을 최소화하는 게 좋을 것 같아요."
        ]
      }
    };

    const levelsHtml = Object.entries(levelDescriptions).map(([level, info]) => {
      const levelNum = Number(level);
      const levelColors = ["#22c55e", "#f59e0b", "#f97316", "#ef4444"];
      return `
      <div class="level-item">
        <div class="level-header">
          <span class="level-badge" style="background: ${levelColors[levelNum]}">${info.emoji} ${info.title}</span>
        </div>
        <div class="level-description">
          <p class="level-main-desc">${escapeHtml(info.description)}</p>
          <ul class="level-details">
            ${info.details.map(detail => `<li>${escapeHtml(detail)}</li>`).join("")}
          </ul>
        </div>
      </div>`;
    }).join("\n");

    // 경제 지표 페이지는 5분 캐시
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>레벨 설명 - FED H.4.1</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    .main-content{padding:24px;max-width:1000px;margin:0 auto}
    .level-item{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:20px}
    .level-header{margin-bottom:16px}
    .level-badge{padding:8px 16px;border-radius:6px;font-weight:700;font-size:16px;color:#ffffff;display:inline-block}
    .level-description{color:#c0c0c0}
    .level-main-desc{font-size:16px;font-weight:600;color:#ffffff;margin-bottom:12px}
    .level-details{list-style:none;padding-left:0;margin-top:12px}
    .level-details li{padding-left:20px;position:relative;margin-bottom:8px;line-height:1.7}
    .level-details li:before{content:"•";position:absolute;left:0;color:#4dabf7;font-weight:700}
  </style>
</head>
<body>
  <div class="page-header">
    <h1>레벨 설명</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  <div class="main-content">
    ${levelsHtml}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// 금리 발표 일정 페이지
app.get("/interest-rate-schedule", async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 2026년 금리 발표 일정
    const schedules = {
      fomc: [
        { month: 1, day: 28, weekday: "수" },
        { month: 3, day: 18, weekday: "수" },
        { month: 4, day: 29, weekday: "수" },
        { month: 6, day: 17, weekday: "수" },
        { month: 7, day: 29, weekday: "수" },
        { month: 9, day: 16, weekday: "수" },
        { month: 10, day: 28, weekday: "수" },
        { month: 12, day: 9, weekday: "수" },
      ],
      ecb: [
        { month: 2, day: 5, weekday: "목" },
        { month: 3, day: 19, weekday: "목" },
        { month: 4, day: 30, weekday: "목" },
        { month: 6, day: 11, weekday: "목" },
        { month: 7, day: 23, weekday: "목" },
        { month: 9, day: 10, weekday: "목" },
        { month: 10, day: 29, weekday: "목" },
        { month: 12, day: 17, weekday: "목" },
      ],
      korea: [
        { month: 1, day: 15, weekday: "목" },
        { month: 2, day: 26, weekday: "목" },
        { month: 4, day: 10, weekday: "금" },
        { month: 5, day: 28, weekday: "목" },
        { month: 7, day: 16, weekday: "목" },
        { month: 8, day: 27, weekday: "목" },
        { month: 10, day: 22, weekday: "목" },
        { month: 11, day: 26, weekday: "목" },
      ],
      boj: [
        { month: 1, day: 22, weekday: "목" },
        { month: 3, day: 19, weekday: "목" },
        { month: 4, day: 28, weekday: "월" },
        { month: 6, day: 13, weekday: "금" },
        { month: 7, day: 31, weekday: "목" },
        { month: 9, day: 22, weekday: "월" },
        { month: 10, day: 31, weekday: "금" },
        { month: 12, day: 19, weekday: "금" },
      ],
    };
    
    const calculateDays = (year: number, month: number, day: number) => {
      const targetDate = new Date(year, month - 1, day);
      targetDate.setHours(0, 0, 0, 0);
      if (targetDate < today) return null; // 과거 날짜는 null
      const diff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff;
    };
    
    const getScheduleRow = (month: number) => {
      const fomc = schedules.fomc.find(s => s.month === month);
      const ecb = schedules.ecb.find(s => s.month === month);
      const korea = schedules.korea.find(s => s.month === month);
      const boj = schedules.boj.find(s => s.month === month);
      
      const fomcDays = fomc ? calculateDays(2026, fomc.month, fomc.day) : null;
      const ecbDays = ecb ? calculateDays(2026, ecb.month, ecb.day) : null;
      const koreaDays = korea ? calculateDays(2026, korea.month, korea.day) : null;
      const bojDays = boj ? calculateDays(2026, boj.month, boj.day) : null;
      
      const formatDate = (schedule: { day: number; weekday: string } | undefined, days: number | null) => {
        if (!schedule) return '<td style="padding: 12px; text-align: center; color: #808080;">-</td>';
        const ddayText = days !== null ? ` (D-${days})` : '';
        const color = days !== null && days <= 7 ? '#ff6b6b' : days !== null ? '#4dabf7' : '#c0c0c0';
        return `<td style="padding: 12px; text-align: center; color: ${color}; font-weight: ${days !== null && days <= 7 ? '600' : '400'};">${schedule.day}일 (${schedule.weekday})${ddayText}</td>`;
      };
      
      return `
        <tr style="border-bottom: 1px solid #2d2d2d;">
          <td style="padding: 12px; text-align: center; font-weight: 600; color: #ffffff;">${month}월</td>
          ${formatDate(fomc, fomcDays)}
          ${formatDate(ecb, ecbDays)}
          ${formatDate(korea, koreaDays)}
          ${formatDate(boj, bojDays)}
        </tr>
      `;
    };
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>2026년 금리 발표 일정 - FED H.4.1</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    .main-content{padding:24px;max-width:1200px;margin:0 auto}
    .schedule-table{width:100%;border-collapse:collapse;background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;overflow:hidden;margin-top:24px}
    .schedule-table th{background:#252525;padding:16px 12px;text-align:center;font-weight:700;color:#ffffff;border-bottom:2px solid #2d2d2d;font-size:14px}
    .schedule-table td{border-bottom:1px solid #2d2d2d}
    .schedule-table tr:last-child td{border-bottom:none}
    .schedule-table tr:hover{background:#252525}
    .info-box{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:20px;margin-top:24px}
    .info-box h3{margin:0 0 12px 0;font-size:16px;font-weight:700;color:#ffffff}
    .info-box p{margin:8px 0;font-size:14px;line-height:1.8;color:#c0c0c0}
    @media (max-width: 768px) {
      .schedule-table{font-size:12px}
      .schedule-table th, .schedule-table td{padding:8px 6px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>2026년 금리 발표 일정 📅</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  <div class="main-content">
    <table class="schedule-table">
      <thead>
        <tr>
          <th style="width: 15%;">월</th>
          <th style="width: 21.25%;">🇺🇸 FOMC<br/>(미국)</th>
          <th style="width: 21.25%;">🇪🇺 ECB<br/>(유럽)</th>
          <th style="width: 21.25%;">🇰🇷 금통위<br/>(한국)</th>
          <th style="width: 21.25%;">🇯🇵 BOJ<br/>(일본)</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: 12 }, (_, i) => i + 1).map(month => getScheduleRow(month)).join('')}
      </tbody>
    </table>
    <div class="info-box">
      <h3>📌 안내</h3>
      <p>• <strong style="color: #4dabf7;">파란색</strong>: 다가오는 발표일 (D-day 표시)</p>
      <p>• <strong style="color: #ff6b6b;">빨간색</strong>: 7일 이내 발표일 (주의 필요)</p>
      <p>• <strong style="color: #808080;">회색</strong>: 이미 지난 발표일</p>
      <p>• 발표일은 중앙은행 공식 일정을 기준으로 하며, 변경될 수 있습니다.</p>
    </div>
  </div>
</body>
</html>
    `);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

app.get("/concepts", async (_req, res) => {
  try {
    const coreItems = ITEM_DEFS.filter(item => item.isCore);
    
    const conceptsHtml = coreItems.map(item => {
      const concept = getConcept(item.fedLabel, item.liquidityTag);
      return `
      <div class="concept-item">
        <div class="concept-header">
          <span class="concept-key">${item.key}</span>
          <h3 class="concept-title">${escapeHtml(item.title)}</h3>
        </div>
        <div class="concept-content">${escapeHtml(concept)}</div>
        <div class="concept-label">${escapeHtml(item.fedLabel)}</div>
      </div>`;
    }).join("\n");

    // 경제 지표 페이지는 5분 캐시
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>계정항목 알아보기 - FED H.4.1</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    .main-content{padding:24px;max-width:1000px;margin:0 auto}
    .concept-item{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:20px}
    .concept-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
    .concept-key{font-size:14px;color:#808080;font-weight:600}
    .concept-title{font-size:18px;font-weight:700;color:#ffffff;flex:1;margin:0}
    .concept-content{font-size:14px;line-height:1.8;color:#c0c0c0;margin-bottom:12px}
    .concept-label{font-size:12px;color:#808080;padding-top:12px;border-top:1px solid #2d2d2d}
  </style>
</head>
<body>
  <div class="page-header">
    <h1>계정항목 알아보기 📋</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  <div class="main-content">
    ${conceptsHtml}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// 경제 지표 페이지
app.get("/economic-indicators", async (_req, res) => {
  try {
    // 캐시 헤더 설정 (1시간 캐시, stale-while-revalidate 24시간)
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    
    const indicators = await fetchAllEconomicIndicators();
    const status = diagnoseEconomicStatus(indicators);
    
    const statusColors = {
      green: "#22c55e",
      yellow: "#f59e0b",
      red: "#ef4444",
    };
    
    const statusTexts = {
      green: "양호",
      yellow: "주의",
      red: "위험",
    };
    
    // 카테고리별로 그룹화
    const indicatorsByCategory: Record<string, typeof indicators> = {};
    indicators.forEach((ind) => {
      if (!indicatorsByCategory[ind.category]) {
        indicatorsByCategory[ind.category] = [];
      }
      indicatorsByCategory[ind.category].push(ind);
    });
    
    // FED 자산/부채 카테고리 추가 (1번째 위치로)
    indicatorsByCategory["FED자산/부채"] = [];
    
    // 카테고리 순서 정의 (FED자산/부채를 첫 번째로)
    const categoryOrder = ["FED자산/부채", "금리", "지수", "심리", "신용", "기타"];
    const orderedCategories = categoryOrder.filter(cat => indicatorsByCategory[cat] !== undefined);
    const otherCategories = Object.keys(indicatorsByCategory).filter(cat => !categoryOrder.includes(cat));
    const finalCategoryOrder = [...orderedCategories, ...otherCategories];
    
    const categorySections = finalCategoryOrder.map((category) => {
      const items = indicatorsByCategory[category];
      return [category, items] as [string, typeof indicators];
    }).map(([category, items]) => {
      // FED 자산/부채는 특별 처리
      if (category === "FED자산/부채") {
        return `
        <div class="category-section">
          <h2 class="category-title">${escapeHtml(category)}</h2>
          <div class="indicators-grid">
            <a href="/economic-indicators/fed-assets-liabilities" class="indicator-item-link">
              <div class="indicator-item" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;border:none">
                <div class="indicator-header">
                  <div class="indicator-name" style="color:#ffffff">FED 자산/부채 분석</div>
                  <div class="indicator-symbol" style="color:rgba(255,255,255,0.8)">자산과 부채 종합 분석</div>
                </div>
                <div class="indicator-value">
                  <span class="value-main" style="color:#ffffff">자세히 보기</span>
                </div>
                <div class="indicator-meta" style="color:rgba(255,255,255,0.8)">
                  <span>H.4.1 리포트 기반</span>
                </div>
              </div>
            </a>
          </div>
        </div>
        `;
      }
      const itemsHtml = items.map((ind) => {
        const changeColor = ind.changePercent !== null
          ? (ind.changePercent > 0 ? "#ff6b6b" : ind.changePercent < 0 ? "#51cf66" : "#adb5bd")
          : "#adb5bd";
        const changeSign = ind.changePercent !== null && ind.changePercent > 0 ? "+" : "";
        
        const detailLink = ind.id ? `/economic-indicators/${ind.id}` : "#";
        return `
        <a href="${detailLink}" class="indicator-item-link" ${!ind.id ? 'onclick="return false;"' : ""}>
        <div class="indicator-item">
          <div class="indicator-header">
            <div class="indicator-name">${escapeHtml(ind.name)}</div>
            <div class="indicator-symbol">${escapeHtml(ind.symbol)}</div>
          </div>
          <div class="indicator-value">
            ${ind.value !== null 
              ? `<span class="value-main">${ind.value.toFixed(2)}</span><span class="value-unit">${escapeHtml(ind.unit)}</span>`
              : "<span class=\"value-null\">데이터 없음</span>"}
          </div>
          ${ind.changePercent !== null 
            ? `<div class="indicator-change" style="color:${changeColor}">
                ${changeSign}${ind.changePercent.toFixed(2)}%
                ${ind.change !== null ? `(${changeSign}${ind.change.toFixed(2)})` : ""}
              </div>`
            : ""}
          <div class="indicator-meta">
            <span class="indicator-source">${escapeHtml(ind.source)}</span>
            <span class="indicator-updated">${new Date(ind.lastUpdated).toLocaleString("ko-KR")}</span>
          </div>
          ${ind.id ? '<div class="indicator-detail-link">상세 보기 →</div>' : ""}
        </div>
        </a>`;
      }).join("");
      
      return `
      <div class="category-section">
        <h2 class="category-title">${escapeHtml(category)}</h2>
        <div class="indicators-grid">
          ${itemsHtml}
        </div>
      </div>`;
    }).join("");
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>경제 지표 - FED H.4.1</title>
  <link rel="prefetch" href="/economic-indicators/fed-assets-liabilities" />
  <script src="/toggles.js" defer></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    
    .status-summary{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin:24px;max-width:1400px;margin-left:auto;margin-right:auto}
    .status-header{display:flex;align-items:center;gap:16px;margin-bottom:16px}
    .status-circle{width:48px;height:48px;border-radius:50%;background:${statusColors[status.status]};box-shadow:0 0 16px ${statusColors[status.status]}40}
    .status-info h2{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .status-info .status-text{font-size:14px;color:#c0c0c0;margin-top:4px}
    .status-score{margin-left:auto;text-align:right}
    .status-score-value{font-size:32px;font-weight:700;color:${statusColors[status.status]}}
    .status-score-label{font-size:12px;color:#808080;margin-top:4px}
    .status-summary-text{font-size:14px;line-height:1.8;color:#c0c0c0;margin-top:16px;padding-top:16px;border-top:1px solid #2d2d2d}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .category-section{margin-bottom:40px}
    .category-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #2d2d2d}
    
    .indicators-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    .indicator-item-link{text-decoration:none;color:inherit;display:block}
    .indicator-item{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:20px;transition:all 0.2s;cursor:pointer}
    .indicator-item:hover{border-color:#3d3d3d;transform:translateY(-2px)}
    .indicator-detail-link{font-size:12px;color:#4dabf7;margin-top:12px;text-align:right;font-weight:500}
    .indicator-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
    .indicator-name{font-size:15px;font-weight:600;color:#ffffff;flex:1}
    .indicator-symbol{font-size:11px;color:#808080;background:#2d2d2d;padding:2px 8px;border-radius:4px;margin-left:8px}
    .indicator-value{margin-bottom:8px}
    .value-main{font-size:24px;font-weight:700;color:#ffffff}
    .value-unit{font-size:14px;color:#808080;margin-left:4px}
    .value-null{font-size:14px;color:#808080;font-style:italic}
    .indicator-change{font-size:13px;font-weight:600;margin-bottom:8px}
    .indicator-meta{display:flex;justify-content:space-between;font-size:11px;color:#808080;padding-top:8px;border-top:1px solid #2d2d2d}
    
    @media (max-width: 768px) {
      .indicators-grid{grid-template-columns:1fr}
      .status-header{flex-direction:column;align-items:flex-start}
      .status-score{margin-left:0;margin-top:12px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>경제 지표 📈</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  
  <div class="status-summary">
    <div class="status-header">
      <div class="status-circle"></div>
      <div class="status-info">
        <h2>경제 상태: ${statusTexts[status.status]}</h2>
        <div class="status-text">경제코치의 종합 진단 결과예요</div>
      </div>
      <div class="status-score">
        <div class="status-score-value">${status.score}</div>
        <div class="status-score-label">점수 / 100</div>
      </div>
    </div>
    <div class="status-summary-text">${escapeHtml(status.summary)}</div>
  </div>
  
  <div class="main-content">
    ${categorySections}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// Fear & Greed Index 전용 페이지 (일반 세부 페이지보다 먼저 정의)
app.get("/economic-indicators/fear-greed-index", async (req, res) => {
  try {
    const detail = await getIndicatorDetail("fear-greed-index", '1Y');
    
    if (!detail.indicator) {
      res.status(404).send("죄송해요, Fear & Greed Index 데이터를 찾을 수 없어요.");
      return;
    }
    
    const ind = detail.indicator;
    const currentValue = ind.value !== null ? Math.round(ind.value) : 0;
    
    // 구간 판단
    const getLevel = (value: number): { name: string; color: string; bgColor: string } => {
      if (value < 25) return { name: "EXTREME FEAR", color: "#ef4444", bgColor: "#7f1d1d" };
      if (value < 45) return { name: "FEAR", color: "#f97316", bgColor: "#7c2d12" };
      if (value < 55) return { name: "NEUTRAL", color: "#eab308", bgColor: "#713f12" };
      if (value < 75) return { name: "GREED", color: "#22c55e", bgColor: "#14532d" };
      return { name: "EXTREME GREED", color: "#10b981", bgColor: "#064e3b" };
    };
    
    const level = getLevel(currentValue);
    
    // 히스토리 데이터 계산
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    const findClosestValue = (targetDate: Date): { value: number; date: string } | null => {
      if (!detail.history || detail.history.length === 0) return null;
      let closest = detail.history[0];
      let minDiff = Math.abs(new Date(closest.date).getTime() - targetDate.getTime());
      
      for (const h of detail.history) {
        const diff = Math.abs(new Date(h.date).getTime() - targetDate.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closest = h;
        }
      }
      return { value: Math.round(closest.value), date: closest.date };
    };
    
    const previousClose = detail.history && detail.history.length > 1 
      ? { value: Math.round(detail.history[detail.history.length - 2].value), date: detail.history[detail.history.length - 2].date }
      : null;
    const weekAgo = findClosestValue(oneWeekAgo);
    const monthAgo = findClosestValue(oneMonthAgo);
    const yearAgo = findClosestValue(oneYearAgo);
    
    const getLevelForValue = (value: number): string => {
      if (value < 25) return "Extreme Fear";
      if (value < 45) return "Fear";
      if (value < 55) return "Neutral";
      if (value < 75) return "Greed";
      return "Extreme Greed";
    };
    
    const getBadgeColor = (value: number): string => {
      if (value < 25) return "#ef4444";
      if (value < 45) return "#f97316";
      if (value < 55) return "#808080";
      if (value < 75) return "#22c55e";
      return "#10b981";
    };
    
    // 게이지 각도 계산 (0-180도, 반원)
    const gaugeAngle = (currentValue / 100) * 180;
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Fear & Greed Index - 경제 지표 상세</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#f5f5f5;color:#333333;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #e0e0e0;position:sticky;top:0;background:#ffffff;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#000000}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#666666}
    .page-header a{color:#0066cc;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#0052a3}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .fng-container{display:flex;gap:32px;flex-wrap:wrap;margin-bottom:32px}
    
    .gauge-section{flex:1;min-width:400px;background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:32px;display:flex;flex-direction:column;align-items:center}
    .fng-title{font-size:28px;font-weight:700;color:#000000;margin-bottom:8px;text-align:center}
    .fng-question{font-size:16px;color:#666666;margin-bottom:16px;text-align:center}
    .fng-link{color:#0066cc;text-decoration:none;font-size:14px;margin-bottom:32px}
    .fng-link:hover{text-decoration:underline}
    
    .gauge-wrapper{position:relative;width:100%;max-width:500px;margin:0 auto 32px}
    .gauge-svg{width:100%;height:auto}
    .gauge-value{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-size:48px;font-weight:700;color:#000000;text-align:center}
    
    .fng-updated{font-size:13px;color:#666666;text-align:center}
    
    .history-section{flex:0 0 320px;background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px}
    .history-item{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #e0e0e0}
    .history-item:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
    .history-label{font-size:13px;color:#666666;margin-bottom:8px}
    .history-value-row{display:flex;align-items:center;gap:12px}
    .history-badge{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#ffffff}
    .history-level{font-size:14px;color:#333333}
    
    .analysis-section{background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;margin-bottom:24px}
    .analysis-title{font-size:18px;font-weight:700;color:#000000;margin-bottom:16px}
    .analysis-text{font-size:15px;line-height:2.2;color:#333333;white-space:pre-line}
    .analysis-text strong{color:#000000;font-weight:700}
    
    .news-section-detail{background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;padding:24px;margin-bottom:24px}
    .news-section-title{font-size:18px;font-weight:700;color:#000000;margin-bottom:16px}
    .news-list-detail{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
    .news-item-detail{padding:12px;background:#f9f9f9;border-radius:8px;border:1px solid #e0e0e0;transition:all 0.2s}
    .news-item-detail:hover{background:#f0f0f0;border-color:#d0d0d0}
    .news-content-detail{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .news-text-detail{flex:1;font-size:14px;line-height:1.6;color:#333333}
    .news-meta-detail{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .news-source-detail{font-size:12px;color:#666666;white-space:nowrap;padding:4px 8px;background:#e0e0e0;border-radius:4px}
    .news-date-detail{font-size:11px;color:#999999;white-space:nowrap}
    .news-comment{margin-top:16px;padding-top:16px;border-top:1px solid #e0e0e0}
    .news-comment-title{font-size:16px;font-weight:700;color:#000000;margin-bottom:12px}
    .news-comment-text{font-size:14px;line-height:1.8;color:#333333}
    
    @media (max-width: 768px) {
      .fng-container{flex-direction:column}
      .gauge-section{min-width:auto}
      .history-section{flex:1 1 100%}
      .gauge-value{font-size:36px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>Fear & Greed Index</h1>
    <div class="sub">
      <a href="/economic-indicators">← 경제 지표로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    <div class="fng-container">
      <div class="gauge-section">
        <div class="fng-title">Fear & Greed Index</div>
        <div class="fng-question">What emotion is driving the market now?</div>
        <a href="https://www.cnn.com/markets/fear-and-greed" target="_blank" class="fng-link">Learn more about the index</a>
        
        <div class="gauge-wrapper">
          <svg class="gauge-svg" viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg">
            <!-- 배경 원호 (가독성 개선: 더 진한 배경) -->
            <path d="M 50 200 A 150 150 0 0 1 350 200" fill="none" stroke="#d0d0d0" stroke-width="22" stroke-linecap="round"/>
            
            <!-- 구간별 색상 (0-100 범위, 가독성 개선: 더 두껍고 진한 색상) -->
            <!-- EXTREME FEAR: 0-25 -->
            <path d="M 50 200 A 150 150 0 0 1 125 50" fill="none" stroke="#dc2626" stroke-width="22" stroke-linecap="round"/>
            <!-- FEAR: 25-45 -->
            <path d="M 125 50 A 150 150 0 0 1 200 50" fill="none" stroke="#ea580c" stroke-width="22" stroke-linecap="round"/>
            <!-- NEUTRAL: 45-55 -->
            <path d="M 200 50 A 150 150 0 0 1 275 50" fill="none" stroke="#ca8a04" stroke-width="22" stroke-linecap="round"/>
            <!-- GREED: 55-75 -->
            <path d="M 275 50 A 150 150 0 0 1 350 200" fill="none" stroke="#16a34a" stroke-width="22" stroke-linecap="round"/>
            
            <!-- 현재 값 강조 (활성 구간, 가독성 개선: 더 두껍고 진한 색상) -->
            ${currentValue >= 75 ? `
            <!-- EXTREME GREED: 75-100 -->
            <path d="M 350 200 A 150 150 0 0 1 350 200" fill="none" stroke="#059669" stroke-width="26" stroke-linecap="round" opacity="1"/>
            ` : currentValue >= 55 && currentValue < 75 ? `
            <!-- GREED: 55-75 -->
            <path d="M 275 50 A 150 150 0 0 1 350 200" fill="none" stroke="#16a34a" stroke-width="26" stroke-linecap="round" opacity="1"/>
            ` : currentValue >= 45 && currentValue < 55 ? `
            <!-- NEUTRAL: 45-55 -->
            <path d="M 200 50 A 150 150 0 0 1 275 50" fill="none" stroke="#ca8a04" stroke-width="26" stroke-linecap="round" opacity="1"/>
            ` : currentValue >= 25 && currentValue < 45 ? `
            <!-- FEAR: 25-45 -->
            <path d="M 125 50 A 150 150 0 0 1 200 50" fill="none" stroke="#ea580c" stroke-width="26" stroke-linecap="round" opacity="1"/>
            ` : `
            <!-- EXTREME FEAR: 0-25 -->
            <path d="M 50 200 A 150 150 0 0 1 125 50" fill="none" stroke="#dc2626" stroke-width="26" stroke-linecap="round" opacity="1"/>
            `}
            
            <!-- 눈금 (가독성 개선: 더 두껍고 진한 색상) -->
            <line x1="50" y1="200" x2="50" y2="210" stroke="#666666" stroke-width="3"/>
            <line x1="125" y1="50" x2="130" y2="45" stroke="#666666" stroke-width="3"/>
            <line x1="200" y1="50" x2="200" y2="40" stroke="#666666" stroke-width="3"/>
            <line x1="275" y1="50" x2="270" y2="45" stroke="#666666" stroke-width="3"/>
            <line x1="350" y1="200" x2="350" y2="210" stroke="#666666" stroke-width="3"/>
            
            <!-- 눈금 라벨 (가독성 개선: 큰 글자, 진한 색상) -->
            <text x="50" y="225" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">0</text>
            <text x="125" y="40" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">25</text>
            <text x="200" y="30" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">50</text>
            <text x="275" y="40" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">75</text>
            <text x="350" y="225" fill="#333333" font-size="14" text-anchor="middle" font-weight="700">100</text>
            
            <!-- 구간 라벨 (가독성 개선: 큰 글자, 배경 원, 그림자 효과) -->
            <!-- EXTREME FEAR 배경 -->
            <circle cx="87.5" cy="120" r="28" fill="rgba(255,255,255,0.9)" stroke="#ef4444" stroke-width="2"/>
            <text x="87.5" y="115" fill="#dc2626" font-size="12" font-weight="700" text-anchor="middle" transform="rotate(-45 87.5 120)">
              <tspan x="87.5" dy="0">EXTREME</tspan>
              <tspan x="87.5" dy="13">FEAR</tspan>
            </text>
            
            <!-- FEAR 배경 -->
            <circle cx="162.5" cy="70" r="22" fill="rgba(255,255,255,0.9)" stroke="#ea580c" stroke-width="2"/>
            <text x="162.5" y="70" fill="#ea580c" font-size="15" font-weight="700" text-anchor="middle">FEAR</text>
            
            <!-- NEUTRAL 배경 -->
            <circle cx="237.5" cy="70" r="22" fill="rgba(255,255,255,0.9)" stroke="#ca8a04" stroke-width="2"/>
            <text x="237.5" y="70" fill="#ca8a04" font-size="15" font-weight="700" text-anchor="middle">NEUTRAL</text>
            
            <!-- GREED 배경 -->
            <circle cx="312.5" cy="120" r="22" fill="rgba(255,255,255,0.9)" stroke="#16a34a" stroke-width="2"/>
            <text x="312.5" y="120" fill="#16a34a" font-size="15" font-weight="700" text-anchor="middle" transform="rotate(45 312.5 120)">GREED</text>
            
            <!-- EXTREME GREED 배경 -->
            <circle cx="350" cy="180" r="28" fill="rgba(255,255,255,0.9)" stroke="#059669" stroke-width="2"/>
            <text x="350" y="175" fill="#059669" font-size="12" font-weight="700" text-anchor="middle">
              <tspan x="350" dy="0">EXTREME</tspan>
              <tspan x="350" dy="13">GREED</tspan>
            </text>
            
            <!-- 바늘 (현재 값) -->
            <g transform="translate(200, 200)">
              <line x1="0" y1="0" x2="${Math.cos((180 - gaugeAngle) * Math.PI / 180) * 150}" y2="${-Math.sin((180 - gaugeAngle) * Math.PI / 180) * 150}" 
                    stroke="#000000" stroke-width="4" stroke-linecap="round"/>
              <circle cx="0" cy="0" r="8" fill="#000000"/>
            </g>
          </svg>
          <div class="gauge-value">${currentValue}</div>
        </div>
        
        <div class="fng-updated">Last updated ${ind.lastUpdated ? new Date(ind.lastUpdated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" }) : new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" })} ET</div>
        
        <!-- 점수별 의미 설명 -->
        <div style="margin-top:24px;padding:16px;background:#f9f9f9;border-radius:8px;width:100%;max-width:500px">
          <div style="font-size:13px;color:#666666;margin-bottom:8px;font-weight:600">점수별 의미:</div>
          <div style="font-size:12px;color:#333333;line-height:1.8">
            <div><span style="color:#ef4444;font-weight:600">0-24: Extreme Fear</span> - 극도의 공포 상태</div>
            <div><span style="color:#f97316;font-weight:600">25-44: Fear</span> - 공포 상태</div>
            <div><span style="color:#eab308;font-weight:600">45-54: Neutral</span> - 중립 상태</div>
            <div><span style="color:#22c55e;font-weight:600">55-74: Greed</span> - 탐욕 상태</div>
            <div><span style="color:#10b981;font-weight:600">75-100: Extreme Greed</span> - 극도의 탐욕 상태</div>
          </div>
        </div>
      </div>
      
      <div class="history-section">
        
        ${previousClose ? `
        <div class="history-item">
          <div class="history-label">Previous close</div>
          <div class="history-value-row">
            <div class="history-badge" style="background:${getBadgeColor(previousClose.value)}">${previousClose.value}</div>
            <div class="history-level">${getLevelForValue(previousClose.value)}</div>
          </div>
        </div>
        ` : ""}
        
        ${weekAgo ? `
        <div class="history-item">
          <div class="history-label">1 week ago</div>
          <div class="history-value-row">
            <div class="history-badge" style="background:${getBadgeColor(weekAgo.value)}">${weekAgo.value}</div>
            <div class="history-level">${getLevelForValue(weekAgo.value)}</div>
          </div>
        </div>
        ` : ""}
        
        ${monthAgo ? `
        <div class="history-item">
          <div class="history-label">1 month ago</div>
          <div class="history-value-row">
            <div class="history-badge" style="background:${getBadgeColor(monthAgo.value)}">${monthAgo.value}</div>
            <div class="history-level">${getLevelForValue(monthAgo.value)}</div>
          </div>
        </div>
        ` : ""}
        
        ${yearAgo ? `
        <div class="history-item">
          <div class="history-label">1 year ago</div>
          <div class="history-value-row">
            <div class="history-badge" style="background:${getBadgeColor(yearAgo.value)}">${yearAgo.value}</div>
            <div class="history-level">${getLevelForValue(yearAgo.value)}</div>
          </div>
        </div>
        ` : ""}
      </div>
    </div>
    
    <div class="analysis-section">
      <div class="analysis-title">경제코치 분석 💡</div>
      <div class="analysis-text">${escapeHtml(detail.analysis)}</div>
    </div>
    
    ${detail.relatedNews && detail.relatedNews.length > 0 ? `
    <div class="news-section-detail">
      <div class="news-section-title">최근 뉴스 항목</div>
      <div class="news-list-detail">
        ${detail.relatedNews.map((news: any) => `
          <div class="news-item-detail">
            <div class="news-content-detail">
              <div class="news-text-detail">${escapeHtml(news.title)}</div>
              <div class="news-meta-detail">
                <div class="news-source-detail">${escapeHtml(news.source)}</div>
                ${news.publishedAt ? `<div class="news-date-detail">${escapeHtml(news.publishedAt)}</div>` : ""}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
      ${detail.newsComment && detail.newsComment !== "none" ? `
      <div class="news-comment">
        <div class="news-comment-title">경제코치 코멘트 💬</div>
        <div class="news-comment-text">${escapeHtml(detail.newsComment)}</div>
      </div>
      ` : ""}
    </div>
    ` : ""}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// FED 자산/부채 페이지
app.get("/economic-indicators/fed-assets-liabilities", async (req, res) => {
  try {
    // 날짜 파라미터 확인 (date 또는 release 모두 지원)
    const targetDate = (req.query.date || req.query.release) as string | undefined;
    
    // 캐시 헤더 설정 (날짜별로 다른 캐시 키 사용)
    const cacheKey = targetDate ? `date:${targetDate}` : 'latest';
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    
    // FED 발표 날짜 목록 가져오기 (최근 10회분용 - 날짜 선택과 무관하게 항상 최신 10회분)
    // 날짜 선택과 무관하게 항상 현재 날짜 기준 최신 10회분을 가져오기 위해 별도로 날짜 목록 생성
    let releaseDates = await getFedReleaseDates();
    
    // releaseDates가 비어있으면 fallback 사용 (이미 getFedReleaseDates 내부에서 처리되지만, 이중 체크)
    if (releaseDates.length === 0) {
      console.warn(`[Assets/Liabilities] getFedReleaseDates returned empty array, using fallback`);
      // fallback: 현재 날짜 기준으로 최근 52주 목요일 계산
      const fallbackDates: string[] = [];
      const now = new Date();
      const today = new Date();
      const isThursday = today.getDay() === 4;
      const isAfterRelease = today.getHours() >= 16 || (today.getHours() === 16 && today.getMinutes() >= 30);
      let startDate = new Date(now);
      if (!isThursday || !isAfterRelease) {
        const dayOfWeek = now.getDay();
        const daysToSubtract = dayOfWeek <= 4 ? (dayOfWeek + 3) : (dayOfWeek - 4);
        startDate.setDate(now.getDate() - daysToSubtract);
      }
      for (let i = 0; i < 52; i++) {
        const thursday = new Date(startDate);
        thursday.setDate(startDate.getDate() - (i * 7));
        const year = thursday.getFullYear();
        const month = String(thursday.getMonth() + 1).padStart(2, '0');
        const day = String(thursday.getDate()).padStart(2, '0');
        fallbackDates.push(`${year}-${month}-${day}`);
      }
      releaseDates = fallbackDates;
    }
    
    let report: Awaited<ReturnType<typeof fetchH41Report>>;
    try {
      // availableDates를 전달하여 가장 가까운 날짜를 찾을 수 있도록 함
      // targetDate는 메인 리포트용이고, historicalData는 항상 최신 10회분만 가져옴
      report = await fetchH41Report(targetDate, releaseDates);
    } catch (error: any) {
      // 아카이브 데이터 가져오기 실패 시 에러 메시지 표시
      const errorMessage = error?.message || String(error);
      console.error(`[Assets/Liabilities] Failed to fetch H.41 report for date ${targetDate}:`, errorMessage);
      
      // 에러 페이지 렌더링
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>FED 자산/부채 분석 - 오류</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #ffffff; color: #1a1a1a; }
            .error-container { max-width: 600px; margin: 0 auto; }
            .error-title { font-size: 24px; margin-bottom: 20px; color: #ef4444; }
            .error-message { background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .back-link { color: #3b82f6; text-decoration: none; }
            .back-link:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1 class="error-title">데이터를 불러올 수 없습니다</h1>
            <div class="error-message">
              <p>선택한 날짜(${targetDate || 'N/A'})의 FED H.4.1 데이터를 가져오는 중 오류가 발생했습니다.</p>
              <p><strong>오류 내용:</strong> ${escapeHtml(errorMessage)}</p>
              <p>다른 날짜를 선택하거나 최신 데이터를 확인해주세요.</p>
            </div>
            <a href="/economic-indicators/fed-assets-liabilities" class="back-link">← 자산/부채 분석으로 돌아가기</a>
          </div>
        </body>
        </html>
      `);
    }
    
    // 최근 10회분 데이터 가져오기 (항상 최신 10회분, 선택한 날짜와 무관)
    let historicalData: Array<{
      date: string;
      assets: { treasury: number; mbs: number; repo: number; loans: number };
      liabilities: { currency: number; rrp: number; tga: number; reserves: number };
    }> = [];
    
    // releaseDates가 비어있으면 fallback 사용
    if (releaseDates.length === 0) {
      console.warn(`[Assets/Liabilities] No release dates available, using fallback`);
      // fallback: 현재 날짜 기준으로 최근 52주 목요일 계산
      const fallbackDates: string[] = [];
      const now = new Date();
      const today = new Date();
      const isThursday = today.getDay() === 4;
      const isAfterRelease = today.getHours() >= 16 || (today.getHours() === 16 && today.getMinutes() >= 30);
      let startDate = new Date(now);
      if (!isThursday || !isAfterRelease) {
        const dayOfWeek = now.getDay();
        const daysToSubtract = dayOfWeek <= 4 ? (dayOfWeek + 3) : (dayOfWeek - 4);
        startDate.setDate(now.getDate() - daysToSubtract);
      }
      for (let i = 0; i < 52; i++) {
        const thursday = new Date(startDate);
        thursday.setDate(startDate.getDate() - (i * 7));
        const year = thursday.getFullYear();
        const month = String(thursday.getMonth() + 1).padStart(2, '0');
        const day = String(thursday.getDate()).padStart(2, '0');
        fallbackDates.push(`${year}-${month}-${day}`);
      }
      releaseDates = fallbackDates;
    }
    
    console.log(`[Assets/Liabilities] Got ${releaseDates.length} release dates (for historical data)`);
    console.log(`[Assets/Liabilities] Top 15 release dates (source verification):`, releaseDates.slice(0, 15));
    
    // 연도 경계 날짜 확인
    const criticalDates = ['2026-01-02', '2025-12-29', '2026-01-08', '2025-12-18'];
    const foundCriticalDates = criticalDates.filter(d => releaseDates.includes(d));
    console.log(`[Assets/Liabilities] Critical dates check - Found: [${foundCriticalDates.join(', ')}], Missing: [${criticalDates.filter(d => !releaseDates.includes(d)).join(', ')}]`);
    
    // 초기 로딩 최적화: 초기 표시 7개 + 더보기 2회(14개) + Δ 계산용 1개 = 22개 fetch
    // getFedReleaseDates()가 이미 최신부터 정렬된 날짜를 반환하므로, 처음 22개 사용
    const initialVisible = 7; // 초기 표시 개수
    const loadMoreBatchSize = 7; // 더보기 배치 크기
    const maxVisibleForMore = initialVisible + (loadMoreBatchSize * 2); // 초기 + 더보기 2회 = 21개
    const maxFetchCount = maxVisibleForMore + 1; // Δ 계산을 위해 +1 = 22개
    const datesToFetch = releaseDates.slice(0, Math.min(maxFetchCount, releaseDates.length));
    
      console.log(`[Assets/Liabilities] Fetching ${datesToFetch.length} dates (initial visible: ${initialVisible}, max visible for more: ${maxVisibleForMore}, for delta calc: +1)`);
    
    if (datesToFetch.length > 0) {
      console.log(`[Assets/Liabilities] Fetching historical data for ${datesToFetch.length} dates:`, datesToFetch);
      
      // 배치 병렬 처리로 성능 개선 (배치 크기 5)
      const batchSize = 5;
      for (let i = 0; i < datesToFetch.length; i += batchSize) {
        const batch = datesToFetch.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(async (dateStr) => {
            try {
              const histReport = await fetchH41Report(dateStr, releaseDates);
              
              // 데이터 유효성 검사
              if (!histReport || !histReport.cards || histReport.cards.length === 0) {
                console.warn(`[Assets/Liabilities] No cards found in report for ${dateStr}`);
                return null;
              }
              
              const histAssets = {
                treasury: histReport.cards.find(c => c.fedLabel === "U.S. Treasury securities")?.balance_musd || 0,
                mbs: histReport.cards.find(c => c.fedLabel === "Mortgage-backed securities")?.balance_musd || 0,
                repo: histReport.cards.find(c => c.fedLabel === "Repurchase agreements")?.balance_musd || 0,
                loans: histReport.cards.find(c => c.fedLabel === "Primary credit")?.balance_musd || 0,
              };
              const histLiabilities = {
                currency: histReport.cards.find(c => c.fedLabel === "Currency in circulation")?.balance_musd || 0,
                rrp: histReport.cards.find(c => c.fedLabel === "Reverse repurchase agreements")?.balance_musd || 0,
                tga: histReport.cards.find(c => c.fedLabel === "U.S. Treasury, General Account")?.balance_musd || 0,
                reserves: histReport.cards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks")?.balance_musd || 0,
              };
              
              // 날짜를 ISO(YYYY-MM-DD) 형식으로 normalize (이미 dateStr이 ISO 형식이지만 확실하게)
              const isoDate = dateStr; // getFedReleaseDates()가 이미 ISO 형식으로 반환하지만, 안전을 위해 확인
              if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
                console.warn(`[Assets/Liabilities] Invalid date format for ${dateStr}, skipping`);
                return null;
              }
              
              // row drop 금지: 일부 값이 비어도 date가 있으면 row 유지 (0으로 처리)
              // 모든 값이 0이어도 row는 유지 (데이터 누락 방지)
              
              return {
                date: isoDate, // ISO 형식으로 저장
                assets: histAssets,
                liabilities: histLiabilities,
              };
            } catch (e) {
              console.error(`[Assets/Liabilities] Failed to fetch historical data for ${dateStr}:`, e instanceof Error ? e.message : String(e));
              return null;
            }
          })
        );
        
        batchResults.forEach((result, batchIndex) => {
          if (result.status === 'fulfilled' && result.value) {
            historicalData.push(result.value);
          } else if (result.status === 'rejected') {
            const dateStr = batch[batchIndex];
            console.error(`[Assets/Liabilities] Failed to fetch data for ${dateStr}:`, result.reason);
          } else if (result.status === 'fulfilled' && !result.value) {
            const dateStr = batch[batchIndex];
            console.warn(`[Assets/Liabilities] No valid data returned for ${dateStr} (returned null)`);
          }
        });
      }
      
      console.log(`[Assets/Liabilities] Total historical data fetched: ${historicalData.length} records out of ${datesToFetch.length} attempts`);
    } else {
      console.warn(`[Assets/Liabilities] No dates to fetch for historical data`);
    }
    
    // 날짜 순서를 최신부터 과거 순으로 정렬 (최신이 위로) - ISO date를 getTime()으로 정렬
    // 중복 제거: ISO date 기준으로 중복 제거 (값이 더 많이 채워진 row 우선)
    const dateMap = new Map<string, typeof historicalData[0]>();
    historicalData.forEach(item => {
      const existing = dateMap.get(item.date);
      if (!existing) {
        dateMap.set(item.date, item);
      } else {
        // 값이 더 많이 채워진 row 우선 선택
        const existingValues = Object.values(existing.assets).filter(v => v !== 0).length + 
                              Object.values(existing.liabilities).filter(v => v !== 0).length;
        const newValues = Object.values(item.assets).filter(v => v !== 0).length + 
                         Object.values(item.liabilities).filter(v => v !== 0).length;
        if (newValues > existingValues) {
          dateMap.set(item.date, item);
        }
      }
    });
    historicalData = Array.from(dateMap.values());
    
    // ISO date를 Date 객체의 getTime()으로 정렬 (표시용 문자열이 아닌 숫자로 정렬)
    historicalData.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      // 최신 날짜가 위로 오도록 내림차순 정렬
      return dateB - dateA;
    });
    
    // 정렬 후 로그 출력 및 상위 10개 날짜 출력 (디버깅용)
    if (historicalData.length > 0) {
      console.log(`[Assets/Liabilities] Historical data sorted - First date: ${historicalData[0].date}, Last date: ${historicalData[historicalData.length - 1].date}`);
      console.log(`[Assets/Liabilities] Top 15 ISO dates (final result):`, historicalData.slice(0, 15).map(item => item.date));
      
      // 연도 경계 날짜 최종 확인
      const finalCriticalDates = ['2026-01-02', '2025-12-29', '2026-01-08', '2025-12-18'];
      const finalFoundCriticalDates = finalCriticalDates.filter(d => historicalData.some(item => item.date === d));
      const finalMissingCriticalDates = finalCriticalDates.filter(d => !historicalData.some(item => item.date === d));
      console.log(`[Assets/Liabilities] Final critical dates check - Found: [${finalFoundCriticalDates.join(', ')}], Missing: [${finalMissingCriticalDates.join(', ')}]`);
      
      if (finalMissingCriticalDates.length > 0) {
        console.warn(`[Assets/Liabilities] ⚠️ WARNING: Missing critical dates in final historical data!`);
      }
    }
    
    // FED 자산 항목 추출
    const assets = {
      treasury: report.cards.find(c => c.fedLabel === "U.S. Treasury securities"),
      mbs: report.cards.find(c => c.fedLabel === "Mortgage-backed securities"),
      repo: report.cards.find(c => c.fedLabel === "Repurchase agreements"),
      loans: report.cards.find(c => c.fedLabel === "Primary credit"),
    };
    
    // FED 부채 항목 추출
    const liabilities = {
      currency: report.cards.find(c => c.fedLabel === "Currency in circulation"),
      rrp: report.cards.find(c => c.fedLabel === "Reverse repurchase agreements"),
      tga: report.cards.find(c => c.fedLabel === "U.S. Treasury, General Account"),
      reserves: report.cards.find(c => c.fedLabel === "Reserve balances with Federal Reserve Banks"),
    };
    
    // 자산 총합 계산
    const totalAssets = (assets.treasury?.balance_musd || 0) + 
                       (assets.mbs?.balance_musd || 0) + 
                       (assets.repo?.balance_musd || 0) + 
                       (assets.loans?.balance_musd || 0);
    const totalAssetsChange = (assets.treasury?.change_musd || 0) + 
                              (assets.mbs?.change_musd || 0) + 
                              (assets.repo?.change_musd || 0) + 
                              (assets.loans?.change_musd || 0);
    
    // 부채 총합 계산
    const totalLiabilities = (liabilities.currency?.balance_musd || 0) + 
                            (liabilities.rrp?.balance_musd || 0) + 
                            (liabilities.tga?.balance_musd || 0) + 
                            (liabilities.reserves?.balance_musd || 0);
    const totalLiabilitiesChange = (liabilities.currency?.change_musd || 0) + 
                                    (liabilities.rrp?.change_musd || 0) + 
                                    (liabilities.tga?.change_musd || 0) + 
                                    (liabilities.reserves?.change_musd || 0);
    
    // 경제 지표 및 뉴스 가져오기
    let economicIndicators: Awaited<ReturnType<typeof fetchAllEconomicIndicators>> | null = null;
    let economicNews: Array<{ title: string; source: string; publishedAt: string }> = [];
    try {
      economicIndicators = await fetchAllEconomicIndicators();
      economicNews = await fetchEconomicNews();
    } catch (e) {
      console.error("Failed to fetch economic indicators/news:", e);
    }
    
    // 경제 코치 LLM 분석 생성
    const analysis = await generateEconomicCoachAnalysis({
      assets,
      liabilities,
      totalAssets,
      totalAssetsChange,
      totalLiabilities,
      totalLiabilitiesChange,
      report,
      economicIndicators,
      economicNews,
    });
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>FED 자산/부채 분석</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#ffffff;color:#1a1a1a;line-height:1.6}
    .page-header{padding:20px 24px;border-bottom:2px solid #e5e7eb;background:#ffffff;position:sticky;top:0;z-index:100}
    .page-header h1{font-size:24px;font-weight:700;color:#1a1a1a;margin-bottom:8px}
    .page-header .sub{font-size:14px;color:#6b7280}
    .main-content{max-width:1200px;margin:0 auto;padding:24px}
    .section{background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px}
    .section-title{font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e5e7eb}
    .items-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px}
    .item-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px}
    .item-name{font-size:14px;font-weight:600;color:#6b7280;margin-bottom:8px}
    .item-value{font-size:24px;font-weight:700;color:#1a1a1a;margin-bottom:4px}
    .item-change{font-size:14px;font-weight:600}
    .item-change.positive{color:#dc2626}
    .item-change.negative{color:#16a34a}
    .item-change.neutral{color:#6b7280}
    .item-interpretation{margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb}
    .item-interpretation .interpretation-title{font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:12px;line-height:1.5}
    .item-interpretation .interpretation-text{font-size:14px;line-height:1.9;color:#4b5563;white-space:pre-wrap;text-align:justify}
    .summary-card{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;border-radius:12px;padding:24px;margin-bottom:24px}
    .summary-title{font-size:18px;font-weight:600;margin-bottom:16px;opacity:0.9}
    .summary-value{font-size:36px;font-weight:700;margin-bottom:8px}
    .summary-change{font-size:16px;font-weight:600;opacity:0.9}
    .analysis-section{background:#f0f9ff;border:2px solid #0ea5e9;border-radius:12px;padding:28px;margin-top:24px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}
    .analysis-title{font-size:22px;font-weight:800;color:#0369a1;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #bae6fd}
    .analysis-content{font-size:15px;color:#0c4a6e;line-height:2.0;white-space:pre-wrap;font-weight:500}
    .back-link{display:inline-block;margin-top:16px;color:#3b82f6;text-decoration:none;font-weight:600}
    .back-link:hover{text-decoration:underline}
    .date-selector{margin-top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .date-selector label{font-size:13px;color:#6b7280;font-weight:600}
    .date-selector input[type="date"]{padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#ffffff;color:#1a1a1a;font-size:13px;cursor:pointer;min-width:200px}
    .date-selector input[type="date"]:hover{border-color:#9ca3af}
    .date-selector input[type="date"]:focus{outline:none;border-color:#3b82f6}
    .date-selector button{padding:6px 16px;border:1px solid #3b82f6;border-radius:6px;background:#3b82f6;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s}
    .date-selector button:hover{background:#2563eb;border-color:#2563eb}
    .date-selector .reset-btn{padding:6px 12px;border:1px solid #d1d5db;background:transparent;color:#6b7280}
    .date-selector .reset-btn:hover{background:#f3f4f6;color:#1a1a1a}
    .history-table-section{margin-top:40px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px}
    .history-table-title{font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e5e7eb}
    .history-table-wrapper{overflow-x:auto;overflow-y:visible}
    .history-table{width:100%;border-collapse:collapse;min-width:600px}
    .history-table th{background:#f9fafb;padding:12px;text-align:center;font-size:13px;font-weight:600;color:#6b7280;border-bottom:2px solid #e5e7eb;white-space:nowrap}
    .history-table th.sticky-col{background:#f9fafb;position:sticky;left:0;z-index:20;min-width:140px;text-align:left;box-shadow:2px 0 4px rgba(0,0,0,0.1)}
    .history-table th.asset-col{background:#f0fdf4 !important;color:#166534;font-weight:700}
    .history-table th.liability-col{background:#fef2f2 !important;color:#991b1b;font-weight:700}
    .history-table td{padding:12px;text-align:center;font-size:13px;color:#1a1a1a;border-bottom:1px solid #e5e7eb;white-space:nowrap;vertical-align:middle}
    .history-table td.sticky-col{background:#ffffff;position:sticky;left:0;z-index:10;font-weight:600;color:#1a1a1a;min-width:140px;text-align:left;box-shadow:2px 0 4px rgba(0,0,0,0.1)}
    .history-table td.asset-cell{background:#f0fdf4 !important}
    .history-table td.liability-cell{background:#fef2f2 !important}
    .history-table tr:hover td{background:#f3f4f6}
    .history-table tr:hover td.sticky-col{background:#f3f4f6 !important}
    .history-table tr:hover td.asset-cell{background:#dcfce7 !important}
    .history-table tr:hover td.liability-cell{background:#fee2e2 !important}
    @media (max-width: 768px) {
      .history-table-wrapper{overflow-x:scroll;overflow-y:visible;-webkit-overflow-scrolling:touch}
      .history-table th.sticky-col,.history-table td.sticky-col{position:sticky;left:0;box-shadow:2px 0 4px rgba(0,0,0,0.15)}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>FED 자산/부채 분석 📊</h1>
    <div class="sub">
      Week ended: ${escapeHtml(report.asOfWeekEndedText)} · Release: ${escapeHtml(report.releaseDateText)}<br/>
      <div class="date-selector">
        <label for="releaseSelect">FED 발표 날짜 선택:</label>
        <input type="date" id="releaseSelect" value="${targetDate || ''}" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#ffffff;color:#1a1a1a;font-size:13px;cursor:pointer" />
        <button id="releaseFetchBtn" onclick="handleDateFetch()">조회</button>
        ${targetDate ? `<button class="reset-btn" onclick="handleResetDate()">초기화</button>` : ''}
      </div>
      <a href="/economic-indicators" class="back-link">← 경제 지표로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    <!-- 자산 총합 -->
    <div class="summary-card" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%)">
      <div class="summary-title">FED 자산 총합${targetDate ? ` <span style="font-size:14px;opacity:0.9">(Date: ${targetDate})</span>` : ''}</div>
      <div class="summary-value">$${(totalAssets / 1000).toFixed(1)}조</div>
      <div class="summary-change ${totalAssetsChange > 0 ? 'positive' : totalAssetsChange < 0 ? 'negative' : 'neutral'}">
        ${totalAssetsChange > 0 ? '+' : ''}${(totalAssetsChange / 1000).toFixed(1)}조 (${totalAssetsChange > 0 ? '+' : ''}${((totalAssetsChange / (totalAssets - totalAssetsChange)) * 100).toFixed(2)}%)
      </div>
    </div>
    
    <!-- FED 자산 -->
    <div class="section">
      <div class="section-title">FED 자산</div>
      <div class="items-grid">
        ${assets.treasury ? `
        <div class="item-card" data-item-key="treasury">
          <div class="item-name">국채 (U.S. Treasury securities)</div>
          <div class="item-value">$${(assets.treasury.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${assets.treasury.change_musd > 0 ? 'positive' : assets.treasury.change_musd < 0 ? 'negative' : 'neutral'}">
            ${assets.treasury.change_musd > 0 ? '+' : ''}${(assets.treasury.change_musd / 1000).toFixed(1)}조
          </div>
          ${assets.treasury.interpretation ? `
          <div class="item-interpretation">
            <div class="interpretation-title">${escapeHtml(assets.treasury.interpretation.split('\n')[0] || '해석')}</div>
            <div class="interpretation-text">${escapeHtml(assets.treasury.interpretation.split('\n').slice(1).join('\n') || assets.treasury.interpretation).replace(/\n/g, "<br/><br/>")}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        ${assets.mbs ? `
        <div class="item-card">
          <div class="item-name">MBS (Mortgage-backed securities)</div>
          <div class="item-value">$${(assets.mbs.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${assets.mbs.change_musd > 0 ? 'positive' : assets.mbs.change_musd < 0 ? 'negative' : 'neutral'}">
            ${assets.mbs.change_musd > 0 ? '+' : ''}${(assets.mbs.change_musd / 1000).toFixed(1)}조
          </div>
          ${assets.mbs.interpretation ? `
          <div class="item-interpretation">
            <div class="interpretation-title">${escapeHtml(assets.mbs.interpretation.split('\n')[0] || '해석')}</div>
            <div class="interpretation-text">${escapeHtml(assets.mbs.interpretation.split('\n').slice(1).join('\n') || assets.mbs.interpretation).replace(/\n/g, "<br/><br/>")}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        ${assets.repo ? `
        <div class="item-card">
          <div class="item-name">리포 (Repurchase agreements)</div>
          <div class="item-value">$${(assets.repo.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${assets.repo.change_musd > 0 ? 'positive' : assets.repo.change_musd < 0 ? 'negative' : 'neutral'}">
            ${assets.repo.change_musd > 0 ? '+' : ''}${(assets.repo.change_musd / 1000).toFixed(1)}조
          </div>
          ${assets.repo.interpretation ? `
          <div class="item-interpretation">
            <div class="interpretation-title">${escapeHtml(assets.repo.interpretation.split('\n')[0] || '해석')}</div>
            <div class="interpretation-text">${escapeHtml(assets.repo.interpretation.split('\n').slice(1).join('\n') || assets.repo.interpretation).replace(/\n/g, "<br/><br/>")}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        ${assets.loans ? `
        <div class="item-card">
          <div class="item-name">대출 (Loans)</div>
          <div class="item-value">$${(assets.loans.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${assets.loans.change_musd > 0 ? 'positive' : assets.loans.change_musd < 0 ? 'negative' : 'neutral'}">
            ${assets.loans.change_musd > 0 ? '+' : ''}${(assets.loans.change_musd / 1000).toFixed(1)}조
          </div>
          ${assets.loans.interpretation ? `
          <div class="item-interpretation">
            <div class="interpretation-title">${escapeHtml(assets.loans.interpretation.split('\n')[0] || '해석')}</div>
            <div class="interpretation-text">${escapeHtml(assets.loans.interpretation.split('\n').slice(1).join('\n') || assets.loans.interpretation).replace(/\n/g, "<br/><br/>")}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- 부채 총합 -->
    <div class="summary-card" style="background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%)">
      <div class="summary-title">FED 부채 총합${targetDate ? ` <span style="font-size:14px;opacity:0.9">(Date: ${targetDate})</span>` : ''}</div>
      <div class="summary-value">$${(totalLiabilities / 1000).toFixed(1)}조</div>
      <div class="summary-change ${totalLiabilitiesChange > 0 ? 'positive' : totalLiabilitiesChange < 0 ? 'negative' : 'neutral'}">
        ${totalLiabilitiesChange > 0 ? '+' : ''}${(totalLiabilitiesChange / 1000).toFixed(1)}조 (${totalLiabilitiesChange > 0 ? '+' : ''}${((totalLiabilitiesChange / (totalLiabilities - totalLiabilitiesChange)) * 100).toFixed(2)}%)
      </div>
    </div>
    
    <!-- FED 부채 -->
    <div class="section">
      <div class="section-title">FED 부채</div>
      <div class="items-grid">
        ${liabilities.currency ? `
        <div class="item-card">
          <div class="item-name">시중통화량 (Currency in circulation)</div>
          <div class="item-value">$${(liabilities.currency.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${liabilities.currency.change_musd > 0 ? 'positive' : liabilities.currency.change_musd < 0 ? 'negative' : 'neutral'}">
            ${liabilities.currency.change_musd > 0 ? '+' : ''}${(liabilities.currency.change_musd / 1000).toFixed(1)}조
          </div>
          ${liabilities.currency.interpretation ? `
          <div class="item-interpretation">
            <div class="interpretation-title">${escapeHtml(liabilities.currency.interpretation.split('\n')[0] || '해석')}</div>
            <div class="interpretation-text">${escapeHtml(liabilities.currency.interpretation.split('\n').slice(1).join('\n') || liabilities.currency.interpretation).replace(/\n/g, "<br/><br/>")}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        ${liabilities.rrp ? `
        <div class="item-card">
          <div class="item-name">역리포 (Reverse Repurchase agreements)</div>
          <div class="item-value">$${(liabilities.rrp.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${liabilities.rrp.change_musd > 0 ? 'positive' : liabilities.rrp.change_musd < 0 ? 'negative' : 'neutral'}">
            ${liabilities.rrp.change_musd > 0 ? '+' : ''}${(liabilities.rrp.change_musd / 1000).toFixed(1)}조
          </div>
          ${liabilities.rrp.interpretation ? `
          <div class="item-interpretation">
            <div class="interpretation-title">${escapeHtml(liabilities.rrp.interpretation.split('\n')[0] || '해석')}</div>
            <div class="interpretation-text">${escapeHtml(liabilities.rrp.interpretation.split('\n').slice(1).join('\n') || liabilities.rrp.interpretation).replace(/\n/g, "<br/><br/>")}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        ${liabilities.tga ? `
        <div class="item-card">
          <div class="item-name">TGA (U.S. Treasury General Account)</div>
          <div class="item-value">$${(liabilities.tga.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${liabilities.tga.change_musd > 0 ? 'positive' : liabilities.tga.change_musd < 0 ? 'negative' : 'neutral'}">
            ${liabilities.tga.change_musd > 0 ? '+' : ''}${(liabilities.tga.change_musd / 1000).toFixed(1)}조
          </div>
          ${liabilities.tga.interpretation ? `
          <div class="item-interpretation">
            <div class="interpretation-title">${escapeHtml(liabilities.tga.interpretation.split('\n')[0] || '해석')}</div>
            <div class="interpretation-text">${escapeHtml(liabilities.tga.interpretation.split('\n').slice(1).join('\n') || liabilities.tga.interpretation).replace(/\n/g, "<br/><br/>")}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        ${liabilities.reserves ? `
        <div class="item-card">
          <div class="item-name">지급준비금 (Reserve balances)</div>
          <div class="item-value">$${(liabilities.reserves.balance_musd / 1000).toFixed(1)}조</div>
          <div class="item-change ${liabilities.reserves.change_musd > 0 ? 'positive' : liabilities.reserves.change_musd < 0 ? 'negative' : 'neutral'}">
            ${liabilities.reserves.change_musd > 0 ? '+' : ''}${(liabilities.reserves.change_musd / 1000).toFixed(1)}조
          </div>
          ${liabilities.reserves.interpretation ? `
          <div class="item-interpretation">
            <div class="interpretation-title">${escapeHtml(liabilities.reserves.interpretation.split('\n')[0] || '해석')}</div>
            <div class="interpretation-text">${escapeHtml(liabilities.reserves.interpretation.split('\n').slice(1).join('\n') || liabilities.reserves.interpretation).replace(/\n/g, "<br/><br/>")}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- 자산-부채 상호 해석 -->
    <div class="section" style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:2px solid #f59e0b">
      <div class="section-title" style="color:#92400e;border-bottom-color:#f59e0b">📊 자산-부채 상호 해석</div>
      <div style="font-size:16px;line-height:1.9;color:#78350f;font-weight:600;padding:16px;background:#ffffff;border-radius:8px;margin-top:16px">
        ${(() => {
          // 자산과 부채의 변화를 종합적으로 분석
          const netChange = totalAssetsChange - totalLiabilitiesChange;
          const assetsTrend = totalAssetsChange > 0 ? "증가" : totalAssetsChange < 0 ? "감소" : "유지";
          const liabilitiesTrend = totalLiabilitiesChange > 0 ? "증가" : totalLiabilitiesChange < 0 ? "감소" : "유지";
          
          let interpretation = "";
          
          // 자산과 부채가 모두 증가하는 경우
          if (totalAssetsChange > 0 && totalLiabilitiesChange > 0) {
            if (totalAssetsChange > totalLiabilitiesChange) {
              interpretation = `현재 FED의 자산과 부채가 모두 증가하고 있지만, 자산 증가폭(${(totalAssetsChange / 1000).toFixed(1)}조)이 부채 증가폭(${(totalLiabilitiesChange / 1000).toFixed(1)}조)보다 큽니다. 이는 연준이 시장에 유동성을 공급하면서도 자산을 더 많이 보유하고 있다는 의미입니다. 거대 자본가들의 관점에서 보면, 이는 연준이 QT를 완화하거나 QE로 전환할 가능성을 시사합니다. 블랙록과 뱅가드는 이런 신호를 포착하여 방어적 포지션에서 공격적 포지션으로 전환을 준비할 수 있습니다.`;
            } else {
              interpretation = `현재 FED의 자산과 부채가 모두 증가하고 있으며, 부채 증가폭(${(totalLiabilitiesChange / 1000).toFixed(1)}조)이 자산 증가폭(${(totalAssetsChange / 1000).toFixed(1)}조)보다 큽니다. 이는 연준이 시장에 유동성을 공급하지만, 그만큼 부채도 늘어나고 있다는 의미입니다. 거대 자본가들은 이런 상황을 '유동성 공급이 부채 증가로 이어지고 있다'고 해석합니다. 이는 인플레이션 압력으로 이어질 수 있어, 블랙록과 뱅가드는 인플레이션 헤지 자산(금, 부동산, TIPS 등)의 비중을 늘리는 전략을 고려할 수 있습니다.`;
            }
          }
          // 자산 증가, 부채 감소
          else if (totalAssetsChange > 0 && totalLiabilitiesChange < 0) {
            interpretation = `현재 FED의 자산은 증가(${(totalAssetsChange / 1000).toFixed(1)}조)하고 있지만 부채는 감소(${Math.abs(totalLiabilitiesChange / 1000).toFixed(1)}조)하고 있습니다. 이는 연준이 자산을 늘리면서도 부채를 줄이고 있다는 의미로, 매우 강력한 유동성 공급 신호입니다. 거대 자본가들의 관점에서 보면, 이는 연준이 적극적으로 시장을 지원하고 있다는 명확한 신호입니다. 블랙록과 뱅가드는 이런 환경에서 리스크 자산(주식, 부동산, 신흥국 자산)의 비중을 늘리는 전략을 취할 수 있습니다.`;
          }
          // 자산 감소, 부채 증가
          else if (totalAssetsChange < 0 && totalLiabilitiesChange > 0) {
            interpretation = `현재 FED의 자산은 감소(${Math.abs(totalAssetsChange / 1000).toFixed(1)}조)하고 있지만 부채는 증가(${(totalLiabilitiesChange / 1000).toFixed(1)}조)하고 있습니다. 이는 연준이 자산을 줄이면서도 부채는 늘어나고 있다는 의미로, QT가 진행 중이지만 부채 구조는 복잡한 상황입니다. 거대 자본가들은 이런 상황을 'QT가 진행되지만 부채 압력은 여전히 존재한다'고 해석합니다. 블랙록과 뱅가드는 이런 환경에서 방어적 포지션을 유지하면서, 다음 정책 전환 시점을 주시합니다.`;
          }
          // 자산과 부채가 모두 감소하는 경우
          else if (totalAssetsChange < 0 && totalLiabilitiesChange < 0) {
            if (Math.abs(totalAssetsChange) > Math.abs(totalLiabilitiesChange)) {
              interpretation = `현재 FED의 자산과 부채가 모두 감소하고 있지만, 자산 감소폭(${Math.abs(totalAssetsChange / 1000).toFixed(1)}조)이 부채 감소폭(${Math.abs(totalLiabilitiesChange / 1000).toFixed(1)}조)보다 큽니다. 이는 연준이 적극적으로 QT를 진행하고 있다는 의미입니다. 거대 자본가들의 관점에서 보면, 이는 유동성 축소가 가속화되고 있다는 신호입니다. 블랙록과 뱅가드는 이런 환경에서 현금 비중을 늘리고, 방어적 자산(국채, 달러)의 비중을 높이는 전략을 취합니다.`;
            } else {
              interpretation = `현재 FED의 자산과 부채가 모두 감소하고 있으며, 부채 감소폭(${Math.abs(totalLiabilitiesChange / 1000).toFixed(1)}조)이 자산 감소폭(${Math.abs(totalAssetsChange / 1000).toFixed(1)}조)보다 큽니다. 이는 연준이 부채를 더 적극적으로 줄이고 있다는 의미입니다. 거대 자본가들은 이런 상황을 '부채 구조 개선이 자산 축소보다 우선순위가 높다'고 해석합니다. 블랙록과 뱅가드는 이런 환경에서 중립적 포지션을 유지하면서, 다음 정책 전환 시점을 주시합니다.`;
            }
          }
          // 자산과 부채가 모두 유지되는 경우
          else {
            interpretation = `현재 FED의 자산과 부채가 모두 안정적으로 유지되고 있습니다. 이는 연준이 현재 수준을 유지하면서 시장 반응을 지켜보고 있다는 의미입니다. 거대 자본가들의 관점에서 보면, 이는 '관찰 모드'에 진입했다는 신호입니다. 블랙록과 뱅가드는 이런 환경에서 균형 잡힌 포트폴리오를 유지하면서, 다음 정책 전환 시점에 대비합니다.`;
          }
          
          return escapeHtml(interpretation);
        })()}
      </div>
    </div>
    
    <!-- 경제 코치 종합 진단 -->
    <div class="analysis-section">
      <div class="analysis-title">🎯 경제 코치 종합 진단</div>
      <div class="analysis-content">${escapeHtml(analysis)}</div>
    </div>
    
    <!-- 최근 자산.부채 추이 테이블 (새 API 기반) -->
    <div class="history-table-section">
      <div class="history-table-title">최근 자산.부채 추이 📈</div>
      <div class="history-table-wrapper">
        <table class="history-table" id="historyTable">
          <thead>
            <tr>
              <th class="sticky-col">날짜</th>
              <th class="asset-col">자산 합계 (조)</th>
              <th class="asset-col">국채 (조)</th>
              <th class="asset-col">MBS (조)</th>
              <th class="asset-col">리포 (조)</th>
              <th class="asset-col">대출 (조)</th>
              <th class="liability-col">부채 합계 (조)</th>
              <th class="liability-col">통화발행 (조)</th>
              <th class="liability-col">역리포 (조)</th>
              <th class="liability-col">TGA (조)</th>
              <th class="liability-col">지준금 (조)</th>
            </tr>
          </thead>
          <tbody id="historyTableBody">
            <!-- 초기 로딩 중... (클라이언트 사이드에서 새 API로 로드) -->
          </tbody>
        </table>
        <!-- 디버그 UI (쿼리스트링 ?debugUI=1로 활성화) -->
        <div id="historyTableDebug" style="margin-top:12px;padding:12px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;font-size:11px;font-family:monospace;color:#6b7280;display:none">
          <div style="margin-bottom:8px">
            <strong style="color:#374151">[Debug Panel]</strong>
            <button id="debugToggleBtn" onclick="toggleDebugPanel()" style="margin-left:8px;padding:4px 8px;background:#3b82f6;color:#fff;border:none;border-radius:4px;font-size:10px;cursor:pointer">Toggle</button>
          </div>
          <div id="debugContent" style="display:none">
            <div style="margin-bottom:6px"><strong>Fetch URL:</strong> <span id="debugFetchUrl">-</span></div>
            <div style="margin-bottom:6px"><strong>Response:</strong> <span id="debugResponse">-</span></div>
            <div style="margin-bottom:6px"><strong>Data:</strong> <span id="debugData">-</span></div>
            <div style="margin-bottom:6px"><strong>State:</strong> <span id="debugState">-</span></div>
            <div style="margin-bottom:6px"><strong>DOM:</strong> <span id="debugDOM">-</span></div>
            <div style="margin-bottom:6px"><strong>Last Error:</strong> <span id="debugError" style="color:#dc2626">-</span></div>
            <div style="margin-top:12px;margin-bottom:6px"><strong>RAW rows[0] JSON:</strong></div>
            <pre id="debugRawJson" style="background:#ffffff;padding:8px;border:1px solid #d1d5db;border-radius:4px;overflow-x:auto;font-size:10px;max-height:200px;overflow-y:auto">-</pre>
          </div>
        </div>
      </div>
      <div style="text-align:center;margin-top:20px">
        <button id="loadMoreBtn" onclick="handleTrendMore()" style="padding:12px 24px;background:#3b82f6;color:#ffffff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;display:none">
          더보기
        </button>
      </div>
    </div>
  </div>
  
  <script>
    (function() {
      // 서버 사이드에서는 실행하지 않음
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
      }
      
      console.log('[HistoryTable] init ok');
      
      // 새 API 기반 상태 관리
      // @type {Array<{date: string, assetTotal: {value: number, delta: number|null}, ...}>}
      let allRows = [];
      // @type {string|null}
      let nextCursor = null;
      let isLoadingMore = false;
      const tbody = document.getElementById('historyTableBody');
      const loadMoreBtn = document.getElementById('loadMoreBtn');
      const debugBox = document.getElementById('historyTableDebug');
      let lastFetchUrl = '';
      // @type {{ok?: boolean, status?: number, statusText?: string}|null}
      let lastResponse = null;
      // @type {any}
      let lastData = null;
      // @type {string|null}
      let lastError = null;
      let visibleRowsCount = 0;
      
      // 디버그 UI 활성화 체크 (?debugUI=1 쿼리스트링)
      const urlParams = new URLSearchParams(window.location.search);
      const debugUIEnabled = urlParams.get('debugUI') === '1';
      
      // 디버그 패널 토글 함수
      window.toggleDebugPanel = function() {
        const debugContent = document.getElementById('debugContent');
        if (debugContent) {
          debugContent.style.display = debugContent.style.display === 'none' ? 'block' : 'none';
        }
      };
      
      // 디버깅 정보 업데이트 함수
      function updateDebugInfo() {
        if (!debugUIEnabled || !debugBox) return;
        
        debugBox.style.display = 'block';
        
        // Fetch URL
        const debugFetchUrl = document.getElementById('debugFetchUrl');
        if (debugFetchUrl) {
          debugFetchUrl.textContent = lastFetchUrl || '-';
        }
        
        // Response
        const debugResponse = document.getElementById('debugResponse');
        if (debugResponse) {
          if (lastResponse) {
            debugResponse.textContent = 'ok: ' + (lastResponse.ok ? 'true' : 'false') + ', status: ' + (lastResponse.status || 'N/A') + ', statusText: ' + (lastResponse.statusText || 'N/A');
          } else {
            debugResponse.textContent = '-';
          }
        }
        
        // Data
        const debugData = document.getElementById('debugData');
        if (debugData) {
          if (lastData) {
            debugData.textContent = 'ok: ' + (lastData.ok ? 'true' : 'false') + ', rows.length: ' + (Array.isArray(lastData.rows) ? lastData.rows.length : 'not array') + ', rows[0]?.date: ' + (Array.isArray(lastData.rows) && lastData.rows.length > 0 ? (lastData.rows[0]?.date || 'N/A') : 'N/A');
          } else {
            debugData.textContent = '-';
          }
        }
        
        // State
        const debugState = document.getElementById('debugState');
        if (debugState) {
          debugState.textContent = 'allRows.length: ' + (Array.isArray(allRows) ? allRows.length : 'not array') + ', visibleRows.length: ' + visibleRowsCount + ', nextCursor: ' + (nextCursor || 'null');
        }
        
        // DOM
        const debugDOM = document.getElementById('debugDOM');
        if (debugDOM) {
          const tbodyRows = document.querySelectorAll('#historyTableBody tr').length;
          debugDOM.textContent = 'tbody tr count: ' + tbodyRows;
        }
        
        // Last Error
        const debugError = document.getElementById('debugError');
        if (debugError) {
          debugError.textContent = lastError || '-';
        }
        
        // RAW JSON
        const debugRawJson = document.getElementById('debugRawJson');
        if (debugRawJson) {
          if (Array.isArray(allRows) && allRows.length > 0) {
            try {
              debugRawJson.textContent = JSON.stringify(allRows[0], null, 2);
            } catch (e) {
              debugRawJson.textContent = 'Error stringifying: ' + (e instanceof Error ? e.message : String(e));
            }
          } else {
            debugRawJson.textContent = 'No rows available';
          }
        }
      }
      
      // Canonicalize 함수 (클라이언트 사이드) - 서버와 동일한 로직
      function canonicalizeItemKey(label) {
        if (!label) return "";
        // 공백/괄호/마침표/유니코드 공백 제거 후 소문자 변환
        const s = label
          .replace(/\u00a0/g, " ") // 유니코드 공백
          .replace(/[()]/g, " ") // 괄호 제거
          .replace(/\./g, " ") // 마침표 제거
          .replace(/\s+/g, " ") // 연속 공백 정리
          .toLowerCase()
          .trim();
        
        // 국채 우선 매칭 (treasury가 general account와 혼동되지 않도록)
        if (s.includes("treasury") && !s.includes("general") && !s.includes("account")) return "treasury";
        if (s.includes("국채")) return "treasury";
        if (s.includes("u.s. treasury") || s.includes("us treasury")) return "treasury";
        if (s.includes("treasury securities")) return "treasury";
        
        // TGA는 treasury보다 먼저 체크 (treasury general account)
        if (s.includes("tga") || (s.includes("treasury") && s.includes("general"))) return "tga";
        
        if (s.includes("mbs") || s.includes("mortgage")) return "mbs";
        if (s.includes("repo") && !s.includes("reverse")) return "repo";
        if (s.includes("loan") || s.includes("대출") || s.includes("primary credit")) return "loans";
        if (s.includes("currency") || s.includes("통화")) return "currency";
        if (s.includes("reverse") && s.includes("repo")) return "rrp";
        if (s.includes("reserve") && s.includes("balance")) return "reserves";
        
        // 이미 canonical key인 경우 그대로 반환
        const canonicalKeys = ["treasury", "mbs", "repo", "loans", "currency", "rrp", "tga", "reserves"];
        if (canonicalKeys.includes(s)) return s;
        
        return s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      }
      
      // 증감 계산 함수
      function getChangeDisplay(current, previous) {
        try {
          if (current === null || current === undefined || previous === null || previous === undefined) return '';
          const currentNum = typeof current === 'number' ? current : (typeof current === 'string' ? parseFloat(current) : 0);
          const prevNum = typeof previous === 'number' ? previous : (typeof previous === 'string' ? parseFloat(previous) : 0);
          if (!Number.isFinite(currentNum) || !Number.isFinite(prevNum)) return '';
          const change = currentNum - prevNum;
          if (!Number.isFinite(change)) return '';
          const sign = change >= 0 ? '+' : '';
          return '<div style="font-size:11px;color:' + (change >= 0 ? '#059669' : '#dc2626') + ';margin-top:2px">Δ ' + sign + (change / 1000).toFixed(1) + '</div>';
        } catch (e) {
          console.warn('[History Table] Error calculating change display:', e, { current, previous });
          return '';
        }
      }
      
      function safeFormatNumber(value) {
        try {
          if (value === null || value === undefined) return '0.0';
          const num = typeof value === 'number' ? value : (typeof value === 'string' ? parseFloat(value) : 0);
          if (!Number.isFinite(num)) return '0.0';
          return (num / 1000).toFixed(1);
        } catch (e) {
          console.warn('[History Table] Error formatting number:', e, value);
          return '0.0';
        }
      }
      
      function safeFormatDate(dateStr) {
        try {
          if (!dateStr || typeof dateStr !== 'string') return 'Invalid Date';
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return dateStr; // Invalid date, return original string
          return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        } catch (e) {
          console.warn('[History Table] Error formatting date:', e, dateStr);
          return dateStr || 'Invalid Date';
        }
      }
      
      // 테이블 렌더링 함수 (강화된 예외 처리 및 단순화)
      function renderTableRows() {
        if (!tbody) {
          console.error('[History Table] tbody element not found');
          lastError = 'tbody element not found';
          if (debugUIEnabled) updateDebugInfo();
          return;
        }
        
        try {
          tbody.innerHTML = ''; // 기존 내용 지우기
          visibleRowsCount = 0;
          
          if (!Array.isArray(allRows)) {
            // 배열이 아닌 경우
            const errorRow = document.createElement('tr');
            errorRow.className = 'history-row';
            errorRow.innerHTML = '<td colspan="11" style="text-align:center;padding:24px;color:#dc2626">데이터 형식 오류: rows가 배열이 아닙니다. (typeof: ' + typeof allRows + ')</td>';
            tbody.appendChild(errorRow);
            lastError = 'allRows is not an array (typeof: ' + typeof allRows + ')';
            if (debugUIEnabled) updateDebugInfo();
            return;
          }
          
          if (allRows.length === 0) {
            // 빈 상태 처리 (헤더만 보이는 UI 금지)
            const emptyRow = document.createElement('tr');
            emptyRow.className = 'history-row';
            emptyRow.innerHTML = '<td colspan="11" style="text-align:center;padding:24px;color:#6b7280">표시할 데이터가 없습니다. ' + (debugUIEnabled ? '(디버그 UI 활성화: ?debugUI=1)' : '(디버그 UI로 확인: ?debugUI=1)') + '</td>';
            tbody.appendChild(emptyRow);
            console.warn('[History Table] No rows to render. allRows:', allRows);
            lastError = 'allRows.length === 0';
            if (debugUIEnabled) updateDebugInfo();
            return;
          }
          
          // 디버깅 정보
          console.log('[History Table Debug] Rendering rows:', {
            rowsLength: allRows.length,
            firstRowDate: allRows[0]?.date,
            lastRowDate: allRows[allRows.length - 1]?.date,
            firstRowSample: allRows[0]
          });
          
          if (debugUIEnabled) {
            updateDebugInfo();
          }
          
          let successCount = 0;
          let errorCount = 0;
          
          allRows.forEach(function(item, index) {
            try {
              // 데이터 유효성 검증
              if (!item || typeof item !== 'object') {
                console.warn('[History Table] Invalid row item at index', index, item);
                errorCount++;
                return;
              }
              
              // 날짜 안전 포맷팅
              const formattedDate = safeFormatDate(item.date);
              const prevItem = allRows[index + 1] || null; // 다음 항목이 이전 항목이 됨
              
              // 값 안전 추출 (null/undefined 방어)
              const assetTotalValue = (item.assetTotal && typeof item.assetTotal === 'object') ? (item.assetTotal.value ?? 0) : (item.assetTotal ?? 0);
              const treasuryValue = (item.treasury && typeof item.treasury === 'object') ? (item.treasury.value ?? 0) : (item.treasury ?? 0);
              const mbsValue = (item.mbs && typeof item.mbs === 'object') ? (item.mbs.value ?? 0) : (item.mbs ?? 0);
              const repoValue = (item.repo && typeof item.repo === 'object') ? (item.repo.value ?? 0) : (item.repo ?? 0);
              const loansValue = (item.loans && typeof item.loans === 'object') ? (item.loans.value ?? 0) : (item.loans ?? 0);
              const liabilityTotalValue = (item.liabilityTotal && typeof item.liabilityTotal === 'object') ? (item.liabilityTotal.value ?? 0) : (item.liabilityTotal ?? 0);
              const currencyValue = (item.currency && typeof item.currency === 'object') ? (item.currency.value ?? 0) : (item.currency ?? 0);
              const rrpValue = (item.rrp && typeof item.rrp === 'object') ? (item.rrp.value ?? 0) : (item.rrp ?? 0);
              const tgaValue = (item.tga && typeof item.tga === 'object') ? (item.tga.value ?? 0) : (item.tga ?? 0);
              const reservesValue = (item.reserves && typeof item.reserves === 'object') ? (item.reserves.value ?? 0) : (item.reserves ?? 0);
              
              // Delta 값 안전 추출
              const assetTotalDelta = (prevItem && prevItem.assetTotal && typeof prevItem.assetTotal === 'object') ? prevItem.assetTotal.value : (prevItem?.assetTotal ?? null);
              const treasuryDelta = (prevItem && prevItem.treasury && typeof prevItem.treasury === 'object') ? prevItem.treasury.value : (prevItem?.treasury ?? null);
              const mbsDelta = (prevItem && prevItem.mbs && typeof prevItem.mbs === 'object') ? prevItem.mbs.value : (prevItem?.mbs ?? null);
              const repoDelta = (prevItem && prevItem.repo && typeof prevItem.repo === 'object') ? prevItem.repo.value : (prevItem?.repo ?? null);
              const loansDelta = (prevItem && prevItem.loans && typeof prevItem.loans === 'object') ? prevItem.loans.value : (prevItem?.loans ?? null);
              const liabilityTotalDelta = (prevItem && prevItem.liabilityTotal && typeof prevItem.liabilityTotal === 'object') ? prevItem.liabilityTotal.value : (prevItem?.liabilityTotal ?? null);
              const currencyDelta = (prevItem && prevItem.currency && typeof prevItem.currency === 'object') ? prevItem.currency.value : (prevItem?.currency ?? null);
              const rrpDelta = (prevItem && prevItem.rrp && typeof prevItem.rrp === 'object') ? prevItem.rrp.value : (prevItem?.rrp ?? null);
              const tgaDelta = (prevItem && prevItem.tga && typeof prevItem.tga === 'object') ? prevItem.tga.value : (prevItem?.tga ?? null);
              const reservesDelta = (prevItem && prevItem.reserves && typeof prevItem.reserves === 'object') ? prevItem.reserves.value : (prevItem?.reserves ?? null);
              
              const row = document.createElement('tr');
              row.className = 'history-row';
              row.setAttribute('data-date', item.date || '');
              
              row.innerHTML = 
                '<td class="sticky-col">' + (formattedDate || item.date || 'N/A') + '</td>' +
                '<td class="asset-cell" data-value="' + assetTotalValue + '">' +
                  '$' + safeFormatNumber(assetTotalValue) +
                  getChangeDisplay(assetTotalValue, assetTotalDelta) +
                '</td>' +
                '<td class="asset-cell" data-value="' + treasuryValue + '">' +
                  '$' + safeFormatNumber(treasuryValue) +
                  getChangeDisplay(treasuryValue, treasuryDelta) +
                '</td>' +
                '<td class="asset-cell" data-value="' + mbsValue + '">' +
                  '$' + safeFormatNumber(mbsValue) +
                  getChangeDisplay(mbsValue, mbsDelta) +
                '</td>' +
                '<td class="asset-cell" data-value="' + repoValue + '">' +
                  '$' + safeFormatNumber(repoValue) +
                  getChangeDisplay(repoValue, repoDelta) +
                '</td>' +
                '<td class="asset-cell" data-value="' + loansValue + '">' +
                  '$' + safeFormatNumber(loansValue) +
                  getChangeDisplay(loansValue, loansDelta) +
                '</td>' +
                '<td class="liability-cell" data-value="' + liabilityTotalValue + '">' +
                  '$' + safeFormatNumber(liabilityTotalValue) +
                  getChangeDisplay(liabilityTotalValue, liabilityTotalDelta) +
                '</td>' +
                '<td class="liability-cell" data-value="' + currencyValue + '">' +
                  '$' + safeFormatNumber(currencyValue) +
                  getChangeDisplay(currencyValue, currencyDelta) +
                '</td>' +
                '<td class="liability-cell" data-value="' + rrpValue + '">' +
                  '$' + safeFormatNumber(rrpValue) +
                  getChangeDisplay(rrpValue, rrpDelta) +
                '</td>' +
                '<td class="liability-cell" data-value="' + tgaValue + '">' +
                  '$' + safeFormatNumber(tgaValue) +
                  getChangeDisplay(tgaValue, tgaDelta) +
                '</td>' +
                '<td class="liability-cell" data-value="' + reservesValue + '">' +
                  '$' + safeFormatNumber(reservesValue) +
                  getChangeDisplay(reservesValue, reservesDelta) +
                '</td>';
              
              tbody.appendChild(row);
              successCount++;
              visibleRowsCount++;
            } catch (e) {
              console.error('[History Table] Error rendering row at index', index, ':', e, item);
              errorCount++;
              lastError = 'Row ' + index + ' render error: ' + (e instanceof Error ? e.message : String(e));
              
              // 에러 행도 placeholder로 표시 (렌더링 중단 방지)
              try {
                const errorRow = document.createElement('tr');
                errorRow.className = 'history-row error-row';
                errorRow.innerHTML = '<td colspan="11" style="text-align:center;padding:8px;color:#dc2626;font-size:12px">Row ' + (index + 1) + ': Error rendering (' + (item?.date || 'unknown date') + ')</td>';
                tbody.appendChild(errorRow);
                visibleRowsCount++;
              } catch (err2) {
                console.error('[History Table] Failed to create error row:', err2);
              }
            }
          });
          
          console.log('[History Table Debug] Render complete:', { successCount, errorCount, total: allRows.length, visibleRowsCount });
          
          // 성공한 행이 하나도 없으면 에러 메시지 표시 (헤더만 보이는 UI 금지)
          if (successCount === 0 && errorCount > 0) {
            const errorRow = document.createElement('tr');
            errorRow.className = 'history-row';
            errorRow.innerHTML = '<td colspan="11" style="text-align:center;padding:24px;color:#dc2626">모든 행 렌더링 실패. ' + (debugUIEnabled ? '디버그 패널을 확인하세요.' : '?debugUI=1로 디버그 정보를 확인하세요.') + '</td>';
            tbody.appendChild(errorRow);
            visibleRowsCount++;
          }
          
          // 디버그 정보 업데이트 (DOM 카운트 포함)
          if (debugUIEnabled) {
            updateDebugInfo();
          }
        } catch (e) {
          console.error('[History Table] Critical error in renderTableRows:', e);
          lastError = 'Critical render error: ' + (e instanceof Error ? e.message : String(e));
          if (tbody) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#dc2626">테이블 렌더링 중 오류가 발생했습니다: ' + (e?.message || String(e)) + '</td></tr>';
            visibleRowsCount = 1;
          }
          if (debugUIEnabled) {
            updateDebugInfo();
          }
        }
      }
      
      // API에서 데이터 가져오기 및 렌더링 (강화된 예외 처리 및 캐시 제어)
      async function fetchAndRenderHistory(limit, cursor) {
        if (isLoadingMore) {
          console.log('[History Table] Already loading, skipping...');
          return;
        }
        isLoadingMore = true;
        if (loadMoreBtn) {
          loadMoreBtn.disabled = true;
          loadMoreBtn.textContent = '로딩 중...';
        }
        
        let fetchUrl = '';
        
        try {
          fetchUrl = '/api/h41/releases?limit=' + limit + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
          lastFetchUrl = fetchUrl;
          
          console.log('[HistoryTable] fetching', fetchUrl);
          
          if (debugUIEnabled) {
            updateDebugInfo();
          }
          
          // 캐시 제어: 동적 데이터이므로 항상 최신 데이터 가져오기
          const response = await fetch(fetchUrl, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          
          // Response 정보 저장 (디버그용)
          lastResponse = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText
          };
          
          if (!response.ok) {
            lastError = 'HTTP ' + response.status + ': ' + response.statusText;
            throw new Error(lastError);
          }
          
          const data = await response.json();
          lastData = data;
          lastError = null;
          
          console.log('[HistoryTable] rows', Array.isArray(data.rows) ? data.rows.length : 'not array');
          
          if (debugUIEnabled) {
            console.log('[History Table Debug] API Response:', {
              ok: data.ok,
              rowsLength: Array.isArray(data.rows) ? data.rows.length : 'not array',
              nextCursor: data.nextCursor,
              firstRowDate: Array.isArray(data.rows) && data.rows.length > 0 ? (data.rows[0]?.date || 'N/A') : 'N/A',
              errors: data.errors,
              meta: data.meta
            });
            updateDebugInfo();
          }
          
          // 안전장치 1: fetch 실패/에러
          if (!data.ok) {
            console.error('[History Table] API returned error:', data.errors);
            lastError = 'API error: ' + (Array.isArray(data.errors) ? data.errors.join(', ') : (data.errors ? String(data.errors) : 'Unknown error'));
            if (tbody) {
              tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#dc2626">API 요청 실패: ' + lastError + '</td></tr>';
            }
            if (loadMoreBtn) loadMoreBtn.textContent = '로드 실패';
            if (debugUIEnabled) updateDebugInfo();
            return;
          }
          
          // 안전장치 2: data.rows가 배열이 아님
          if (!Array.isArray(data.rows)) {
            console.error('[History Table] Invalid response: data.rows is not an array', {
              dataType: typeof data.rows,
              dataRows: data.rows,
              fullData: data
            });
            lastError = '응답 포맷 오류: data.rows is not an array (typeof: ' + typeof data.rows + ')';
            if (tbody) {
              tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#dc2626">' + lastError + '</td></tr>';
            }
            if (loadMoreBtn) loadMoreBtn.textContent = '로드 실패';
            if (debugUIEnabled) updateDebugInfo();
            return;
          }
          
          // 안전장치 3: rows.length === 0
          if (data.rows.length === 0) {
            console.warn('[History Table] API returned empty rows array');
            lastError = 'rows.length === 0';
            if (allRows.length === 0 && tbody) {
              tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#6b7280">표시할 데이터가 없습니다. ' + (debugUIEnabled ? '디버그 패널을 확인하세요.' : '(디버그 UI로 확인: ?debugUI=1)') + '</td></tr>';
            }
            if (loadMoreBtn) {
              loadMoreBtn.style.display = 'none';
              loadMoreBtn.disabled = false;
            }
            if (debugUIEnabled) updateDebugInfo();
            return;
          }
          
          console.log('[History Table] Received', data.rows.length, 'rows from API. Current allRows length:', allRows.length);
          
          // 새 데이터를 기존 데이터에 추가 (중복 방지)
          const newRows = data.rows.filter(function(newRow) {
            return !allRows.some(function(existingRow) {
              return existingRow && newRow && existingRow.date === newRow.date;
            });
          });
          
          if (newRows.length > 0) {
            allRows = allRows.concat(newRows);
            console.log('[History Table] Added', newRows.length, 'new rows. Total rows:', allRows.length);
          } else {
            console.log('[History Table] No new rows to add (all duplicates)');
          }
          
          nextCursor = data.nextCursor || null;
          
          // 테이블 렌더링
          renderTableRows();
          
          // 디버깅 정보 업데이트
          if (debugUIEnabled) {
            updateDebugInfo();
          }
          
          if (loadMoreBtn) {
            if (nextCursor) {
              loadMoreBtn.style.display = 'block';
              loadMoreBtn.disabled = false;
              loadMoreBtn.textContent = '더보기';
            } else {
              loadMoreBtn.style.display = 'none';
              loadMoreBtn.disabled = false;
            }
          }
        } catch (e) {
          console.error('[History Table] Failed to fetch history:', e, { fetchUrl, limit, cursor });
          lastError = 'Fetch error: ' + (e instanceof Error ? e.message : String(e));
          if (tbody && allRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#dc2626">API 요청 실패: ' + lastError + '</td></tr>';
          }
          if (loadMoreBtn) {
            loadMoreBtn.textContent = '로드 실패';
            loadMoreBtn.disabled = false;
          }
          if (debugUIEnabled) {
            updateDebugInfo();
          }
        } finally {
          isLoadingMore = false;
        }
      }
      
      // 더보기 히스토리 로드 함수 (limit+1 패턴으로 delta 계산 보장)
      async function loadMoreHistory() {
        if (!nextCursor || isLoadingMore) {
          if (loadMoreBtn && !nextCursor) loadMoreBtn.style.display = 'none';
          return;
        }
        // limit+1로 요청하여 마지막 행의 delta 계산을 위한 이전 데이터 확보
        await fetchAndRenderHistory(5, nextCursor);
      }
      
      // 날짜 조회 핸들러 (직접 바인딩 - 전역 이벤트 위임 제거)
      window.handleDateFetch = function() {
        console.log('DATE_FETCH_CLICK');
        const selectEl = document.getElementById('releaseSelect');
        if (!selectEl) {
          console.warn('RELEASE_SELECT_MISSING');
          alert('날짜 선택 요소를 찾을 수 없습니다.');
          return;
        }
        
        const selectedDate = selectEl.value;
        console.log('RELEASE_SELECTED:', selectedDate);
        
        if (selectedDate) {
          window.location.href = '/economic-indicators/fed-assets-liabilities?date=' + selectedDate;
        } else {
          window.location.href = '/economic-indicators/fed-assets-liabilities';
        }
      };
      
      // 초기화 핸들러 (직접 바인딩)
      window.handleResetDate = function() {
        console.log('RESET_DATE_CLICK');
        window.location.href = '/economic-indicators/fed-assets-liabilities';
      };
      
      // 더보기 핸들러 (직접 바인딩 - 전역 이벤트 위임 제거)
      window.handleTrendMore = function() {
        console.log('TREND_MORE_CLICK');
        loadMoreHistory();
      };
      
      // 초기 로드 (limit+1 패턴으로 delta 계산 보장)
      // 화면에는 5개만 보여주되, 6개를 가져와서 5번째 행의 delta 계산에 사용
      fetchAndRenderHistory(5, null);
      
      // 디버깅 박스 초기화 (?debugUI=1일 때만)
      if (debugUIEnabled && debugBox) {
        debugBox.style.display = 'block';
        const debugContent = document.getElementById('debugContent');
        if (debugContent) {
          debugContent.style.display = 'block';
        }
        updateDebugInfo();
      }
      
      console.log('RELEASE_BIND_OK');
    })();
  </script>
</body>
</html>
    `);
  } catch (e: any) {
    res.status(500).send(`오류 발생: ${e?.message ?? String(e)}`);
  }
});

// 경제 코치 LLM 분석 생성 함수 (고급 분석)
async function generateEconomicCoachAnalysis(data: {
  assets: any;
  liabilities: any;
  totalAssets: number;
  totalAssetsChange: number;
  totalLiabilities: number;
  totalLiabilitiesChange: number;
  report: any;
  economicIndicators: any;
  economicNews: Array<{ title: string; source: string; publishedAt: string }>;
}): Promise<string> {
  const { assets, liabilities, totalAssets, totalAssetsChange, totalLiabilities, totalLiabilitiesChange, report, economicIndicators, economicNews } = data;
  
  // 심층 분석을 위한 데이터 준비
  const securitiesChange = (assets.treasury?.change_musd || 0) + (assets.mbs?.change_musd || 0);
  const qtSignal = securitiesChange < -50000;
  const qeSignal = securitiesChange > 50000;
  
  // 경제 지표에서 주요 데이터 추출
  const fedRate = economicIndicators?.find((i: any) => i.id === "fed-funds-rate");
  const dxy = economicIndicators?.find((i: any) => i.id === "dxy");
  const sp500 = economicIndicators?.find((i: any) => i.id === "sp500");
  const vix = economicIndicators?.find((i: any) => i.id === "vix");
  const yieldSpread = economicIndicators?.find((i: any) => i.id === "yield-spread");
  
  // 분석 시작 - 금융패권자 관점으로 통합 분석
  let analysis = "";
  
  // 통합 서론: 거시경제의 큰 그림
  analysis += `🎯 [경제 코치 종합 진단: 금융패권자의 눈으로 본 거시경제]\n\n`;
  
  analysis += `이번 주 FED 대차대조표의 변화는 단순한 숫자가 아닙니다. `;
  analysis += `자산 $${(totalAssets / 1000).toFixed(1)}조(${totalAssetsChange > 0 ? `+${(totalAssetsChange / 1000).toFixed(1)}조` : totalAssetsChange < 0 ? `${(totalAssetsChange / 1000).toFixed(1)}조` : '변동 없음'}), `;
  analysis += `부채 $${(totalLiabilities / 1000).toFixed(1)}조(${totalLiabilitiesChange > 0 ? `+${(totalLiabilitiesChange / 1000).toFixed(1)}조` : totalLiabilitiesChange < 0 ? `${(totalLiabilitiesChange / 1000).toFixed(1)}조` : '변동 없음'})의 움직임은 `;
  analysis += `블랙록(BlackRock), 뱅가드(Vanguard), 스테이트 스트릿(State Street), JPMorgan, Fidelity Investment 같은 금융패권자들이 `;
  analysis += `글로벌 자본을 어떻게 배분하고 있는지를 보여주는 거울입니다. `;
  analysis += `이들이 보는 것은 단순한 수치가 아니라, 미국과 중국의 헤게모니 경쟁, 달러 체제의 안정성, 그리고 글로벌 자산 가격의 다음 움직임입니다.\n\n`;
  
  // 미국 vs 중국: 헤게모니 경쟁 관점
  analysis += `🌍 [미국 vs 중국: 헤게모니 경쟁의 이면]\n\n`;
  
  if (qtSignal) {
    analysis += `현재 QT 진행은 미국이 의도적으로 글로벌 달러 유동성을 축소하고 있음을 의미합니다. `;
    analysis += `이는 단순한 통화정책이 아니라, 중국의 위안화 국제화와 디지털 위안화(DCEP) 확산에 대응하는 전략적 움직임입니다. `;
    if (dxy && dxy.value && dxy.value > 105) {
      analysis += `달러 강세(${dxy.value.toFixed(1)})는 미국의 금융 헤게모니를 강화하면서, 중국을 포함한 신흥국에 자본 유출 압력을 가하고 있습니다. `;
    }
    analysis += `블랙록과 뱅가드는 이런 환경에서 중국 자산의 비중을 줄이고, 미국 자산으로의 전환을 가속화하고 있습니다. `;
    analysis += `특히 중국 국채와 기업채에 대한 신용 리스크를 재평가하며, 미국 국채와 달러 자산의 상대적 매력을 높게 평가하고 있습니다.\n\n`;
  } else if (qeSignal) {
    analysis += `QE 진행은 미국이 글로벌 유동성을 확대하여 세계 경제를 자극하려는 시도입니다. `;
    analysis += `하지만 이는 동시에 중국에게도 기회를 제공합니다. `;
    analysis += `중국은 이런 환경에서 위안화 국제화를 가속화하고, 아시아 인프라 투자은행(AIIB)과 일대일로 전략을 통해 영향력을 확대하고 있습니다. `;
    analysis += `금융패권자들은 이런 변화를 주시하며, 미국과 중국 자산의 균형을 재조정하고 있습니다.\n\n`;
  } else {
    analysis += `현재 중립적 통화정책은 미국과 중국이 서로의 움직임을 관찰하며 다음 수를 두고 있는 시점입니다. `;
    analysis += `블랙록과 뱅가드는 이런 전환 구간에서 매우 신중하게 포지션을 조정합니다. `;
    analysis += `한쪽에 과도하게 기울지 않으면서, 양쪽의 정책 변화에 유연하게 대응할 수 있는 포트폴리오를 유지하고 있습니다.\n\n`;
  }
  
  // 통합 해석: 금융패권자들이 보는 큰 그림 (금융패권자 관점을 전반에 통합)
  analysis += `🔍 [통합 해석: 금융패권자들이 보는 거시경제의 큰 그림]\n\n`;
  
  const netLiquidity = totalAssetsChange - totalLiabilitiesChange;
  if (netLiquidity < -50000) {
    analysis += `현재 순 유동성 흡수 환경에서, 블랙록(BlackRock), 뱅가드(Vanguard), 스테이트 스트릿(State Street), JPMorgan, Fidelity Investment 같은 금융패권자들은 모두 공통적으로 방어적 포지션을 강화하고 있습니다. `;
    if (assets.treasury && assets.treasury.change_musd < -50000) {
      analysis += `FED의 국채 보유 감소(${(Math.abs(assets.treasury.change_musd) / 1000).toFixed(1)}조)는 장기 금리 상승 압력을 만들고 있어, 블랙록은 장기 국채의 비중을 줄이고 단기 채권과 현금으로 전환하며, 주식 포트폴리오에서 성장주보다 가치주에 더 집중하고 있습니다. `;
    }
    if (liabilities.reserves && liabilities.reserves.change_musd < -100000) {
      analysis += `지급준비금의 큰 폭 감소(${(Math.abs(liabilities.reserves.change_musd) / 1000).toFixed(1)}조)를 뱅가드는 매우 경계하며, 즉시 포트폴리오의 방어적 자산 비중을 높이고 변동성이 큰 자산의 비중을 줄입니다. `;
      analysis += `특히 신흥국 자산에 대한 노출을 줄이며, 미국과 유럽 등 선진국 자산으로 전환하고 있습니다. `;
    }
    analysis += `이들은 FED의 QT가 단순한 통화정책이 아니라, 미국의 금융 헤게모니를 유지하기 위한 전략적 움직임임을 알고 있습니다. `;
    analysis += `달러 강세와 결합된 유동성 축소는 신흥국, 특히 중국에 자본 유출 압력을 가하며, `;
    analysis += `이를 통해 미국은 글로벌 자본을 자신의 시장으로 끌어들이고 있습니다. `;
    analysis += `금융패권자들은 이런 흐름을 따라가며, 미국 자산의 비중을 늘리고 신흥국 자산의 비중을 줄이고 있습니다.\n\n`;
  } else if (netLiquidity > 50000) {
    analysis += `순 유동성 공급 확대 환경에서, 금융패권자들은 리스크 자산에 더 적극적으로 투자하고 있습니다. `;
    if (assets.treasury && assets.treasury.change_musd > 50000) {
      analysis += `FED의 국채 보유 증가는 장기 금리 안정화 신호로, 블랙록은 장기 국채와 주식의 균형을 유지하며, 특히 기술주와 성장주에 더 적극적으로 투자하고 있습니다. `;
    }
    if (liabilities.reserves && liabilities.reserves.change_musd > 50000) {
      analysis += `지급준비금 증가는 금융 시스템의 안정성 신호로, 뱅가드는 리스크 자산의 비중을 점진적으로 늘리며, 특히 신흥국 인덱스 펀드에 대한 투자를 늘려 글로벌 다각화를 강화하고 있습니다. `;
    }
    if (sp500 && sp500.changePercent && sp500.changePercent > 0) {
      analysis += `S&P500이 ${sp500.changePercent.toFixed(2)}% 상승하는 환경에서, Fidelity는 개인 투자자들의 401(k)와 IRA 계좌를 통해 주식 시장에 자금을 유입시키고 있습니다. `;
    }
    analysis += `하지만 이들은 동시에 중국의 움직임을 주시하고 있습니다. `;
    analysis += `중국이 이런 환경에서 위안화 국제화와 디지털 위안화를 통해 달러 체제에 도전하고 있기 때문입니다. `;
    analysis += `금융패권자들은 미국과 중국 자산의 균형을 유지하면서, 양쪽의 정책 변화에 유연하게 대응할 수 있는 포트폴리오를 구성하고 있습니다.\n\n`;
  } else {
    analysis += `현재 중립적 환경은 금융패권자들에게 전환 구간으로 보입니다. `;
    if (liabilities.tga && liabilities.tga.change_musd < -50000) {
      analysis += `TGA 감소(${(Math.abs(liabilities.tga.change_musd) / 1000).toFixed(1)}조)는 정부 지출 확대를 의미하며, 스테이트 스트릿은 인프라와 국방 관련 주식에 더 집중하고 있습니다. `;
    }
    if (assets.repo && assets.repo.balance_musd > 10000) {
      analysis += `FED의 리포 증가(${(assets.repo.balance_musd / 1000).toFixed(1)}조)는 금융 시스템에 스트레스가 있다는 신호로, JPMorgan은 신용 리스크를 재평가하며 고수익 채권의 비중을 줄이고 고품질 채권으로 전환하고 있습니다. `;
    }
    analysis += `이들은 미국과 중국의 다음 움직임을 예측하며, 양쪽에 모두 노출되되 한쪽에 과도하게 기울지 않는 전략을 취하고 있습니다. `;
    analysis += `특히 블랙록과 뱅가드는 글로벌 다각화를 강화하며, 지역별, 섹터별로 균형 잡힌 포트폴리오를 유지하고 있습니다.\n\n`;
  }
  
  // 최근 뉴스와의 연계
  if (economicNews && economicNews.length > 0) {
    analysis += `📰 [최근 경제 뉴스: 금융패권자들이 주시하는 신호]\n\n`;
    const relevantNews = economicNews.slice(0, 3);
    relevantNews.forEach((news, idx) => {
      analysis += `${idx + 1}. ${news.title} (${news.source})\n`;
    });
    analysis += `\n`;
    analysis += `이러한 뉴스는 금융패권자들이 FED의 자산/부채 변화를 어떻게 해석하는지를 보여줍니다. `;
    analysis += `블랙록, 뱅가드, 스테이트 스트릿, JPMorgan, Fidelity의 수십억 달러 규모의 자본 이동은 `;
    analysis += `이런 뉴스와 FED 데이터를 종합적으로 분석한 결과입니다. `;
    if (qtSignal) {
      analysis += `QT 진행과 함께 나타나는 경제 지표 변화는 금융패권자들이 방어적으로 전환하는 신호이며, `;
      analysis += `이들의 움직임이 다시 시장 전체를 움직입니다.\n\n`;
    } else {
      analysis += `현재 환경에서 금융패권자들은 다음 정책 전환 시점을 주시하며, 유연하게 대응할 준비를 하고 있습니다.\n\n`;
    }
  }
  
  // 실전 조언: 금융패권자를 따라가는 방법
  analysis += `💡 [실전 조언: 금융패권자를 따라가는 투자 전략]\n\n`;
  
  // 리스크 평가
  let riskLevel = "중간";
  let riskFactors: string[] = [];
  if (liabilities.reserves && liabilities.reserves.change_musd < -100000) {
    riskLevel = "높음";
    riskFactors.push("지급준비금 급감");
  }
  if (qtSignal && vix && vix.value && vix.value > 20) {
    riskLevel = "높음";
    riskFactors.push("QT 진행 + 높은 변동성");
  }
  if (yieldSpread && yieldSpread.value && yieldSpread.value < 0) {
    riskLevel = "높음";
    riskFactors.push("금리스프레드 역전");
  }
  
  analysis += `현재 리스크 수준: ${riskLevel}${riskFactors.length > 0 ? ` (${riskFactors.join(", ")})` : ""}\n\n`;
  
  // 금융패권자 관점의 자산 배분
  analysis += `금융패권자들이 현재 취하고 있는 전략을 참고하면:\n\n`;
  
  if (qtSignal) {
    analysis += `QT 환경에서의 금융패권자 전략:\n`;
    analysis += `블랙록과 뱅가드는 방어적 자산(고품질 채권, 현금)의 비중을 늘리고 있습니다. `;
    analysis += `특히 단기 국채와 현금의 비중을 높이며, 장기 국채는 금리 상승 리스크를 고려해 비중을 줄이고 있습니다. `;
    analysis += `스테이트 스트릿과 JPMorgan은 신용 리스크를 재평가하며, 하이일드 채권의 비중을 줄이고 고품질 회사채로 전환하고 있습니다. `;
    analysis += `Fidelity는 개인 투자자들에게 단계적 매수를 권장하며, 변동성이 큰 성장주보다 가치주에 더 집중하고 있습니다. `;
    analysis += `모든 금융패권자들이 공통적으로 신흥국 자산, 특히 중국 자산의 비중을 줄이며, 미국과 유럽 등 선진국 자산으로 전환하고 있습니다.\n\n`;
  } else if (qeSignal) {
    analysis += `QE 환경에서의 금융패권자 전략:\n`;
    analysis += `블랙록과 뱅가드는 리스크 자산의 비중을 늘리며, 특히 기술주와 성장주에 더 적극적으로 투자하고 있습니다. `;
    analysis += `스테이트 스트릿은 신흥국 인덱스 펀드에 대한 투자를 늘리며, 글로벌 다각화를 강화하고 있습니다. `;
    analysis += `JPMorgan은 하이일드 채권과 주식의 비중을 늘리며, 유동성 확대 환경에서 수익을 극대화하려고 합니다. `;
    analysis += `Fidelity는 개인 투자자들의 401(k)와 IRA 계좌를 통해 주식 시장에 자금을 유입시키고 있습니다.\n\n`;
  } else {
    analysis += `중립적 환경에서의 금융패권자 전략:\n`;
    analysis += `모든 금융패권자들이 균형 잡힌 포트폴리오를 유지하며, 미국과 중국, 선진국과 신흥국 자산의 균형을 맞추고 있습니다. `;
    analysis += `블랙록과 뱅가드는 지역별, 섹터별로 다각화를 강화하며, 한쪽에 과도하게 기울지 않는 전략을 취하고 있습니다. `;
    analysis += `스테이트 스트릿과 JPMorgan은 현금 비중을 유지하며, 다음 정책 전환 시점에 대비하고 있습니다. `;
    analysis += `Fidelity는 개인 투자자들에게 장기 투자 관점을 강조하며, 단기 변동성에 흔들리지 않도록 조언하고 있습니다.\n\n`;
  }
  
  // 시장 타이밍: 금융패권자의 관점
  analysis += `⏰ [시장 타이밍: 금융패권자들이 보는 현재 시점]\n\n`;
  
  if (qtSignal && liabilities.reserves && liabilities.reserves.change_musd < -50000) {
    analysis += `금융패권자들은 현재를 **방어적 전환 시점**으로 보고 있습니다. `;
    analysis += `블랙록과 뱅가드는 이미 포트폴리오의 방어적 자산 비중을 높였으며, `;
    analysis += `개인 투자자들도 이런 움직임을 따라가야 합니다. `;
    analysis += `하지만 금융패권자들은 동시에 과도한 공포가 만드는 매수 기회도 노리고 있습니다. `;
    analysis += `그들은 시장이 과도하게 하락하면 역으로 매수에 나서며, 개인 투자자들보다 훨씬 빠르게 움직입니다.\n\n`;
  } else if (qeSignal && sp500 && sp500.changePercent && sp500.changePercent > 0) {
    analysis += `금융패권자들은 현재를 **리스크 자산 투자 시점**으로 보고 있습니다. `;
    analysis += `하지만 이들은 동시에 과열 신호를 경계하고 있습니다. `;
    analysis += `블랙록과 뱅가드는 수익 실현과 리스크 관리를 병행하며, `;
    analysis += `개인 투자자들도 이런 전략을 따라가야 합니다. `;
    analysis += `금융패권자들은 시장이 과도하게 상승하면 수익을 실현하며, 개인 투자자들보다 훨씬 빠르게 포지션을 조정합니다.\n\n`;
  } else {
    analysis += `금융패권자들은 현재를 **관찰 모드**로 보고 있습니다. `;
    analysis += `이들은 미국과 중국의 다음 움직임을 예측하며, 양쪽의 정책 변화에 유연하게 대응할 준비를 하고 있습니다. `;
    analysis += `개인 투자자들도 이런 환경에서 균형 잡힌 포트폴리오를 유지하며, `;
    analysis += `금융패권자들의 다음 움직임을 주시해야 합니다.\n\n`;
  }
  
  // 마무리: 금융패권자의 관점에서 본 거시경제
  analysis += `🎓 [경제 코치의 한마디: 금융패권자가 보는 거시경제의 진실]\n\n`;
  
  analysis += `FED의 대차대조표는 단순한 숫자가 아닙니다. `;
  analysis += `이것은 블랙록, 뱅가드, 스테이트 스트릿, JPMorgan, Fidelity Investment 같은 금융패권자들이 `;
  analysis += `수십억 달러 규모의 자본을 어떻게 배분하는지를 결정하는 가장 중요한 신호입니다.\n\n`;
  
  analysis += `이들이 보는 것은:\n`;
  analysis += `• 미국과 중국의 헤게모니 경쟁이 어떻게 전개되는가\n`;
  analysis += `• 달러 체제의 안정성이 유지되는가\n`;
  analysis += `• 글로벌 자본이 어디로 흐르는가\n`;
  analysis += `• 다음 금융 위기가 어디서 시작될 수 있는가\n\n`;
  
  analysis += `현재 데이터(${report.asOfWeekEndedText} 기준)를 보면, `;
  if (qtSignal) {
    analysis += `금융패권자들은 방어적으로 전환하고 있으며, 미국의 금융 헤게모니 강화 전략을 따라가고 있습니다. `;
  } else if (qeSignal) {
    analysis += `금융패권자들은 리스크 자산에 투자하고 있지만, 동시에 중국의 움직임을 경계하고 있습니다. `;
  } else {
    analysis += `금융패권자들은 관찰 모드에 있으며, 다음 정책 전환 시점을 주시하고 있습니다. `;
  }
  analysis += `개인 투자자들은 이들의 움직임을 주시하며, 그들의 전략을 참고해야 합니다.\n\n`;
  
  analysis += `하지만 기억하세요: 금융패권자들은 항상 개인 투자자들보다 빠르게 움직입니다. `;
  analysis += `그들이 이미 포지션을 조정한 후에야 개인 투자자들이 그 변화를 느낄 수 있습니다. `;
  analysis += `따라서 FED의 대차대조표를 주시하고, 금융패권자들이 어떻게 해석하는지를 이해하는 것이 중요합니다.\n\n`;
  
  analysis += `경제 코치는 당신이 금융패권자의 관점에서 거시경제를 이해할 수 있도록 돕습니다. `;
  analysis += `이들의 눈으로 경제를 보면, 단순한 수치가 아니라 세계 경제의 큰 그림이 보입니다. 💪\n`;
  
  return analysis;
}

// fed_report_sh 라우트 (통합된 HTML 서빙)
app.get("/fed_report_sh", async (req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  const fs = await import("fs/promises");
  const path = await import("path");
  try {
    const htmlPath = path.join(process.cwd(), "public", "fed_report_sh", "index.html");
    const html = await fs.readFile(htmlPath, "utf-8");
    res.send(html);
  } catch (error: any) {
    res.status(500).send(`<html><body><h1>Error loading fed_report_sh</h1><p>${error?.message || String(error)}</p></body></html>`);
  }
});

// 경제 지표 세부 페이지
app.get("/economic-indicators/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fear & Greed Index는 전용 페이지로 리다이렉트
    if (id === "fear-greed-index") {
      res.redirect("/economic-indicators/fear-greed-index");
      return;
    }
    
    // FED 자산/부채는 전용 페이지로 리다이렉트
    if (id === "fed-assets-liabilities") {
      res.redirect("/economic-indicators/fed-assets-liabilities");
      return;
    }
    
    const period = (req.query.period as '1D' | '1M' | '1Y' | '5Y' | 'MAX') || '1M';
    const detail = await getIndicatorDetail(id, period);
    
    if (!detail.indicator) {
      res.status(404).send("죄송해요, 해당 지표를 찾을 수 없어요.");
      return;
    }
    
    const ind = detail.indicator;
    const changeColor = ind.changePercent !== null
      ? (ind.changePercent > 0 ? "#ff6b6b" : ind.changePercent < 0 ? "#51cf66" : "#adb5bd")
      : "#adb5bd";
    const changeSign = ind.changePercent !== null && ind.changePercent > 0 ? "+" : "";
    
    // 연관 지표와 종합해석
    const relatedIndicators = detail.relatedIndicators || [];
    const comprehensiveAnalysis = detail.comprehensiveAnalysis || "";
    
    // 알림 생성 함수
    function generateAlerts(indicator: typeof ind, history: typeof detail.history): Array<{ type: 'warning' | 'info' | 'danger'; message: string }> {
      const alerts: Array<{ type: 'warning' | 'info' | 'danger'; message: string }> = [];
      
      if (!indicator || indicator.value === null) return alerts;
      
      const value = indicator.value;
      const historyData = history || [];
      
      // 1. ISM 제조업지수: 45 이하 시 경기침체 알림
      if (indicator.id === 'ism-manufacturing' && value <= 45) {
        alerts.push({
          type: 'danger',
          message: `⚠️ 경기침체 알림: ISM 제조업지수가 ${value.toFixed(2)}로 45 이하로 떨어졌습니다. 제조업 활동이 위축되고 있으며, 경기 침체 신호입니다.`
        });
      }
      
      // 6. 소비자 신뢰지수: 70 이하로 급락 시 알림
      if (indicator.id === 'consumer-confidence' && value <= 70) {
        alerts.push({
          type: 'warning',
          message: `⚠️ 소비 지출 급격 감소 예상: 소비자 신뢰지수가 ${value.toFixed(2)}로 70 이하로 급락했습니다. 향후 6개월 내 소비 지출이 급격히 줄어들 수 있습니다.`
        });
      }
      
      // 7. 소매판매: 3개월 이상 마이너스 연속
      if (indicator.id === 'retail-sales') {
        if (historyData.length >= 3) {
          const recent3Months = historyData.slice(-3).reverse();
          const allNegative = recent3Months.every(h => h.value < 0);
          if (allNegative) {
            alerts.push({
              type: 'danger',
              message: `🚨 소비 위축 본격화: 소매판매 증가율이 3개월 이상 마이너스로 이어지고 있습니다. 소비 위축이 본격화되고 있습니다.`
            });
          }
        }
      }
      
      // 8. 기업 재고율: 급등 시 알림
      if (indicator.id === 'inventory-sales-ratio') {
        if (historyData.length >= 4) {
          const recent4Weeks = historyData.slice(-4).reverse();
          const oldest = recent4Weeks[0].value;
          const newest = recent4Weeks[recent4Weeks.length - 1].value;
          const increasePercent = ((newest - oldest) / oldest) * 100;
          if (increasePercent > 10) {
            alerts.push({
              type: 'warning',
              message: `⚠️ 기업 생산 감소 예상: 기업 재고율이 최근 4주간 ${increasePercent.toFixed(1)}% 급등했습니다. 기업이 생산을 줄이고 해고를 늘릴 수 있습니다.`
            });
          }
        }
      }
      
      // 9. 발틱운임지수: 급락 시 알림
      if (indicator.id === 'baltic-dry-index') {
        if (historyData.length >= 30) {
          const recent30Days = historyData.slice(-30).reverse();
          const oldest = recent30Days[0].value;
          const newest = recent30Days[recent30Days.length - 1].value;
          const decreasePercent = ((oldest - newest) / oldest) * 100;
          if (decreasePercent > 30) {
            alerts.push({
              type: 'danger',
              message: `🚨 세계 교역량 감소: 발틱운임지수가 최근 30일간 ${decreasePercent.toFixed(1)}% 급락했습니다. 세계 교역량이 감소하고 있으며, 제조업, 고용, 소비에 직격탄을 줄 수 있습니다.`
            });
          }
        }
      }
      
      // 10. Cass Freight Index: 급락 시 알림
      if (indicator.id === 'cass-freight-index') {
        if (historyData.length >= 30) {
          const recent30Days = historyData.slice(-30).reverse();
          const oldest = recent30Days[0].value;
          const newest = recent30Days[recent30Days.length - 1].value;
          const decreasePercent = ((oldest - newest) / oldest) * 100;
          if (decreasePercent > 20) {
            alerts.push({
              type: 'danger',
              message: `🚨 운송 및 물류 지표 급락: Cass Freight Index가 최근 30일간 ${decreasePercent.toFixed(1)}% 급락했습니다. 세계 교역량이 감소하고 있으며, 금융위기 직전에 항상 나타나는 신호입니다.`
            });
          }
        }
      }
      
      // 2. 금리스프레드: 역전 시 경기침체 경고
      if (indicator.id === 'yield-spread' && value < 0) {
        alerts.push({
          type: 'danger',
          message: `🚨 경기침체 경고: 금리스프레드가 역전되었습니다 (${value.toFixed(2)}%p). 단기금리(2Y)가 장기금리(10Y)보다 높아 경기 침체 신호입니다.`
        });
      }
      
      // 3. 실업수당청구건수: 4주 이상 연속 증가 또는 30만건 이상
      if (indicator.id === 'initial-jobless-claims') {
        // 4주 이상 연속 증가 체크
        if (historyData.length >= 4) {
          const recent4Weeks = historyData.slice(-4).reverse();
          let consecutiveIncrease = true;
          for (let i = 1; i < recent4Weeks.length; i++) {
            if (recent4Weeks[i].value <= recent4Weeks[i - 1].value) {
              consecutiveIncrease = false;
              break;
            }
          }
          if (consecutiveIncrease) {
            alerts.push({
              type: 'warning',
              message: `⚠️ 소비둔화 경기침체 예상: 실업수당청구건수가 4주 이상 연속 증가하고 있습니다. 소비 둔화와 경기 침체가 예상됩니다.`
            });
          }
        }
        // 30만건 이상 체크
        if (value >= 300000) {
          alerts.push({
            type: 'danger',
            message: `🚨 소비둔화 경기침체 예상: 실업수당청구건수가 ${(value / 1000).toFixed(0)}천 건으로 30만 건 이상입니다. 소비 둔화와 경기 침체가 예상됩니다.`
          });
        }
      }
      
      // 4. 달러인덱스: 105 이상 또는 100 이하
      if (indicator.id === 'dxy') {
        if (value >= 105) {
          alerts.push({
            type: 'info',
            message: `💵 달러강세/위험자산 약세모드: DXY 지수가 ${value.toFixed(2)}로 105 이상입니다. 달러 강세가 지속되며 위험자산에 압박이 가해질 수 있습니다.`
          });
        } else if (value <= 100) {
          alerts.push({
            type: 'info',
            message: `💵 달러약세/위험자산 강세모드: DXY 지수가 ${value.toFixed(2)}로 100 이하입니다. 달러 약세가 지속되며 위험자산에 유리한 환경입니다.`
          });
        }
      }
      
      // 5. WTI 유가: 50달러대 진입, 전쟁 급등, 70달러대 진입
      if (indicator.id === 'wti') {
        if (value >= 50 && value < 60) {
          alerts.push({
            type: 'info',
            message: `🛢️ 투자알림: WTI 유가가 50달러대(${value.toFixed(2)}달러)에 진입했습니다. 저유가 구간으로 투자 기회가 될 수 있습니다.`
          });
        } else if (value >= 70 && value < 80) {
          alerts.push({
            type: 'warning',
            message: `⚠️ 매도알림: WTI 유가가 70달러대(${value.toFixed(2)}달러)에 진입했습니다. 고유가 구간으로 매도 고려 시점입니다.`
          });
        }
        // 전쟁 급등 체크 (최근 30일 중 급등 체크)
        if (historyData.length >= 30) {
          const recent30Days = historyData.slice(-30).reverse();
          const oldest = recent30Days[0].value;
          const newest = recent30Days[recent30Days.length - 1].value;
          const increasePercent = ((newest - oldest) / oldest) * 100;
          if (increasePercent > 30 && newest > 80) {
            const spikeDate = recent30Days.find(h => {
              const idx = recent30Days.indexOf(h);
              if (idx > 0) {
                const dayIncrease = ((h.value - recent30Days[idx - 1].value) / recent30Days[idx - 1].value) * 100;
                return dayIncrease > 10;
              }
              return false;
            });
            if (spikeDate) {
              alerts.push({
                type: 'danger',
                message: `🚨 전쟁 주의 알림: WTI 유가가 ${spikeDate.date} 기준 급등했습니다 (${increasePercent.toFixed(1)}% 상승). 전쟁 등 지地정적 요인으로 인한 급등 가능성이 있습니다.`
              });
            }
          }
        }
      }
      
      return alerts;
    }
    
    const alerts = generateAlerts(ind, detail.history);
    
    // 차트 데이터 준비
    const chartData = detail.history.map(h => ({
      date: h.date,
      value: h.value,
    }));
    const chartLabels = chartData.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    });
    const chartValues = chartData.map(d => d.value);
    const chartFullDates = chartData.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString("ko-KR", { 
        weekday: "long", 
        year: "numeric", 
        month: "long", 
        day: "numeric" 
      });
    });
    
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(ind.name)} - 경제 지표 상세</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:20px;font-weight:700;color:#ffffff}
    .page-header .sub{opacity:.8;font-size:13px;margin-top:8px;line-height:1.5;color:#c0c0c0}
    .page-header a{color:#4dabf7;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#74c0fc}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .indicator-summary{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .indicator-title{font-size:24px;font-weight:700;color:#ffffff;margin-bottom:8px}
    .indicator-symbol{font-size:14px;color:#808080;background:#2d2d2d;padding:4px 12px;border-radius:6px;display:inline-block;margin-bottom:16px}
    .indicator-current{display:flex;align-items:baseline;gap:12px;margin-bottom:16px}
    .current-value{font-size:48px;font-weight:700;color:#ffffff}
    .current-unit{font-size:20px;color:#808080}
    .current-change{font-size:18px;font-weight:600;color:${changeColor}}
    .indicator-meta{display:flex;gap:20px;font-size:13px;color:#808080;padding-top:16px;border-top:1px solid #2d2d2d}
    
    .chart-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .chart-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .chart-title{font-size:18px;font-weight:700;color:#ffffff}
    .chart-period-tabs{display:flex;gap:8px}
    .period-tab{padding:6px 16px;border:1px solid #2d2d2d;border-radius:6px;background:#1a1a1a;color:#c0c0c0;text-decoration:none;font-size:13px;font-weight:600;transition:all 0.2s}
    .period-tab:hover{background:#252525;border-color:#3d3d3d;color:#ffffff}
    .period-tab.active{background:#4dabf7;border-color:#4dabf7;color:#ffffff}
    .chart-container{position:relative;height:400px}
    
    .analysis-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .analysis-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .analysis-text{font-size:15px;line-height:2.2;color:#c0c0c0;white-space:pre-line}
    .analysis-text strong{color:#ffffff;font-weight:700}
    
    .related-indicators-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .related-indicators-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .related-indicators-list{display:flex;flex-wrap:wrap;gap:12px}
    .related-indicator-link{padding:10px 16px;background:#1a1a1a;border:1px solid #2d2d2d;border-radius:8px;color:#4dabf7;text-decoration:none;font-size:14px;font-weight:600;transition:all 0.2s}
    .related-indicator-link:hover{background:#252525;border-color:#4dabf7;color:#74c0fc}
    .related-indicator-category{font-size:11px;color:#808080;margin-left:8px}
    
    .comprehensive-analysis-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .comprehensive-analysis-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .comprehensive-analysis-text{font-size:15px;line-height:2.2;color:#c0c0c0;white-space:pre-line}
    
    .memo-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .memo-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .memo-form{display:flex;flex-direction:column;gap:12px;margin-bottom:20px}
    .memo-input{width:100%;min-height:80px;padding:12px;background:#1a1a1a;border:1px solid #2d2d2d;border-radius:8px;color:#ffffff;font-size:14px;font-family:inherit;resize:vertical;outline:none;transition:border-color 0.2s}
    .memo-input:focus{border-color:#4dabf7}
    .memo-input::placeholder{color:#808080}
    .memo-actions{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .memo-char-count{font-size:12px;color:#808080}
    .memo-submit-btn{padding:10px 20px;background:#4dabf7;border:none;border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s}
    .memo-submit-btn:hover{background:#339af0}
    .memo-submit-btn:disabled{background:#3d3d3d;color:#808080;cursor:not-allowed}
    .memo-history{display:flex;flex-direction:column;gap:12px}
    .memo-history-title{font-size:16px;font-weight:600;color:#ffffff;margin-bottom:8px}
    .memo-history-empty{text-align:center;padding:24px;color:#808080;font-size:14px}
    .memo-item{background:#1a1a1a;border:1px solid #2d2d2d;border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px}
    .memo-item-header{display:flex;justify-content:space-between;align-items:center}
    .memo-item-date{font-size:12px;color:#808080}
    .memo-item-delete{background:none;border:none;color:#ef4444;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.2s}
    .memo-item-delete:hover{background:rgba(239,68,68,0.1)}
    .memo-item-text{font-size:14px;line-height:1.6;color:#c0c0c0;white-space:pre-wrap;word-break:break-word}
    
    .concept-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .concept-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .concept-content{font-size:15px;line-height:2.2;color:#c0c0c0;white-space:pre-line}
    .concept-content h3{font-size:16px;font-weight:700;color:#ffffff;margin-top:20px;margin-bottom:12px}
    .concept-content h3:first-child{margin-top:0}
    .concept-content p{margin-bottom:12px}
    .concept-content strong{color:#ffffff;font-weight:700}
    
    .alert-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .alert-item{padding:16px;border-radius:8px;margin-bottom:12px;border-left:4px solid;font-size:14px;line-height:1.6}
    .alert-item:last-child{margin-bottom:0}
    .alert-item.danger{background:rgba(239,68,68,0.1);border-left-color:#ef4444;color:#fca5a5}
    .alert-item.warning{background:rgba(245,158,11,0.1);border-left-color:#f59e0b;color:#fcd34d}
    .alert-item.info{background:rgba(59,130,246,0.1);border-left-color:#3b82f6;color:#93c5fd}
    .alert-title{font-weight:700;margin-bottom:8px;font-size:15px}
    
    .news-section-detail{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .news-section-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .news-list-detail{display:flex;flex-direction:column;gap:12px;margin-bottom:16px}
    .news-item-detail{padding:12px;background:#1a1a1a;border-radius:8px;border:1px solid #2d2d2d;transition:all 0.2s}
    .news-item-detail:hover{background:#252525;border-color:#3d3d3d}
    .news-content-detail{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .news-text-detail{flex:1;font-size:14px;line-height:1.6;color:#c0c0c0}
    .news-meta-detail{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .news-source-detail{font-size:12px;color:#808080;white-space:nowrap;padding:4px 8px;background:#2d2d2d;border-radius:4px}
    .news-date-detail{font-size:11px;color:#808080;white-space:nowrap}
    .news-comment{margin-top:16px;padding-top:16px;border-top:1px solid #2d2d2d}
    .news-comment-title{font-size:16px;font-weight:700;color:#ffffff;margin-bottom:12px}
    .news-comment-text{font-size:14px;line-height:1.8;color:#c0c0c0}
    
    .history-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;margin-top:24px;overflow:hidden}
    .history-header{display:flex;align-items:center;justify-content:space-between;padding:20px;cursor:pointer;user-select:none;border-bottom:1px solid #2d2d2d}
    .history-header:hover{background:#252525}
    .history-title{font-size:18px;font-weight:700;color:#ffffff}
    .history-content{display:none;padding:24px}
    .history-table{overflow-x:auto}
    table{width:100%;border-collapse:collapse}
    th,td{padding:12px;text-align:left;border-bottom:1px solid #2d2d2d}
    th{font-weight:600;color:#ffffff;font-size:13px}
    td{color:#c0c0c0;font-size:14px}
    tr:hover{background:#252525}
    
    @media (max-width: 768px) {
      .current-value{font-size:36px}
      .chart-container{height:300px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>${escapeHtml(ind.name)}</h1>
    <div class="sub">
      <a href="/economic-indicators">← 경제 지표로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    <div class="indicator-summary">
      <div class="indicator-title">${escapeHtml(ind.name)}</div>
      <div class="indicator-symbol">${escapeHtml(ind.symbol)}</div>
      <div class="indicator-current">
        <span class="current-value">${ind.value !== null ? ind.value.toFixed(2) : "N/A"}</span>
        <span class="current-unit">${escapeHtml(ind.unit)}</span>
        ${ind.changePercent !== null 
          ? `<span class="current-change">${changeSign}${ind.changePercent.toFixed(2)}%</span>`
          : ""}
      </div>
      <div class="indicator-meta">
        <span>출처: ${escapeHtml(ind.source)}</span>
        <span>업데이트: ${new Date(ind.lastUpdated).toLocaleString("ko-KR")}</span>
      </div>
    </div>
    
    ${alerts.length > 0 ? `
    <div class="alert-section">
      <div class="analysis-title">🚨 경제 알림</div>
      ${alerts.map(alert => `
        <div class="alert-item ${alert.type}">
          <div class="alert-title">${alert.type === 'danger' ? '🚨 경고' : alert.type === 'warning' ? '⚠️ 주의' : '💡 정보'}</div>
          <div>${escapeHtml(alert.message)}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <div class="memo-section">
      <div class="memo-title">
        <span>📝</span>
        <span>개인 메모</span>
      </div>
      <div class="memo-form">
        <textarea id="memoInput" class="memo-input" placeholder="이 지표에 대한 개인 메모를 작성하세요 (50자 내외 권장)"></textarea>
        <div class="memo-actions">
          <span class="memo-char-count"><span id="memoCharCount">0</span>자</span>
          <button id="memoSubmitBtn" class="memo-submit-btn">추가</button>
        </div>
      </div>
      <div class="memo-history">
        <div class="memo-history-title">메모 히스토리</div>
        <div id="memoHistoryList"></div>
      </div>
    </div>
    
    <div class="chart-section">
      <div class="chart-header">
        <div class="chart-title">변동 추이</div>
        <div class="chart-period-tabs">
          <a href="/economic-indicators/${id}?period=1D" class="period-tab ${period === '1D' ? 'active' : ''}">일간</a>
          <a href="/economic-indicators/${id}?period=1M" class="period-tab ${period === '1M' ? 'active' : ''}">주간</a>
          <a href="/economic-indicators/${id}?period=1Y" class="period-tab ${period === '1Y' ? 'active' : ''}">연간</a>
          <a href="/economic-indicators/${id}?period=5Y" class="period-tab ${period === '5Y' ? 'active' : ''}">5년</a>
          <a href="/economic-indicators/${id}?period=MAX" class="period-tab ${period === 'MAX' ? 'active' : ''}">전체</a>
        </div>
      </div>
      <div class="chart-container">
        ${chartData.length > 0 ? `<canvas id="indicatorChart"></canvas>` : `<div style="padding: 40px; text-align: center; color: #808080;">선택한 기간의 데이터가 없습니다. 다른 기간을 선택해주세요.</div>`}
      </div>
    </div>
    
    ${chartData.length > 0 ? `
    <script>
      const chartCanvas = document.getElementById('indicatorChart');
      if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        const chartLabels = ${JSON.stringify(chartLabels)};
        const chartValues = ${JSON.stringify(chartValues)};
        const chartFullDates = ${JSON.stringify(chartFullDates)};
        const indicatorName = ${JSON.stringify(ind.name)};
        const indicatorUnit = ${JSON.stringify(ind.unit)};
        
        new Chart(ctx, {
        type: 'line',
        data: {
          labels: chartLabels,
          datasets: [{
            label: indicatorName,
            data: chartValues,
            borderColor: '#4dabf7',
            backgroundColor: 'rgba(77, 171, 247, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index'
          },
          plugins: {
            legend: {
              display: true,
              labels: {
                color: '#c0c0c0'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: '#4dabf7',
              borderWidth: 1,
              padding: 12,
              displayColors: false,
              callbacks: {
                title: function(context) {
                  const index = context[0].dataIndex;
                  return chartFullDates[index] || chartLabels[index];
                },
                label: function(context) {
                  const value = context.parsed.y;
                  const formattedValue = value.toFixed(2);
                  return indicatorName + ': ' + formattedValue + indicatorUnit;
                },
                afterLabel: function(context) {
                  const index = context.dataIndex;
                  if (index > 0 && chartValues[index] !== undefined && chartValues[index - 1] !== undefined) {
                    const current = chartValues[index];
                    const previous = chartValues[index - 1];
                    const change = current - previous;
                    const changePercent = previous !== 0 ? ((change / previous) * 100) : 0;
                    const changeSign = change >= 0 ? '+' : '';
                    return '변동: ' + changeSign + change.toFixed(2) + indicatorUnit + ' (' + changeSign + changePercent.toFixed(2) + '%)';
                  }
                  return '';
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#808080' },
              grid: { color: '#2d2d2d' }
            },
            y: {
              ticks: { 
                color: '#808080',
                callback: function(value) {
                  return value.toFixed(2) + indicatorUnit;
                }
              },
              grid: { color: '#2d2d2d' }
            }
          }
        }
        });
      }
    </script>
    ` : ""}
    
    <script>
      // 메모 기능
      (function() {
        const indicatorId = ${JSON.stringify(id)};
        const memoStorageKey = 'economic-indicator-memos';
        const memoInput = document.getElementById('memoInput');
        const memoSubmitBtn = document.getElementById('memoSubmitBtn');
        const memoCharCount = document.getElementById('memoCharCount');
        const memoHistoryList = document.getElementById('memoHistoryList');
        
        // 로컬 스토리지에서 메모 불러오기
        function loadMemos() {
          try {
            const allMemos = JSON.parse(localStorage.getItem(memoStorageKey) || '{}');
            return allMemos[indicatorId] || [];
          } catch (e) {
            console.error('Failed to load memos:', e);
            return [];
          }
        }
        
        // 로컬 스토리지에 메모 저장하기
        function saveMemos(memos) {
          try {
            const allMemos = JSON.parse(localStorage.getItem(memoStorageKey) || '{}');
            allMemos[indicatorId] = memos;
            localStorage.setItem(memoStorageKey, JSON.stringify(allMemos));
          } catch (e) {
            console.error('Failed to save memos:', e);
          }
        }
        
        // 메모 히스토리 렌더링
        function renderMemoHistory() {
          const memos = loadMemos();
          
          if (memos.length === 0) {
            memoHistoryList.innerHTML = '<div class="memo-history-empty">저장된 메모가 없습니다.</div>';
            return;
          }
          
          // 최신순으로 정렬
          const sortedMemos = memos.sort((a, b) => new Date(b.date) - new Date(a.date));
          
          memoHistoryList.innerHTML = sortedMemos.map((memo, index) => {
            const date = new Date(memo.date);
            const dateStr = date.toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
            
            const escapedText = escapeHtml(memo.text);
            
            return '<div class="memo-item">' +
              '<div class="memo-item-header">' +
              '<span class="memo-item-date">' + dateStr + '</span>' +
              '<button class="memo-item-delete" onclick="deleteMemo(' + index + ')">삭제</button>' +
              '</div>' +
              '<div class="memo-item-text">' + escapedText + '</div>' +
              '</div>';
          }).join('');
        }
        
        // 메모 추가
        function addMemo() {
          const text = memoInput.value.trim();
          if (!text) {
            alert('메모 내용을 입력해주세요.');
            return;
          }
          
          const memos = loadMemos();
          const newMemo = {
            text: text,
            date: new Date().toISOString()
          };
          
          memos.push(newMemo);
          saveMemos(memos);
          
          memoInput.value = '';
          updateCharCount();
          renderMemoHistory();
        }
        
        // 메모 삭제
        window.deleteMemo = function(index) {
          if (!confirm('이 메모를 삭제하시겠습니까?')) {
            return;
          }
          
          const memos = loadMemos();
          const sortedMemos = memos.sort((a, b) => new Date(b.date) - new Date(a.date));
          sortedMemos.splice(index, 1);
          
          saveMemos(sortedMemos);
          renderMemoHistory();
        };
        
        // 글자수 업데이트
        function updateCharCount() {
          const length = memoInput.value.length;
          memoCharCount.textContent = length;
        }
        
        // HTML 이스케이프 함수
        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }
        
        // 이벤트 리스너
        memoInput.addEventListener('input', updateCharCount);
        memoSubmitBtn.addEventListener('click', addMemo);
        memoInput.addEventListener('keydown', function(e) {
          if (e.ctrlKey && e.key === 'Enter') {
            addMemo();
          }
        });
        
        // 초기화
        updateCharCount();
        renderMemoHistory();
      })();
    </script>
    
    ${relatedIndicators.length > 0 ? `
    <div class="related-indicators-section">
      <div class="related-indicators-title">연관 지표 바로가기 🔗</div>
      <div class="related-indicators-list">
        ${relatedIndicators.map((ri: any) => `
          <a href="/economic-indicators/${ri.id}" class="related-indicator-link">
            ${escapeHtml(ri.name)}
            <span class="related-indicator-category">(${escapeHtml(ri.category)})</span>
          </a>
        `).join("")}
      </div>
    </div>
    ` : ""}
    
    ${detail.relatedNews && detail.relatedNews.length > 0 ? `
    <div class="news-section-detail">
      <div class="news-section-title">최근 뉴스 항목</div>
      <div class="news-list-detail">
        ${detail.relatedNews.map((news: any, idx: number) => `
          <div class="news-item-detail">
            <div class="news-content-detail">
              <div class="news-text-detail">${escapeHtml(news.title)}</div>
              <div class="news-meta-detail">
                <div class="news-source-detail">${escapeHtml(news.source)}</div>
                ${news.publishedAt ? `<div class="news-date-detail">${escapeHtml(news.publishedAt)}</div>` : ""}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
      ${detail.newsComment && detail.newsComment !== "none" ? `
      <div class="news-comment">
        <div class="news-comment-title">경제코치 코멘트 💬</div>
        <div class="news-comment-text">${escapeHtml(detail.newsComment)}</div>
      </div>
      ` : ""}
    </div>
    ` : ""}
    
    ${detail.history.length > 0 ? `
    <div class="history-section">
      <div class="history-header" onclick="toggleHistory()">
        <div class="history-title">일별 수치 (최근 ${Math.min(30, detail.history.length)}일)</div>
        <div class="expand-icon" id="history-icon">▼</div>
      </div>
      <div class="history-content" id="history-content" style="display: none;">
        <div class="history-table">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>값</th>
                <th>변동</th>
              </tr>
            </thead>
            <tbody>
              ${detail.history.slice(-30).reverse().map((h, idx, arr) => {
                const prev = arr[idx + 1];
                const change = prev ? h.value - prev.value : null;
                const changePercent = prev && prev.value !== 0 ? ((change! / prev.value) * 100) : null;
                return `
                <tr>
                  <td>${new Date(h.date).toLocaleDateString("ko-KR")}</td>
                  <td>${h.value.toFixed(2)} ${escapeHtml(ind.unit)}</td>
                  <td style="color:${change !== null && change > 0 ? "#ff6b6b" : change !== null && change < 0 ? "#51cf66" : "#adb5bd"}">
                    ${change !== null ? `${change > 0 ? "+" : ""}${change.toFixed(2)}` : "-"}
                    ${changePercent !== null ? `(${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%)` : ""}
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <script>
      function toggleHistory() {
        const content = document.getElementById('history-content');
        const icon = document.getElementById('history-icon');
        if (content.style.display === 'none') {
          content.style.display = 'block';
          icon.textContent = '▲';
        } else {
          content.style.display = 'none';
          icon.textContent = '▼';
        }
      }
    </script>
    ` : ""}
  </div>
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(e?.message ?? String(e));
  }
});

// 경제 지표 API
app.get("/api/economic-indicators", async (_req, res) => {
  try {
    const indicators = await fetchAllEconomicIndicators();
    const status = diagnoseEconomicStatus(indicators);
    
    // 경제 지표는 5분 캐시
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json({
      status,
      indicators,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// 지표 세부 데이터 API
app.get("/api/economic-indicators/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await getIndicatorDetail(id);
    res.json(detail);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m] as string));
}

// 비밀지표 페이지
app.get("/secret-indicators", async (req, res) => {
  try {
    // 캐싱 헤더 설정 (10분 캐시, 1시간 stale-while-revalidate)
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    
    const indicators = await fetchAllSecretIndicators();
    
    const escapeHtml = (s: string): string => {
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
    
    const getRiskColor = (risk: string) => {
      switch (risk) {
        case "critical": return "#dc2626";
        case "high": return "#f59e0b";
        case "medium": return "#eab308";
        case "low": return "#10b981";
        default: return "#6b7280";
      }
    };
    
    const getTrendIcon = (trend: string) => {
      switch (trend) {
        case "up": return "📈";
        case "down": return "📉";
        default: return "➡️";
      }
    };
    
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="위기가 준비되는 과정을 가장 먼저 알아차리는 12개 선행 지표. 자본주의 내부 신경계를 해부하는 비밀지표 대시보드" />
  <meta name="keywords" content="SOFR, IORB, 스프레드, 금융지표, 선행지표, 거시경제, 유동성, FED" />
  <meta name="author" content="FED H.4.1 Dashboard" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="비밀지표 - 자본주의 내부 신경계 해부" />
  <meta property="og:description" content="위기가 준비되는 과정을 가장 먼저 알아차리는 12개 선행 지표" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://fedreportsh.vercel.app/secret-indicators" />
  <meta property="og:site_name" content="FED H.4.1 Dashboard" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="비밀지표 - 자본주의 내부 신경계 해부" />
  <meta name="twitter:description" content="위기가 준비되는 과정을 가장 먼저 알아차리는 12개 선행 지표" />
  <link rel="canonical" href="https://fedreportsh.vercel.app/secret-indicators" />
  <link rel="preconnect" href="https://api.stlouisfed.org" />
  <link rel="dns-prefetch" href="https://api.stlouisfed.org" />
  <title>비밀지표 - 자본주의 내부 신경계 해부</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:24px;font-weight:700;color:#ffffff;margin-bottom:8px}
    .page-header .sub{opacity:.8;font-size:14px;line-height:1.6;color:#c0c0c0}
    .page-header a{color:#a78bfa;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#c4b5fd}
    
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .indicator-card{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px;transition:all 0.2s}
    .indicator-card:hover{border-color:#3d3d3d;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,0.3)}
    .indicator-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #2d2d2d}
    .indicator-title{font-size:20px;font-weight:700;color:#ffffff;margin-bottom:8px}
    .indicator-description{font-size:14px;color:#9ca3af;line-height:1.6;margin-bottom:12px}
    .indicator-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#808080}
    .indicator-source{background:#2d2d2d;padding:4px 8px;border-radius:4px}
    
    .indicator-value-section{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
    .value-item{background:#252525;border-radius:8px;padding:16px}
    .value-label{font-size:12px;color:#9ca3af;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .value-number{font-size:24px;font-weight:700;color:#ffffff;margin-bottom:4px}
    .value-change{font-size:14px;font-weight:600}
    .value-change.positive{color:#10b981}
    .value-change.negative{color:#ef4444}
    .value-change.neutral{color:#9ca3af}
    
    .indicator-interpretation{background:#252525;border-radius:8px;padding:20px;margin-top:20px;border-left:4px solid #8b5cf6}
    .interpretation-title{font-size:16px;font-weight:700;color:#ffffff;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .interpretation-text{font-size:14px;line-height:1.8;color:#c0c0c0;white-space:pre-line}
    
    .risk-badge{display:inline-block;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:700;color:#ffffff}
    .risk-critical{background:#dc2626}
    .risk-high{background:#f59e0b}
    .risk-medium{background:#eab308}
    .risk-low{background:#10b981}
    
    .trend-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;background:#2d2d2d;color:#c0c0c0}
    
    /* 로딩 최적화: 폰트 및 리소스 */
    @font-face{font-display:swap}
    
    /* 성능 최적화: will-change 사용 */
    .indicator-card{will-change:transform}
    .indicator-card:hover{will-change:auto}
    
    @media (max-width: 768px) {
      .indicator-value-section{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>🔮 비밀지표 - 자본주의 내부 신경계 해부</h1>
    <div class="sub">
      <a href="/">← 대시보드로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    ${indicators.map((ind, idx) => {
      const changeColor = ind.change && ind.change > 0 ? "positive" : ind.change && ind.change < 0 ? "negative" : "neutral";
      const changeSign = ind.change && ind.change > 0 ? "+" : "";
      const changePercentSign = ind.changePercent && ind.changePercent > 0 ? "+" : "";
      const hasDetailPage = ind.id === "sofr_iorb_spread" || ind.id === "bank_reserves_velocity";
      const detailPageUrl = ind.id === "sofr_iorb_spread" ? "/secret-indicators/sofr-iorb-spread" : 
                           ind.id === "bank_reserves_velocity" ? "/secret-indicators/bank-reserves-velocity" : "";
      
      return `
    <div class="indicator-card" ${hasDetailPage ? `style="cursor:pointer" onclick="window.location.href='${detailPageUrl}'"` : ''}>
      <div class="indicator-header">
        <div style="flex:1">
          <div class="indicator-title">
            ${idx + 1}. ${escapeHtml(ind.name)}
            ${hasDetailPage ? '<span style="font-size:14px;color:#a78bfa;margin-left:8px">📊 클릭하여 상세 분석 보기</span>' : ''}
          </div>
          <div class="indicator-description">${escapeHtml(ind.description)}</div>
          <div class="indicator-meta">
            ${ind.fredSeriesId ? `<span class="indicator-source">FRED: ${ind.fredSeriesId}</span>` : ""}
            ${ind.alternativeSource ? `<span class="indicator-source">보조지표: ${escapeHtml(ind.alternativeSource)}</span>` : ""}
            ${ind.lastUpdated ? `<span class="indicator-source">업데이트: ${ind.lastUpdated}</span>` : ""}
            <span class="trend-badge">${getTrendIcon(ind.trend)} ${ind.trend === "up" ? "상승" : ind.trend === "down" ? "하락" : "중립"}</span>
            <span class="risk-badge risk-${ind.riskLevel}">위험: ${ind.riskLevel === "critical" ? "치명적" : ind.riskLevel === "high" ? "높음" : ind.riskLevel === "medium" ? "보통" : "낮음"}</span>
          </div>
        </div>
      </div>
      
      <div class="indicator-value-section">
        <div class="value-item">
          <div class="value-label">현재 값</div>
          <div class="value-number">${ind.value !== null ? ind.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "N/A"}</div>
          <div class="value-label">${ind.unit}</div>
        </div>
        ${ind.previousValue !== null ? `
        <div class="value-item">
          <div class="value-label">이전 값</div>
          <div class="value-number" style="font-size:20px;color:#9ca3af">${ind.previousValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
          <div class="value-label">${ind.unit}</div>
        </div>
        ` : ""}
        ${ind.change !== null ? `
        <div class="value-item">
          <div class="value-label">변동</div>
          <div class="value-number ${changeColor}">${changeSign}${ind.change.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
          <div class="value-change ${changeColor}">${changePercentSign}${ind.changePercent?.toFixed(2) || "0.00"}%</div>
        </div>
        ` : ""}
      </div>
      
      ${ind.interpretation ? `
      <div class="indicator-interpretation">
        <div class="interpretation-title">
          <span>💼 경제 코치 해석</span>
        </div>
        <div class="interpretation-text">${escapeHtml(ind.interpretation)}</div>
      </div>
      ` : `
      <div class="indicator-interpretation">
        <div class="interpretation-title">
          <span>⚠️ 데이터 수집 중</span>
        </div>
        <div class="interpretation-text">이 지표의 데이터를 가져오는 중입니다. 잠시 후 다시 확인해주세요.</div>
      </div>
      `}
    </div>
      `;
    }).join('')}
  </div>
</body>
</html>
    `);
  } catch (e: any) {
    res.status(500).send(`오류 발생: ${e?.message ?? String(e)}`);
  }
});

// SOFR-IORB 스프레드 세부 페이지
app.get("/secret-indicators/sofr-iorb-spread", async (req, res) => {
  try {
    const [spreadData, chartData] = await Promise.all([
      fetchSOFRIORBSpread(),
      fetchSOFRIORBSpreadChartData(365)
    ]);
    
    const interpretation = generateSOFRIORBSpreadDetailedInterpretation(spreadData, chartData);
    
    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
    
    // 차트 데이터를 JSON으로 변환 (Chart.js 사용)
    const chartDataJson = chartData ? JSON.stringify({
      labels: chartData.dates,
      datasets: [
        {
          label: "SOFR (%)",
          data: chartData.sofr,
          borderColor: "#4dabf7",
          backgroundColor: "rgba(77, 171, 247, 0.1)",
          yAxisID: "y",
          tension: 0.1
        },
        {
          label: "IORB (%)",
          data: chartData.iorb,
          borderColor: "#51cf66",
          backgroundColor: "rgba(81, 207, 102, 0.1)",
          yAxisID: "y",
          borderDash: [5, 5],
          tension: 0.1
        },
        {
          label: "스프레드 (bp)",
          data: chartData.spread,
          borderColor: "#ffd43b",
          backgroundColor: "rgba(255, 212, 59, 0.1)",
          yAxisID: "y1",
          tension: 0.1
        }
      ]
    }) : "null";
    
    const stateColor = interpretation.currentState === "normal" ? "#10b981" : 
                       interpretation.currentState === "warning" ? "#f59e0b" : "#ef4444";
    const stateText = interpretation.currentState === "normal" ? "정상" : 
                      interpretation.currentState === "warning" ? "경계" : "방어";
    
    res.send(`
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SOFR-IORB 스프레드 상세 분석</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:auto;overflow-x:hidden;overflow-y:auto}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:#121212;color:#e8e8e8;line-height:1.6}
    
    .page-header{padding:20px 24px;border-bottom:1px solid #2d2d2d;position:sticky;top:0;background:#1a1a1a;z-index:100}
    .page-header h1{margin:0;font-size:24px;font-weight:700;color:#ffffff;margin-bottom:8px}
    .page-header .sub{opacity:.8;font-size:14px;line-height:1.6;color:#c0c0c0}
    .page-header a{color:#a78bfa;text-decoration:none;font-weight:500}
    .page-header a:hover{text-decoration:underline;color:#c4b5fd}
    
    .main-content{padding:24px;max-width:1400px;margin:0 auto}
    
    .status-badge{display:inline-block;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:700;color:#ffffff;margin-bottom:20px}
    
    .value-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .value-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:16px}
    .value-item{background:#252525;border-radius:8px;padding:16px}
    .value-label{font-size:12px;color:#9ca3af;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .value-number{font-size:24px;font-weight:700;color:#ffffff;margin-bottom:4px}
    .value-unit{font-size:12px;color:#808080}
    
    .chart-container{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .chart-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .chart-wrapper{position:relative;width:100%;height:400px}
    #spreadChart{width:100%!important;height:100%!important}
    
    .analysis-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .section-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .section-content{font-size:14px;line-height:1.8;color:#c0c0c0;white-space:pre-line}
    .section-content strong{color:#ffffff;font-weight:700}
    
    .interpretation-box{background:#252525;border-left:4px solid #8b5cf6;border-radius:8px;padding:20px;margin-top:16px}
    .memo-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .memo-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .memo-form{display:flex;flex-direction:column;gap:12px;margin-bottom:20px}
    .memo-input{width:100%;min-height:80px;padding:12px;background:#1a1a1a;border:1px solid #2d2d2d;border-radius:8px;color:#ffffff;font-size:14px;font-family:inherit;resize:vertical;outline:none;transition:border-color 0.2s}
    .memo-input:focus{border-color:#4dabf7}
    .memo-input::placeholder{color:#808080}
    .memo-actions{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .memo-char-count{font-size:12px;color:#808080}
    .memo-submit-btn{padding:10px 20px;background:#4dabf7;border:none;border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s}
    .memo-submit-btn:hover{background:#339af0}
    .memo-submit-btn:disabled{background:#3d3d3d;color:#808080;cursor:not-allowed}
    .memo-history{display:flex;flex-direction:column;gap:12px}
    .memo-history-title{font-size:16px;font-weight:600;color:#ffffff;margin-bottom:8px}
    .memo-history-empty{text-align:center;padding:24px;color:#808080;font-size:14px}
    .memo-item{background:#1a1a1a;border:1px solid #2d2d2d;border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px}
    .memo-item-header{display:flex;justify-content:space-between;align-items:center}
    .memo-item-date{font-size:12px;color:#808080}
    .memo-item-delete{background:none;border:none;color:#ef4444;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.2s}
    .memo-item-delete:hover{background:rgba(239,68,68,0.1)}
    .memo-item-text{font-size:14px;line-height:1.6;color:#c0c0c0;white-space:pre-wrap;word-break:break-word}
    
    /* 모바일 전용 차트 최적화 (≤640px) */
    @media (max-width: 640px) {
      .chart-container{padding:16px;margin-bottom:16px}
      .chart-title{font-size:16px;margin-bottom:12px}
      .chart-wrapper{
        height:clamp(320px, 60vh, 520px);
        min-height:320px;
      }
    }
    
    @media (max-width: 768px) {
      .value-grid{grid-template-columns:1fr}
      .main-content{padding:16px}
      .value-section{padding:16px}
      .analysis-section{padding:16px;margin-bottom:16px}
      .page-header{padding:16px}
      .page-header h1{font-size:20px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>📊 SOFR-IORB 스프레드 상세 분석</h1>
    <div class="sub">
      <a href="/secret-indicators">← 비밀지표로 돌아가기</a>
    </div>
  </div>
  
  <div class="main-content">
    ${spreadData.spread && spreadData.sofr && spreadData.iorb ? `
    <div class="status-badge" style="background:${stateColor}">
      현재 상태: ${stateText}
    </div>
    
    <div class="value-section">
      <h2 style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px">현재 수치</h2>
      <div class="value-grid">
        <div class="value-item">
          <div class="value-label">SOFR</div>
          <div class="value-number">${spreadData.sofr.value.toFixed(2)}</div>
          <div class="value-unit">%</div>
        </div>
        <div class="value-item">
          <div class="value-label">IORB</div>
          <div class="value-number">${spreadData.iorb.value.toFixed(2)}</div>
          <div class="value-unit">%</div>
        </div>
        <div class="value-item">
          <div class="value-label">스프레드</div>
          <div class="value-number" style="color:#ffd43b">${spreadData.spread.value.toFixed(2)}</div>
          <div class="value-unit">bp</div>
        </div>
        <div class="value-item">
          <div class="value-label">변동</div>
          <div class="value-number" style="color:${spreadData.spread.value - spreadData.spread.previousValue > 0 ? '#ef4444' : '#10b981'}">
            ${spreadData.spread.value - spreadData.spread.previousValue > 0 ? '+' : ''}${(spreadData.spread.value - spreadData.spread.previousValue).toFixed(2)}
          </div>
          <div class="value-unit">bp</div>
        </div>
      </div>
      <div style="margin-top:16px;font-size:12px;color:#808080">
        업데이트: ${spreadData.spread.date}
      </div>
    </div>
    
    ${chartData ? `
    <div class="chart-container">
      <div class="chart-title">SOFR-IORB 스프레드 차트 (최근 1년)</div>
      <div class="chart-wrapper">
        <canvas id="spreadChart"></canvas>
      </div>
    </div>
    ` : ''}
    
    <div class="analysis-section">
      <div class="section-title">
        <span>1️⃣ 1차 판독</span>
      </div>
      <div class="section-content">${escapeHtml(interpretation.primaryAnalysis)}</div>
    </div>
    
    <div class="analysis-section">
      <div class="section-title">
        <span>2️⃣ 2차 판독: 지속성과 방향</span>
      </div>
      <div class="section-content">${escapeHtml(interpretation.secondaryAnalysis)}</div>
    </div>
    
    <div class="analysis-section">
      <div class="section-title">
        <span>📊 교차 판독 방법</span>
      </div>
      <div class="section-content">${escapeHtml(interpretation.crossReading)}</div>
    </div>
    
    <div class="analysis-section">
      <div class="section-title">
        <span>💼 포지션 판단</span>
      </div>
      <div class="interpretation-box">
        <div class="section-content">${escapeHtml(interpretation.positionGuidance)}</div>
      </div>
    </div>
    
    <div class="analysis-section">
      <div class="section-title">
        <span>📚 상세 설명</span>
      </div>
      <div class="section-content">${escapeHtml(interpretation.detailedExplanation)}</div>
    </div>
    
    <div class="memo-section">
      <div class="memo-title">
        <span>📝</span>
        <span>개인 메모</span>
      </div>
      <div class="memo-form">
        <textarea id="memoInput" class="memo-input" placeholder="이 지표에 대한 개인 메모를 작성하세요 (50자 내외 권장)"></textarea>
        <div class="memo-actions">
          <span class="memo-char-count"><span id="memoCharCount">0</span>자</span>
          <button id="memoSubmitBtn" class="memo-submit-btn">추가</button>
        </div>
      </div>
      <div class="memo-history">
        <div class="memo-history-title">메모 히스토리</div>
        <div id="memoHistoryList"></div>
      </div>
    </div>
    ` : `
    <div class="value-section">
      <div style="text-align:center;padding:40px;color:#9ca3af">
        <div style="font-size:24px;margin-bottom:16px">⚠️</div>
        <div>데이터를 가져오는 중입니다. 잠시 후 다시 확인해주세요.</div>
      </div>
    </div>
    `}
  </div>
  
  ${chartData ? `
  <script>
    const chartData = ${chartDataJson};
    if (chartData) {
      // 모바일 감지 (≤640px)
      const mobileMediaQuery = window.matchMedia('(max-width: 640px)');
      let isMobile = mobileMediaQuery.matches;
      
      // 차트 인스턴스 변수
      let chartInstance = null;
      
      // 리사이즈 이벤트 핸들러 (디바운싱)
      let resizeTimer;
      const handleResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const wasMobile = isMobile;
          isMobile = window.matchMedia('(max-width: 640px)').matches;
          if (wasMobile !== isMobile && chartInstance) {
            chartInstance.destroy();
            chartInstance = initChart();
          } else if (chartInstance) {
            chartInstance.resize();
          }
        }, 250);
      };
      
      // 차트 초기화 함수
      const initChart = () => {
        const canvas = document.getElementById('spreadChart');
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        
        // PC 기본 옵션 (기존 설정 유지)
        const baseOptions = {
          responsive: true,
          maintainAspectRatio: true,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: '#e8e8e8',
                font: {
                  size: 12
                }
              }
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleColor: '#ffffff',
              bodyColor: '#e8e8e8',
              borderColor: '#2d2d2d',
              borderWidth: 1,
              titleFont: {
                size: 12
              },
              bodyFont: {
                size: 11
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#9ca3af',
                maxRotation: 45,
                minRotation: 45,
                font: {
                  size: 11
                }
              },
              grid: {
                color: '#2d2d2d'
              }
            },
            y: {
              type: 'linear',
              display: true,
              position: 'left',
              title: {
                display: true,
                text: '금리 (%)',
                color: '#9ca3af',
                font: {
                  size: 12
                }
              },
              ticks: {
                color: '#9ca3af',
                font: {
                  size: 11
                }
              },
              grid: {
                color: '#2d2d2d'
              }
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'right',
              title: {
                display: true,
                text: '스프레드 (bp)',
                color: '#9ca3af',
                font: {
                  size: 12
                }
              },
              ticks: {
                color: '#9ca3af',
                font: {
                  size: 11
                }
              },
              grid: {
                drawOnChartArea: false
              }
            }
          },
          layout: {
            padding: {
              top: 10,
              right: 10,
              bottom: 10,
              left: 10
            }
          }
        };
        
        // 모바일 전용 옵션 (PC에는 영향 없음)
        if (isMobile) {
          baseOptions.maintainAspectRatio = false;
          baseOptions.plugins.legend.position = 'bottom';
          baseOptions.plugins.legend.labels.font.size = 13;
          baseOptions.plugins.legend.labels.boxWidth = 14;
          baseOptions.plugins.legend.labels.padding = 12;
          baseOptions.plugins.tooltip.titleFont.size = 14;
          baseOptions.plugins.tooltip.bodyFont.size = 13;
          baseOptions.plugins.tooltip.padding = 12;
          baseOptions.plugins.tooltip.titleSpacing = 8;
          baseOptions.plugins.tooltip.bodySpacing = 6;
          baseOptions.scales.x.ticks.maxRotation = 0;
          baseOptions.scales.x.ticks.minRotation = 0;
          baseOptions.scales.x.ticks.font.size = 11;
          baseOptions.scales.x.ticks.autoSkip = true;
          baseOptions.scales.x.ticks.maxTicksLimit = 6;
          baseOptions.scales.x.ticks.padding = 8;
          baseOptions.scales.y.title.font.size = 13;
          baseOptions.scales.y.ticks.font.size = 12;
          baseOptions.scales.y.ticks.padding = 8;
          baseOptions.scales.y1.title.font.size = 13;
          baseOptions.scales.y1.ticks.font.size = 12;
          baseOptions.scales.y1.ticks.padding = 8;
          baseOptions.layout.padding = {
            top: 16,
            right: 16,
            bottom: 16,
            left: 16
          };
          baseOptions.elements = {
            point: {
              radius: 3,
              hoverRadius: 5
            },
            line: {
              borderWidth: 2
            }
          };
        }
        
        return new Chart(ctx, {
          type: 'line',
          data: chartData,
          options: baseOptions
        });
      };
      
      // 차트 초기화
      chartInstance = initChart();
      
      // 리사이즈 이벤트 리스너 등록
      window.addEventListener('resize', handleResize);
      
      // 미디어 쿼리 변경 리스너
      mobileMediaQuery.addEventListener('change', handleResize);
    }
  </script>
  ` : ''}
</body>
</html>
    `);
  } catch (e: any) {
    res.status(500).send(`오류 발생: ${e?.message ?? String(e)}`);
  }
});

// 은행 준비금의 속도 상세 페이지
app.get("/secret-indicators/bank-reserves-velocity", async (req, res) => {
  try {
    const [currentData, chartData] = await Promise.all([
      fetchFRED("WRESBAL", 2),
      fetchWRESBALChartData(365)
    ]);
    
    const escapeHtml = (text: string) => {
      const map: { [key: string]: string } = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, (m) => map[m]);
    };
    
    // 차트 데이터 JSON 변환
    const chartDataJson = chartData ? JSON.stringify({
      labels: chartData.dates,
      datasets: [
        {
          label: "은행 준비금 (억 달러)",
          data: chartData.values,
          borderColor: "#8b5cf6",
          backgroundColor: "rgba(139, 92, 246, 0.1)",
          tension: 0.1,
          fill: true
        }
      ]
    }) : "null";
    
    // 현재 값과 이전 값
    const currentValue = currentData ? currentData.value / 1000 : null; // 십억 달러로 변환
    const previousValue = currentData ? currentData.previousValue / 1000 : null;
    const change = currentValue && previousValue ? currentValue - previousValue : null;
    const changePercent = change && previousValue ? (change / previousValue) * 100 : null;
    
    // 판독 분석
    let readingAnalysis = "";
    if (chartData && chartData.values.length > 0) {
      const recentValues = chartData.values.slice(-30); // 최근 30개 데이터
      const olderValues = chartData.values.slice(-60, -30); // 그 이전 30개
      
      if (recentValues.length > 0 && olderValues.length > 0) {
        const recentSlope = (recentValues[recentValues.length - 1] - recentValues[0]) / recentValues.length;
        const olderSlope = (olderValues[olderValues.length - 1] - olderValues[0]) / olderValues.length;
        
        if (Math.abs(recentSlope) < Math.abs(olderSlope) * 0.3) {
          // 증가 속도가 크게 둔화됨
          readingAnalysis = "⚠️ 증가 속도 둔화 (1차 경고): 최근 30일간 증가 속도가 이전 기간 대비 크게 둔화되었습니다. 은행 신뢰의 척도가 변화하고 멈추는 신호일 수 있습니다.";
        } else if (Math.abs(recentSlope) < 10) {
          // 거의 수평
          readingAnalysis = "⚠️ 거의 수평: 준비금이 거의 변동하지 않고 있습니다. 이는 뉴스가 아무 말도 하지 않는 시기로, 은행 간 신뢰가 정체 상태임을 의미합니다.";
        } else if (recentSlope < 0) {
          // 하락 전환
          const declineSpeed = Math.abs(recentSlope);
          if (declineSpeed > Math.abs(olderSlope) * 1.5) {
            readingAnalysis = "🚨 하락 속도 가속 (경고): 은행 간 신뢰가 후퇴하고 있으며, 하락 속도가 빨라지고 있습니다. 언제 터질까의 문제입니다.";
          } else {
            readingAnalysis = "⚠️ 하락 전환: 은행 간 신뢰가 후퇴하기 시작했습니다. 지속적인 관찰이 필요합니다.";
          }
        } else {
          readingAnalysis = "✅ 정상 증가: 은행 준비금이 안정적으로 증가하고 있습니다. 은행 간 신뢰가 유지되고 있습니다.";
        }
      }
    }
    
    // 종합 코멘트 (판독 항목 기반 상세 해설)
    let overallComment = "";
    if (readingAnalysis) {
      if (readingAnalysis.includes("증가 속도 둔화")) {
        // 1. 증가 속도 둔화 (1차 경고) - '📊 판독' 항목 1번
        overallComment = `**📊 판독 항목 1번: 증가 속도 둔화 (기울기 완만) - 1차 경고**

현재 은행 준비금은 절대적인 수치로는 증가하고 있지만, 증가 속도(기울기)가 이전 기간 대비 크게 둔화되었습니다. 이는 '📊 판독' 항목에서 설명한 첫 번째 신호인 "증가 속도 둔화 (기울기 완만)"에 해당하는 1차 경고 상태입니다.

**판독 해석:**
은행 준비금이 증가는 하지만 증가 속도가 둔화되고 있다면, 이는 은행 간 신뢰가 약화되기 시작하는 신호입니다. '🎯 목적'에서 설명한 대로, 이 지표는 돈의 양이 아니라 은행들이 서로를 얼마나 신뢰하는지, 그리고 그 신뢰가 어떻게 변화하는지를 관찰하는 척도입니다. 현재 상태는 그 신뢰의 척도가 변화하고 멈추기 시작하는 중요한 전환점을 나타냅니다.

**경제 코치 종합 분석:**
은행들이 서로를 신뢰하면서도 그 신뢰의 속도가 느려지고 있다는 것은, 은행 간 신뢰의 품질이 변화하고 있음을 의미합니다. 거대 자본가들은 이런 시점에 매우 신중하게 관찰하며, 다음을 확인합니다: 1) 증가 속도가 계속 둔화되는지, 2) 다음 단계로 이어질지(거의 수평 또는 하락 전환), 3) 정상으로 복귀할 가능성이 있는지. 

이런 시점에는 SOFR-IORB 스프레드와 같은 교차 판독 방법을 병행하여 확인하는 것이 중요합니다. 준비금 속도 둔화와 SOFR-IORB 괴리가 동시에 나타나면, 은행 간 신뢰의 태도에서 행동으로의 전환이 일어나고 있음을 의미할 수 있습니다.`;
      } else if (readingAnalysis.includes("거의 수평")) {
        // 2. 거의 수평 (뉴스가 아무 말도 안하는 시기) - '📊 판독' 항목 2번
        overallComment = `**📊 판독 항목 2번: 거의 수평 - 뉴스가 아무 말도 안하는 시기**

은행 준비금이 거의 변동하지 않고 수평선에 가까운 상태를 보이고 있습니다. 이는 '📊 판독' 항목에서 설명한 두 번째 신호인 "거의 수평"에 해당하며, 뉴스가 아무 말도 하지 않는 시기입니다.

**판독 해석:**
준비금이 거의 변동하지 않고 수평선에 가까워지면, 은행들이 서로를 신뢰하지 않으면서도 위기라고 판단하지 않는 상태입니다. 이는 뉴스가 아무 말도 하지 않는 시기로, 조용한 변화가 일어나고 있음을 의미합니다. '🎯 목적'에서 설명한 "은행 신뢰의 척도가 변화하고 멈추는 순간"이 바로 이 시점입니다.

**경제 코치 종합 분석:**
조용한 변화가 일어나는 시기입니다. 은행 신뢰의 척도가 멈춘 상태로, 이는 단순한 정체가 아니라 은행 간 신뢰의 근본적인 변화가 진행 중일 수 있습니다. 뉴스가 조용한 이 시기에 실제로는 중요한 전환점이 될 수 있으므로, 거대 자본가들은 이런 시점을 매우 주의 깊게 관찰합니다.

다음 단계를 예의주시해야 합니다: 1) 하락 전환으로 이어질 가능성 (은행 간 신뢰 후퇴), 2) 정상 증가로 복귀할 가능성 (신뢰 회복), 3) 계속 수평을 유지할 가능성 (장기적인 신뢰 정체). 

특히 이 시기에는 RRP와 MMF를 함께 보는 교차 판독이 중요합니다. SOFR-IORB 괴리와 RRP 사용 증가, MMF 자금 유입이 동시에 이루어지면, 민간 신뢰 회피가 구조적으로 진행되고 있다는 의미일 수 있습니다.`;
      } else if (readingAnalysis.includes("하락 속도 가속")) {
        // 4. 하락 속도 가속 (경고. 언제 터질까의 문제) - '📊 판독' 항목 4번
        overallComment = `**📊 판독 항목 4번: 하락 속도 빨라졌는가 - 경고. 언제 터질까의 문제**

은행 간 신뢰가 후퇴하고 있으며, 하락 속도가 빨라지고 있습니다. 이는 '📊 판독' 항목에서 설명한 네 번째이자 가장 심각한 신호인 "하락 속도 빨라졌는가"에 해당하며, 경고 상태입니다. 언제 터질까의 문제로, 위기 전조 신호입니다.

**판독 해석:**
하락이 시작된 후 속도가 빨라지면, 은행 간 신뢰가 급격히 후퇴하고 있다는 의미입니다. 이는 '📊 판독' 항목 3번(하락 전환 - 은행 간 신뢰 후퇴)에서 한 단계 더 심화된 상태로, 은행들이 서로를 신뢰하지 않고 중앙은행으로 돌아가는 속도가 가속화되고 있음을 나타냅니다. 은행 신뢰의 척도가 급격히 변화하고 멈추는 시점입니다.

**경제 코치 종합 분석:**
은행들이 서로를 신뢰하지 않고 중앙은행(IORB)을 기본 선택지로 고정한 상태이며, 그 속도가 가속화되고 있습니다. 이는 SOFR-IORB 스프레드 관점에서 보면 "방어 상태"에 해당합니다 - 이미 괴리가 발생해서 붙지 않고 유지되는 상태로, 간헐적으로 더 벌어지는 상황입니다.

거대 자본가들은 이런 시점에 즉시 방어적 포지션으로 전환합니다: 1) 리스크가 큰 우선순서대로 자산 정리 (공격적 투자 중단), 2) 현금 확보로 선택지 넓히기 (포지션 대기 판단), 3) SLOOS(은행 대출 기준 조사) 후행 확인으로 은행 내부 판단이 공식 문서로 확정되는지 확인.

이 시기에는 교차 판독이 절대적으로 필요합니다. SLOOS에서 분기 차로 대출 기준 강화 응답이 증가하는지 확인하여, 은행 내부 판단이 공식 문서로 확정되는지 확인해야 합니다. 또한 RRP 사용 증가와 MMF 자금 유입을 함께 보면, 민간 신뢰 회피가 구조적으로 진행되고 있음을 더욱 확실히 알 수 있습니다.`;
      } else if (readingAnalysis.includes("하락 전환")) {
        // 3. 하락 전환 (은행 간 신뢰 후퇴) - '📊 판독' 항목 3번
        overallComment = `**📊 판독 항목 3번: 하락 전환 - 은행 간 신뢰 후퇴**

은행 간 신뢰가 후퇴하기 시작했습니다. 준비금이 감소하기 시작한 상태로, 이는 '📊 판독' 항목에서 설명한 세 번째 신호인 "하락 전환"에 해당하며, 은행 간 신뢰 후퇴 단계입니다.

**판독 해석:**
준비금이 감소하기 시작하면, 은행들이 서로를 신뢰하지 않고 중앙은행으로 돌아가기 시작했다는 신호입니다. '🎯 목적'에서 설명한 "은행 신뢰의 척도가 변화하고 멈추는 순간"이 시작되는 시점입니다. 은행들이 서로를 신뢰하는 대신 중앙은행(IORB)을 선택하기 시작했다는 의미입니다.

**경제 코치 종합 분석:**
은행 신뢰의 척도가 변화하고 멈추는 중요한 전환점입니다. 은행들이 서로를 포기하고 중앙은행을 선택지로 고려하기 시작했다는 의미입니다. SOFR-IORB 스프레드 관점에서 보면, 이는 "경계 상태"에 해당할 수 있습니다 - SOFR과 IORB 간의 괴리가 발생했고, 다시 붙으려는 시도가 반복될 때 은행 간 신뢰 선별이 시작되었다는 뜻입니다.

거대 자본가들은 이런 시점에 리스크 관리에 집중하며, 다음을 확인합니다: 1) 하락 속도가 빨라지는지 (판독 항목 4번으로 발전), 2) 정상으로 복귀하는지 (거의 수평 또는 증가 속도 둔화로 회복), 3) 교차 판독으로 신호 확인 (SOFR-IORB 스프레드, RRP/MMF, SLOOS).

특히 이 시기에는 준비금 속도 둔화와 SOFR-IORB 괴리를 더블 체크하는 교차 판독이 중요합니다. 준비금으로 자본의 태도에서 SOFR-IORB 간극으로 행동 전환되는지 확인해야 합니다. 이 조합이 나오면 뻔한 긴장은 끝난 것입니다.`;
      } else if (readingAnalysis.includes("정상 증가")) {
        // 정상 증가
        overallComment = `**📊 판독 결과: 정상 증가**

은행 준비금이 안정적으로 증가하고 있습니다. 은행 간 신뢰가 유지되고 있는 상태로, '📊 판독' 항목에서 설명한 경고 신호들(증가 속도 둔화, 거의 수평, 하락 전환, 하락 속도 가속)에 해당하지 않는 정상적인 상태입니다.

**판독 해석:**
은행들이 서로를 신뢰하고 자금을 순환시키고 있다는 긍정적인 신호입니다. 은행 신뢰의 척도가 정상적으로 작동하고 있으며, '🎯 목적'에서 설명한 대로 은행들이 서로를 얼마나 신뢰하는지, 그리고 그 신뢰가 어떻게 변화하는지를 관찰하는 지표가 건강한 상태를 보여주고 있습니다.

**경제 코치 종합 분석:**
유동성 환경이 개선되고 있으며, 신용 창출이 활발해질 수 있는 환경입니다. 은행 간 신뢰가 유지되고 있으므로, 거대 자본가들은 이런 시점에 성장 자산의 비중을 늘립니다. SOFR-IORB 스프레드 관점에서 보면 "정상 상태"에 해당합니다 - SOFR과 IORB가 붙었다가 다시 붙는 상태로, 시스템 자율 유지 상태입니다.

다만, 지속적인 관찰이 필요합니다: 1) 증가 속도가 둔화되는지 (판독 항목 1번으로 발전할 가능성), 2) 교차 판독으로 다른 신호와의 조합 확인 (SOFR-IORB 스프레드, RRP/MMF 상태), 3) 장기적인 트렌드 유지 여부 확인.

이런 시기에는 포지션 유지 판단을 내릴 수 있습니다. SOFR-IORB 괴리가 미미한 상태이므로, 현재 포지션을 유지하면서도 다음 신호에 대비하여 주의 깊게 관찰해야 합니다.`;
      }
    } else if (currentValue && previousValue && change) {
      // 판독 분석이 없을 때는 기본 설명
      overallComment = `은행 준비금의 현재 상태를 분석하기 위해 차트 데이터를 기반으로 한 판독 분석이 필요합니다. 현재 값은 ${currentValue.toFixed(0)}억 달러이며, 이전 값 대비 ${change > 0 ? '+' : ''}${change.toFixed(1)}억 달러(${changePercent !== null ? `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%` : 'N/A'})입니다.

'📊 판독' 항목에서 설명한 4가지 신호(증가 속도 둔화, 거의 수평, 하락 전환, 하락 속도 가속)를 확인하기 위해서는 최근 1년간의 차트 데이터를 분석하여 트렌드와 속도 변화를 관찰해야 합니다.`;
    }
    
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.send(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>은행 준비금의 속도 상세 분석</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    html, body { overflow-x: hidden; overflow-y: auto; margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;background:#0a0a0a;color:#e8e8e8}
    .page-header{background:#1a1a1a;border-bottom:1px solid #2d2d2d;padding:24px;margin-bottom:24px}
    .page-header h1{font-size:24px;font-weight:700;color:#ffffff;margin:0 0 8px 0}
    .page-header .sub{font-size:14px;color:#9ca3af}
    .page-header .sub a{color:#a78bfa;text-decoration:none}
    .page-header .sub a:hover{text-decoration:underline}
    .main-content{max-width:1400px;margin:0 auto;padding:24px}
    .value-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .value-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:16px}
    .value-item{background:#252525;border-radius:8px;padding:16px}
    .value-label{font-size:12px;color:#9ca3af;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .value-number{font-size:24px;font-weight:700;color:#ffffff;margin-bottom:4px}
    .value-unit{font-size:12px;color:#808080}
    .value-change{font-size:14px;margin-top:8px}
    .value-change.positive{color:#10b981}
    .value-change.negative{color:#ef4444}
    .value-change.neutral{color:#9ca3af}
    .chart-container{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .chart-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px}
    .chart-wrapper{position:relative;width:100%;height:400px}
    #reservesChart{width:100%!important;height:100%!important}
    .analysis-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .section-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .section-content{font-size:14px;line-height:1.8;color:#c0c0c0;white-space:pre-line}
    .section-content strong{color:#ffffff;font-weight:700}
    .interpretation-box{background:#252525;border-left:4px solid #8b5cf6;border-radius:8px;padding:20px;margin-top:16px}
    .memo-section{background:#1f1f1f;border:1px solid #2d2d2d;border-radius:12px;padding:24px;margin-bottom:24px}
    .memo-title{font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .memo-form{display:flex;flex-direction:column;gap:12px;margin-bottom:20px}
    .memo-input{width:100%;min-height:80px;padding:12px;background:#1a1a1a;border:1px solid #2d2d2d;border-radius:8px;color:#ffffff;font-size:14px;font-family:inherit;resize:vertical;outline:none;transition:border-color 0.2s}
    .memo-input:focus{border-color:#4dabf7}
    .memo-input::placeholder{color:#808080}
    .memo-actions{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .memo-char-count{font-size:12px;color:#808080}
    .memo-submit-btn{padding:10px 20px;background:#4dabf7;border:none;border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s}
    .memo-submit-btn:hover{background:#339af0}
    .memo-submit-btn:disabled{background:#3d3d3d;color:#808080;cursor:not-allowed}
    .memo-history{display:flex;flex-direction:column;gap:12px}
    .memo-history-title{font-size:16px;font-weight:600;color:#ffffff;margin-bottom:8px}
    .memo-history-empty{text-align:center;padding:24px;color:#808080;font-size:14px}
    .memo-item{background:#1a1a1a;border:1px solid #2d2d2d;border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px}
    .memo-item-header{display:flex;justify-content:space-between;align-items:center}
    .memo-item-date{font-size:12px;color:#808080}
    .memo-item-delete{background:none;border:none;color:#ef4444;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.2s}
    .memo-item-delete:hover{background:rgba(239,68,68,0.1)}
    .memo-item-text{font-size:14px;line-height:1.6;color:#c0c0c0;white-space:pre-wrap;word-break:break-word}
    @media (max-width: 640px) {
      .chart-container{padding:16px;margin-bottom:16px}
      .chart-title{font-size:16px;margin-bottom:12px}
      .chart-wrapper{height:clamp(320px, 60vh, 520px);min-height:320px}
    }
    @media (max-width: 768px) {
      .value-grid{grid-template-columns:1fr}
      .main-content{padding:16px}
      .value-section{padding:16px}
      .analysis-section{padding:16px;margin-bottom:16px}
      .page-header{padding:16px}
      .page-header h1{font-size:20px}
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>📊 은행 준비금의 속도 상세 분석</h1>
    <div class="sub"><a href="/secret-indicators">← 비밀지표로 돌아가기</a></div>
  </div>
  <div class="main-content">
    ${currentData ? `<div class="value-section">
      <div class="value-grid">
        <div class="value-item">
          <div class="value-label">현재 값</div>
          <div class="value-number">${currentValue ? currentValue.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) : 'N/A'}<span class="value-unit">억 달러</span></div>
          ${change !== null ? `<div class="value-change ${change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral'}">${change > 0 ? '+' : ''}${change.toFixed(1)}억 달러${changePercent !== null ? `(${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)` : ''}</div>` : ''}
        </div>
        ${previousValue ? `<div class="value-item">
          <div class="value-label">이전 값</div>
          <div class="value-number">${previousValue.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}<span class="value-unit">억 달러</span></div>
        </div>` : ''}
        <div class="value-item">
          <div class="value-label">업데이트</div>
          <div class="value-number" style="font-size:16px">${currentData.date}</div>
        </div>
      </div>
    </div>` : `<div class="value-section"><div style="text-align:center;padding:40px;color:#9ca3af"><div style="font-size:24px;margin-bottom:16px">⚠️</div><div>데이터를 가져오는 중입니다. 잠시 후 다시 확인해주세요.</div></div></div>`}
    ${chartData ? `<div class="chart-container">
      <div class="chart-title">은행 준비금 차트 (최근 1년)</div>
      <div class="chart-wrapper"><canvas id="reservesChart"></canvas></div>
    </div>` : ''}
    <div class="analysis-section">
      <div class="section-title"><span>📚 개념</span></div>
      <div class="section-content">WRESBAL은 연준(Fed)에 예치된 '은행 준비금(reserve balances)'의 주간 잔액입니다. 상업은행들이 연준에 보유한 준비금 총액을 나타냅니다.</div>
    </div>
    <div class="analysis-section">
      <div class="section-title"><span>🎯 목적</span></div>
      <div class="section-content">은행 신뢰의 척도가 변화하고 멈추는 순간을 보는 것입니다. 돈의 양이 아니라 은행들이 서로를 얼마나 신뢰하는지, 그리고 그 신뢰가 어떻게 변화하는지를 관찰하는 지표입니다.</div>
    </div>
    <div class="analysis-section">
      <div class="section-title"><span>📊 판독</span></div>
      <div class="section-content"><strong>1. 증가 속도 둔화 (기울기 완만)</strong> - 1차 경고
은행 준비금이 증가는 하지만 증가 속도가 둔화되고 있다면, 은행 간 신뢰가 약화되기 시작하는 신호입니다.

<strong>2. 거의 수평</strong> - 뉴스가 아무 말도 안하는 시기
준비금이 거의 변동하지 않고 수평선에 가까워지면, 은행들이 서로를 신뢰하지 않으면서도 위기라고 판단하지 않는 상태입니다. 이는 뉴스가 아무 말도 하지 않는 시기로, 조용한 변화가 일어나고 있음을 의미합니다.

<strong>3. 하락 전환</strong> - 은행 간 신뢰 후퇴
준비금이 감소하기 시작하면, 은행들이 서로를 신뢰하지 않고 중앙은행으로 돌아가기 시작했다는 신호입니다.

<strong>4. 하락 속도 빨라졌는가</strong> - 경고. 언제 터질까의 문제
하락이 시작된 후 속도가 빨라지면, 은행 간 신뢰가 급격히 후퇴하고 있다는 의미입니다. 이는 언제 터질까의 문제로, 위기 전조 신호입니다.</div>
      ${readingAnalysis ? `<div class="interpretation-box"><div class="section-content"><strong>현재 판독:</strong><br/>${escapeHtml(readingAnalysis)}</div></div>` : ''}
    </div>
    ${overallComment ? `<div class="analysis-section">
      <div class="section-title"><span>💼 경제 코치 종합 코멘트</span></div>
      <div class="interpretation-box"><div class="section-content">${escapeHtml(overallComment)}</div></div>
    </div>` : ''}
    
    <div class="memo-section">
      <div class="memo-title">
        <span>📝</span>
        <span>개인 메모</span>
      </div>
      <div class="memo-form">
        <textarea id="memoInput" class="memo-input" placeholder="이 지표에 대한 개인 메모를 작성하세요 (50자 내외 권장)"></textarea>
        <div class="memo-actions">
          <span class="memo-char-count"><span id="memoCharCount">0</span>자</span>
          <button id="memoSubmitBtn" class="memo-submit-btn">추가</button>
        </div>
      </div>
      <div class="memo-history">
        <div class="memo-history-title">메모 히스토리</div>
        <div id="memoHistoryList"></div>
      </div>
    </div>
  </div>
  <script>
    // 메모 기능
    (function() {
      const indicatorId = 'bank-reserves-velocity';
      const memoStorageKey = 'secret-indicator-memos';
      const memoInput = document.getElementById('memoInput');
      const memoSubmitBtn = document.getElementById('memoSubmitBtn');
      const memoCharCount = document.getElementById('memoCharCount');
      const memoHistoryList = document.getElementById('memoHistoryList');
      
      // 로컬 스토리지에서 메모 불러오기
      function loadMemos() {
        try {
          const allMemos = JSON.parse(localStorage.getItem(memoStorageKey) || '{}');
          return allMemos[indicatorId] || [];
        } catch (e) {
          console.error('Failed to load memos:', e);
          return [];
        }
      }
      
      // 로컬 스토리지에 메모 저장하기
      function saveMemos(memos) {
        try {
          const allMemos = JSON.parse(localStorage.getItem(memoStorageKey) || '{}');
          allMemos[indicatorId] = memos;
          localStorage.setItem(memoStorageKey, JSON.stringify(allMemos));
        } catch (e) {
          console.error('Failed to save memos:', e);
        }
      }
      
      // 메모 히스토리 렌더링
      function renderMemoHistory() {
        const memos = loadMemos();
        
        if (memos.length === 0) {
          memoHistoryList.innerHTML = '<div class="memo-history-empty">저장된 메모가 없습니다.</div>';
          return;
        }
        
        // 최신순으로 정렬
        const sortedMemos = memos.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        memoHistoryList.innerHTML = sortedMemos.map((memo, index) => {
          const date = new Date(memo.date);
          const dateStr = date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }
          
          const escapedText = escapeHtml(memo.text);
          
          return '<div class="memo-item">' +
            '<div class="memo-item-header">' +
            '<span class="memo-item-date">' + dateStr + '</span>' +
            '<button class="memo-item-delete" onclick="deleteMemo(' + index + ')">삭제</button>' +
            '</div>' +
            '<div class="memo-item-text">' + escapedText + '</div>' +
            '</div>';
        }).join('');
      }
      
      // 메모 추가
      function addMemo() {
        const text = memoInput.value.trim();
        if (!text) {
          alert('메모 내용을 입력해주세요.');
          return;
        }
        
        const memos = loadMemos();
        const newMemo = {
          text: text,
          date: new Date().toISOString()
        };
        
        memos.push(newMemo);
        saveMemos(memos);
        
        memoInput.value = '';
        updateCharCount();
        renderMemoHistory();
      }
      
      // 메모 삭제
      window.deleteMemo = function(index) {
        if (!confirm('이 메모를 삭제하시겠습니까?')) {
          return;
        }
        
        const memos = loadMemos();
        const sortedMemos = memos.sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedMemos.splice(index, 1);
        
        saveMemos(sortedMemos);
        renderMemoHistory();
      };
      
      // 글자수 업데이트
      function updateCharCount() {
        const length = memoInput.value.length;
        memoCharCount.textContent = length;
      }
      
      // 이벤트 리스너
      memoInput.addEventListener('input', updateCharCount);
      memoSubmitBtn.addEventListener('click', addMemo);
      memoInput.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'Enter') {
          addMemo();
        }
      });
      
      // 초기화
      updateCharCount();
      renderMemoHistory();
    })();
  </script>
  ${chartData ? `<script>
    const chartData = ${chartDataJson};
    if (chartData) {
      const mobileMediaQuery = window.matchMedia('(max-width: 640px)');
      let isMobile = mobileMediaQuery.matches;
      let chartInstance = null;
      let resizeTimer;
      const handleResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const wasMobile = isMobile;
          isMobile = window.matchMedia('(max-width: 640px)').matches;
          if (wasMobile !== isMobile && chartInstance) {
            chartInstance.destroy();
            chartInstance = initChart();
          } else if (chartInstance) {
            chartInstance.resize();
          }
        }, 250);
      };
      const initChart = () => {
        const canvas = document.getElementById('reservesChart');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const baseOptions = {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: '#e8e8e8', font: { size: 12 } } },
            tooltip: { backgroundColor: 'rgba(0, 0, 0, 0.8)', titleColor: '#ffffff', bodyColor: '#e8e8e8', borderColor: '#2d2d2d', borderWidth: 1, titleFont: { size: 12 }, bodyFont: { size: 11 } }
          },
          scales: {
            x: { ticks: { color: '#9ca3af', maxRotation: 45, minRotation: 45, font: { size: 11 } }, grid: { color: '#2d2d2d' } },
            y: { type: 'linear', display: true, position: 'left', title: { display: true, text: '억 달러', color: '#9ca3af', font: { size: 12 } }, ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { color: '#2d2d2d' } }
          },
          layout: { padding: { top: 10, right: 10, bottom: 10, left: 10 } }
        };
        if (isMobile) {
          baseOptions.maintainAspectRatio = false;
          baseOptions.plugins.legend.position = 'bottom';
          baseOptions.plugins.legend.labels.font.size = 13;
          baseOptions.plugins.legend.labels.boxWidth = 14;
          baseOptions.plugins.legend.labels.padding = 12;
          baseOptions.plugins.tooltip.titleFont.size = 14;
          baseOptions.plugins.tooltip.bodyFont.size = 13;
          baseOptions.plugins.tooltip.padding = 12;
          baseOptions.plugins.tooltip.titleSpacing = 8;
          baseOptions.plugins.tooltip.bodySpacing = 6;
          baseOptions.scales.x.ticks.maxRotation = 0;
          baseOptions.scales.x.ticks.minRotation = 0;
          baseOptions.scales.x.ticks.font.size = 11;
          baseOptions.scales.x.ticks.autoSkip = true;
          baseOptions.scales.x.ticks.maxTicksLimit = 6;
          baseOptions.scales.x.ticks.padding = 8;
          baseOptions.scales.y.title.font.size = 13;
          baseOptions.scales.y.ticks.font.size = 12;
          baseOptions.scales.y.ticks.padding = 8;
          baseOptions.layout.padding = { top: 16, right: 16, bottom: 16, left: 16 };
          baseOptions.elements = { point: { radius: 3, hoverRadius: 5 }, line: { borderWidth: 2 } };
        }
        return new Chart(ctx, { type: 'line', data: chartData, options: baseOptions });
      };
      chartInstance = initChart();
      window.addEventListener('resize', handleResize);
      mobileMediaQuery.addEventListener('change', handleResize);
    }
  </script>` : ''}
</body>
</html>`);
  } catch (e: any) {
    res.status(500).send(`오류 발생: ${e?.message ?? String(e)}`);
  }
});

// Vercel serverless function export
export default app;

