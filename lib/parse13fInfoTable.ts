/**
 * 13F 정보표(Information Table) XML 파서.
 * - value 단위: thousand USD (화면 표시 시 * 1000).
 * - XML namespace 무시, 태그명만 매칭.
 */

export type Holding13F = {
  nameOfIssuer: string;
  cusip: string;
  value: number;
  sshPrnamt: number;
  sshPrnamtType: string;
  putCall: string | null;
  investmentDiscretion: string | null;
  otherManager: string | null;
  votingAuthority: { Sole?: number; Shared?: number; None?: number } | null;
};

function extractTag(text: string, tagName: string): string | null {
  const re = new RegExp(`<[a-zA-Z0-9_:]*${tagName}[^>]*>([\\s\\S]*?)</[a-zA-Z0-9_:]*${tagName}>`, "i");
  const m = text.match(re);
  if (!m) return null;
  return (m[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null;
}

function parseNumber(s: string | null): number {
  if (s == null || s === "") return 0;
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * XML 문자열에서 infoTable 블록들을 추출해 Holding13F[] 반환.
 * - 정보표가 없거나 파싱 실패 시 빈 배열.
 */
export function parse13fInfoTableXml(xml: string): Holding13F[] {
  if (!xml || typeof xml !== "string") return [];
  const blocks: string[] = [];
  const re = /<[a-zA-Z0-9_:]*infoTable[^>]*>([\s\S]*?)<\/[a-zA-Z0-9_:]*infoTable>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) blocks.push(m[1]);

  const holdings: Holding13F[] = [];
  for (const block of blocks) {
    const nameOfIssuer = extractTag(block, "nameOfIssuer") ?? "";
    const cusip = extractTag(block, "cusip") ?? "";
    const value = parseNumber(extractTag(block, "value"));
    const sshPrnamt = parseNumber(extractTag(block, "sshPrnamt"));
    const sshPrnamtType = extractTag(block, "sshPrnamtType") ?? "";
    const putCall = extractTag(block, "putCall") ?? null;
    const investmentDiscretion = extractTag(block, "investmentDiscretion") ?? null;
    const otherManager = extractTag(block, "otherManager") ?? null;
    const sole = parseNumber(extractTag(block, "Sole"));
    const shared = parseNumber(extractTag(block, "Shared"));
    const none = parseNumber(extractTag(block, "None"));
    const votingAuthority =
      sole || shared || none ? { Sole: sole || undefined, Shared: shared || undefined, None: none || undefined } : null;
    if (!nameOfIssuer && !cusip) continue;
    holdings.push({
      nameOfIssuer,
      cusip,
      value,
      sshPrnamt,
      sshPrnamtType: sshPrnamtType.toUpperCase().slice(0, 10) || "SH",
      putCall,
      investmentDiscretion,
      otherManager,
      votingAuthority,
    });
  }
  return holdings;
}

/**
 * TXT 형식은 2차: 최소 컬럼(name/cusip/value/shares)만 시도.
 * - 탭/쉼마 구분, 첫 행 헤더 가정.
 */
export function parse13fInfoTableTxt(txt: string): Holding13F[] {
  if (!txt || typeof txt !== "string") return [];
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const nameIdx = header.includes("issuer") ? header.indexOf("issuer") : header.includes("name") ? header.indexOf("name") : 0;
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const cols = lines[0].split(sep).map((c) => c.trim().toLowerCase());
  const cusipIdx = cols.findIndex((c) => c.includes("cusip"));
  const valueIdx = cols.findIndex((c) => c.includes("value"));
  const shIdx = cols.findIndex((c) => c.includes("ssh") || c.includes("shares"));
  if (valueIdx === -1) return [];
  const holdings: Holding13F[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim());
    const nameOfIssuer = cells[nameIdx] ?? "";
    const cusip = cusipIdx >= 0 ? (cells[cusipIdx] ?? "") : "";
    const value = parseNumber(cells[valueIdx]);
    const sshPrnamt = shIdx >= 0 ? parseNumber(cells[shIdx]) : 0;
    if (!nameOfIssuer && !cusip) continue;
    holdings.push({
      nameOfIssuer,
      cusip,
      value,
      sshPrnamt,
      sshPrnamtType: "SH",
      putCall: null,
      investmentDiscretion: null,
      otherManager: null,
      votingAuthority: null,
    });
  }
  return holdings;
}
