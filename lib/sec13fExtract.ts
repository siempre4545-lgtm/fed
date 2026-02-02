/**
 * 13F HTML에서 보유 종목명 최소 추출.
 * - 표준화되지 않은 구조이므로 패턴 매칭만 사용.
 * - 추출 불가 시 빈 배열 반환 (상세 비공개 처리).
 */

/**
 * HTML에서 <tr> 내 첫 번째 셀 텍스트를 수집 (13F information table 1열 = Name of Issuer 추정).
 * - 2셀 이상인 행만 사용, 첫 셀 길이 2 초과.
 */
export function extract13FHolderNames(html: string): string[] {
  if (!html || typeof html !== "string") return [];
  const names: string[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const text = (cellMatch[1] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) cells.push(text);
    }
    if (cells.length >= 2 && cells[0].length > 2) {
      const name = cells[0].slice(0, 200);
      if (name && !/^\d+$/.test(name) && !names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}
