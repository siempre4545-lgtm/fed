/**
 * H.4.1 HTML 파싱 로직 (src/h41.ts에서 핵심 부분만 추출)
 * Next.js에서 사용 가능하도록 lib로 이동
 */

import * as cheerio from 'cheerio';

const SOURCE_URL = 'https://www.federalreserve.gov/releases/h41/current/';
const ARCHIVE_BASE_URL = 'https://www.federalreserve.gov/releases/h41/';

export type H41Card = {
  key: string;
  title: string;
  fedLabel: string;
  balance_musd: number;
  change_musd: number;
  balance_okeusd: number;
  change_okeusd: number;
  liquidityTag: '흡수(약재)' | '공급(해열)' | 'QT/자산' | '상태';
  concept: string;
  interpretation: string;
  dataDate: string;
  qtQeSignal?: 'QT' | 'QE' | '중립';
};

export type H41Report = {
  releaseDateText: string;
  asOfWeekEndedText: string;
  sourceUrl: string;
  cards: H41Card[];
  updatedAtISO: string;
  warningLevel: 0 | 1 | 2 | 3;
  assetGuidance: string;
  teamSignal: { blueTeam: string; whiteTeam: string; summary: string };
  weeklySummary: string;
  coreCards: H41Card[];
  rawText?: string; // 추가 테이블 파싱을 위한 원본 텍스트
};

const ITEM_DEFS: Array<{
  key: string;
  title: string;
  fedLabel: string;
  liquidityTag: H41Card['liquidityTag'];
  isCore?: boolean;
}> = [
  { key: 'ⓐ', title: '재무부 일반계정 (TGA)', fedLabel: 'U.S. Treasury, General Account', liquidityTag: '흡수(약재)', isCore: true },
  { key: 'ⓑ', title: '역리포 (RRP)', fedLabel: 'Reverse repurchase agreements', liquidityTag: '흡수(약재)', isCore: true },
  { key: 'ⓒ', title: '통화발행 (현금)', fedLabel: 'Currency in circulation', liquidityTag: '흡수(약재)' },
  { key: 'ⓓ', title: '기타 부채·자본', fedLabel: 'Other liabilities and capital', liquidityTag: '흡수(약재)' },
  { key: 'ⓔ', title: '리포 (Repo)', fedLabel: 'Repurchase agreements', liquidityTag: '공급(해열)', isCore: true },
  { key: 'ⓕ', title: 'Primary Credit', fedLabel: 'Primary credit', liquidityTag: '공급(해열)', isCore: true },
  { key: 'ⓖ', title: '달러 스왑 (중앙은행)', fedLabel: 'Central bank liquidity swaps', liquidityTag: '공급(해열)' },
  { key: 'ⓗ', title: '보유증권 총계', fedLabel: 'Securities held outright', liquidityTag: 'QT/자산', isCore: true },
  { key: 'ⓘ', title: '미국 국채 보유 (UST)', fedLabel: 'U.S. Treasury securities', liquidityTag: 'QT/자산' },
  { key: 'ⓙ', title: 'MBS 보유', fedLabel: 'Mortgage-backed securities', liquidityTag: 'QT/자산' },
  { key: 'ⓚ', title: '지준금 (Reserve balances)', fedLabel: 'Reserve balances with Federal Reserve Banks', liquidityTag: '상태', isCore: true },
  { key: 'ⓛ', title: 'Fed 자산 총규모 (Reserve Bank credit)', fedLabel: 'Reserve Bank credit', liquidityTag: '상태' },
  { key: 'ⓜ', title: '기타 예치금 (지준금 제외)', fedLabel: 'Deposits with F.R. Banks, other than reserve balances', liquidityTag: '상태' },
  { key: 'ⓝ', title: '흡수 총합 (지준금 제외)', fedLabel: 'Total factors, other than reserve balances,', liquidityTag: '상태' },
];

const CORE_FED_LABELS = [
  'U.S. Treasury, General Account',
  'Reverse repurchase agreements',
  'Reserve balances with Federal Reserve Banks',
  'Securities held outright',
  'Repurchase agreements',
  'Primary credit',
];

function parseNumberFromText(t: string): number | null {
  const cleaned = t.replace(/\u00a0/g, ' ').trim();
  if (!cleaned) return null;
  const m = cleaned.match(/^([+-])?\s*([\d,]+)$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return sign * n;
}

function toOkEusd(musd: number): number {
  return musd / 100;
}

function yyyymmddFromISO(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid ISO date format: ${iso}`);
  }
  const [y, m, d] = parts;
  return `${y}${m}${d}`;
}

function findLabelIndex(lines: string[], searchLabel: string): number {
  let idx = lines.findIndex(l => l === searchLabel);
  if (idx >= 0) return idx;

  const lowerSearch = searchLabel.toLowerCase();
  idx = lines.findIndex(l => l.toLowerCase() === lowerSearch);
  if (idx >= 0) return idx;

  const keywords = searchLabel.toLowerCase().split(/[,\s]+/).filter(k => k.length > 3);
  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    if (keywords.every(kw => lineLower.includes(kw))) {
      return i;
    }
  }

  if (searchLabel.includes('Reverse repurchase')) {
    idx = lines.findIndex(l =>
      l.toLowerCase().includes('reverse') &&
      (l.toLowerCase().includes('repo') || l.toLowerCase().includes('repurchase'))
    );
    if (idx >= 0) return idx;
  }
  if (searchLabel.includes('Repurchase agreements') && !searchLabel.includes('Reverse')) {
    idx = lines.findIndex(l =>
      l.toLowerCase().includes('repurchase') &&
      !l.toLowerCase().includes('reverse')
    );
    if (idx >= 0) return idx;
  }
  if (searchLabel.includes('Securities held outright')) {
    idx = lines.findIndex(l =>
      l.toLowerCase().includes('securities') &&
      l.toLowerCase().includes('held') &&
      l.toLowerCase().includes('outright')
    );
    if (idx >= 0) return idx;
  }

  return -1;
}

function getConcept(fedLabel: string, liquidityTag: H41Card['liquidityTag']): string {
  if (fedLabel.includes('Treasury') && fedLabel.includes('General Account')) {
    return '재무부 일반계정(TGA)은 정부가 징수한 세금과 국채 발행 자금을 보관하는 계정입니다.';
  }
  if (fedLabel.includes('Reverse repurchase')) {
    return '역리포(RRP)는 금융기관이 연준에 단기 자금을 예치하는 수단입니다.';
  }
  if (fedLabel.includes('Repurchase agreements') && !fedLabel.includes('Reverse')) {
    return '리포(Repo)는 연준이 금융기관에 단기 자금을 공급하는 수단입니다.';
  }
  if (fedLabel.includes('Primary credit')) {
    return 'Primary Credit은 은행들이 연준으로부터 직접 차입하는 융자입니다.';
  }
  if (fedLabel.includes('Securities held outright')) {
    return '보유증권 총계는 연준이 보유한 국채와 MBS의 총액입니다.';
  }
  if (fedLabel.includes('Reserve balances')) {
    return '지준금(Reserve balances)은 은행들이 연준에 예치한 준비금입니다.';
  }
  return '';
}

function getQtQeSignal(fedLabel: string, change_musd: number): 'QT' | 'QE' | '중립' {
  if (fedLabel.includes('Securities held outright')) {
    if (change_musd < -20000) return 'QT';
    if (change_musd > 20000) return 'QE';
    return '중립';
  }
  return '중립';
}

async function getWeeklyContext(): Promise<{ weekNumber: number; month: number; context: string }> {
  const now = new Date();
  const weekNumber = Math.ceil(now.getDate() / 7);
  const month = now.getMonth() + 1;
  const contexts = [
    '이번 주는 연준의 통화정책 방향성에 대한 시장의 관심이 높아진 가운데',
    '최근 금리 변동성과 자금 시장의 스트레스 지표를 고려할 때',
    '주요 경제 지표와 인플레이션 데이터를 종합하면',
    '금융 시장의 리스크 선호도 변화와 함께',
    '글로벌 유동성 환경과 달러 강세를 고려하면',
  ];
  return { weekNumber, month, context: contexts[weekNumber % contexts.length] };
}

async function interpret(
  rule: {
    liquidityTag: H41Card['liquidityTag'];
    title: string;
    fedLabel: string;
    change_musd: number;
    balance_musd: number;
  },
  weeklyContext: { weekNumber: number; month: number; context: string }
): Promise<string> {
  const ch = rule.change_musd;
  if (ch === 0) {
    return '현재 상태 유지 중입니다.';
  }
  // 간단한 해석 (실제로는 더 복잡한 로직)
  if (ch > 0) {
    return `${weeklyContext.context} 이 지표가 증가하고 있어요.`;
  } else {
    return `${weeklyContext.context} 이 지표가 감소하고 있어요.`;
  }
}

/**
 * H.4.1 리포트 파싱
 */
async function parseH41Report($: cheerio.CheerioAPI, sourceUrl: string): Promise<H41Report & { rawText?: string }> {
  const text = $('body').text().replace(/\r/g, '');
  const lines = text
    .split('\n')
    .map(s => s.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);

  const releaseDateLine = lines.find(l => l.startsWith('Release Date:')) ?? 'Release Date: (unknown)';
  const releaseDateText = releaseDateLine.replace('Release Date:', '').trim();

  let asOfWeekEndedText = '(unknown)';
  
  // Week ended 날짜를 찾기 위한 다양한 패턴 시도
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 패턴 1: "Week ended" 다음 줄에 날짜
    if (line === 'Week ended' && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (!nextLine.toLowerCase().includes('change from') && nextLine.match(/[A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4}/)) {
        asOfWeekEndedText = nextLine.trim();
        break;
      }
    }
    
    // 패턴 2: "Week ended January 8, 2026" 형식 (같은 줄)
    if (line.includes('Week ended') && !line.toLowerCase().includes('change from')) {
      const match = line.match(/Week\s+ended\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
      if (match) {
        asOfWeekEndedText = match[1].trim();
        break;
      }
    }
    
    // 패턴 3: "Week ending" 형식
    if (line.includes('Week ending') && !line.toLowerCase().includes('change from')) {
      const match = line.match(/Week\s+ending\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
      if (match) {
        asOfWeekEndedText = match[1].trim();
        break;
      }
    }
    
    // 패턴 4: "As of" 다음에 날짜
    if (line.includes('As of') && line.match(/[A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4}/)) {
      const match = line.match(/As\s+of\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i);
      if (match) {
        asOfWeekEndedText = match[1].trim();
        break;
      }
    }
  }
  
  // 여전히 찾지 못한 경우, 원본 텍스트에서 직접 검색
  if (asOfWeekEndedText === '(unknown)') {
    const text = $('body').text();
    const patterns = [
      /Week\s+ended\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i,
      /Week\s+ending\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i,
      /As\s+of\s+([A-Z][a-z]{2,}\s+\d{1,2},\s+\d{4})/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        asOfWeekEndedText = match[1].trim();
        break;
      }
    }
  }
  
  console.log('[parseH41Report] Week ended date found:', asOfWeekEndedText);

  const weeklyContext = await getWeeklyContext();

  const cards: H41Card[] = await Promise.all(
    ITEM_DEFS.map(async def => {
      const idx = findLabelIndex(lines, def.fedLabel);
      if (idx < 0) {
        return {
          key: def.key,
          title: def.title,
          fedLabel: def.fedLabel,
          balance_musd: 0,
          change_musd: 0,
          balance_okeusd: 0,
          change_okeusd: 0,
          liquidityTag: def.liquidityTag,
          concept: getConcept(def.fedLabel, def.liquidityTag),
          interpretation: '파싱 실패: H.4.1 페이지 구조 변경 가능성이 있습니다.',
          dataDate: asOfWeekEndedText,
          qtQeSignal: '중립' as const,
        };
      }

      let balance = 0;
      let change = 0;

      for (let i = 1; i <= 5; i++) {
        if (idx + i < lines.length) {
          const num = parseNumberFromText(lines[idx + i]);
          if (num !== null) {
            if (balance === 0) {
              balance = num;
            } else if (change === 0) {
              change = num;
              break;
            }
          }
        }
      }

      const concept = getConcept(def.fedLabel, def.liquidityTag);
      const interpretation = await interpret(
        {
          liquidityTag: def.liquidityTag,
          title: def.title,
          fedLabel: def.fedLabel,
          change_musd: change,
          balance_musd: balance,
        },
        weeklyContext
      );
      const qtQeSignal = getQtQeSignal(def.fedLabel, change);

      return {
        key: def.key,
        title: def.title,
        fedLabel: def.fedLabel,
        balance_musd: balance,
        change_musd: change,
        balance_okeusd: toOkEusd(balance),
        change_okeusd: toOkEusd(change),
        liquidityTag: def.liquidityTag,
        concept,
        interpretation,
        dataDate: asOfWeekEndedText,
        qtQeSignal,
      };
    })
  );

  const coreCards = cards.filter(c => CORE_FED_LABELS.includes(c.fedLabel));

  // 간단한 경고 레벨 계산
  let warningLevel: 0 | 1 | 2 | 3 = 0;
  const tga = cards.find(c => c.fedLabel === 'U.S. Treasury, General Account');
  const rrp = cards.find(c => c.fedLabel === 'Reverse repurchase agreements');
  const reserves = cards.find(c => c.fedLabel === 'Reserve balances with Federal Reserve Banks');
  if (tga && tga.change_musd > 50000) warningLevel = Math.max(warningLevel, 1);
  if (rrp && rrp.change_musd > 30000) warningLevel = Math.max(warningLevel, 1);
  if (reserves && reserves.change_musd < -50000) warningLevel = Math.max(warningLevel, 1);

  // rawText는 항상 저장 (Table 1 직접 파싱을 위해)
  const rawText = text || $('body').text().replace(/\r/g, '');
  
  return {
    releaseDateText,
    asOfWeekEndedText,
    sourceUrl,
    cards,
    updatedAtISO: new Date().toISOString(),
    warningLevel,
    assetGuidance: '유동성 환경을 분석하여 자산군 대응 방향을 제시합니다.',
    teamSignal: {
      blueTeam: '비중 확대 가능',
      whiteTeam: '기본 유지',
      summary: '청팀 우호적 환경 · 백팀 중립',
    },
    weeklySummary: '주간 요약 리포트입니다.',
    coreCards,
    rawText, // 추가 테이블 파싱을 위해 원본 텍스트 저장
  };
}

/**
 * H.4.1 리포트 가져오기
 */
export async function fetchH41Report(targetDate?: string, availableDates?: string[]): Promise<H41Report> {
  let url = SOURCE_URL;

  if (targetDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      throw new Error(`Invalid date format: ${targetDate}`);
    }

    const [yearStr] = targetDate.split('-');
    const year = parseInt(yearStr, 10);

    if (year < 2023) {
      throw new Error(`Archive date detected: ${targetDate}`);
    }

    const ymd = yyyymmddFromISO(targetDate);
    url = `${ARCHIVE_BASE_URL}${ymd}/default.htm`;
  }

  const res = await fetch(url, {
    headers: { 'user-agent': 'h41-dashboard/1.0 (+cursor)' },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch H.4.1: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  if (targetDate && html.length < 500) {
    throw new Error(`Failed to fetch H.4.1 archive for date ${targetDate}`);
  }

  const $ = cheerio.load(html);
  const report = await parseH41Report($, url);

  const hasValidData = report.cards.some(c => c.balance_musd !== 0 || c.change_musd !== 0);
  if (!hasValidData) {
    throw new Error(`Parsed H.4.1 data appears invalid (all zeros) for ${url}`);
  }

  return report;
}

/**
 * 발표 날짜 목록 가져오기 (간단한 구현)
 */
export async function getFedReleaseDates(): Promise<string[]> {
  try {
    const feedUrl = 'https://www.federalreserve.gov/feeds/h41.html';
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'h41-dashboard/1.0' },
      cache: 'no-store',
    });

    if (!response.ok) return [];

    const feedText = await response.text();
    const dates: string[] = [];
    const dateSet = new Set<string>();

    const patterns = [/\/releases\/h41\/(\d{8})\//g, /\/h41\/(\d{8})\//g];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(feedText)) !== null) {
        const dateStr = match[1];
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const isoDate = `${year}-${month}-${day}`;

        const yearNum = parseInt(year);
        const currentYear = new Date().getFullYear();
        const minYear = currentYear - 2;

        if (yearNum >= minYear && yearNum <= 2100 && !dateSet.has(isoDate)) {
          dates.push(isoDate);
          dateSet.add(isoDate);
        }
      }
    }

    dates.sort((a, b) => b.localeCompare(a));
    return dates;
  } catch (e) {
    console.warn('Error fetching release dates:', e);
    return [];
  }
}
