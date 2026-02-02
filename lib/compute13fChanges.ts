/**
 * 13F 전분기 대비 증감/신규편입/청산 계산.
 * - 매칭 키: CUSIP 우선, 없거나 중복 시 issuer 문자열 보조.
 */

import type { Holding13F } from "@/lib/parse13fInfoTable";

export type ChangeItem = {
  nameOfIssuer: string;
  cusip: string;
  value: number;
  valuePrev: number;
  valueDelta: number;
  sshPrnamt: number;
  sshPrnamtPrev: number;
  sshPrnamtDelta: number;
};

export type Changes13F = {
  newEntries: Holding13F[];
  soldOut: Holding13F[];
  increased: ChangeItem[];
  decreased: ChangeItem[];
};

function key(c: Holding13F): string {
  const cusip = (c.cusip || "").trim().toUpperCase();
  const name = (c.nameOfIssuer || "").trim().toLowerCase().slice(0, 80);
  if (cusip) return `cusip:${cusip}`;
  return `name:${name}`;
}

export function compute13fChanges(
  prevHoldings: Holding13F[],
  latestHoldings: Holding13F[]
): Changes13F {
  const prevByKey = new Map<string, Holding13F>();
  for (const h of prevHoldings) prevByKey.set(key(h), h);
  const latestByKey = new Map<string, Holding13F>();
  for (const h of latestHoldings) latestByKey.set(key(h), h);

  const newEntries: Holding13F[] = [];
  const soldOut: Holding13F[] = [];
  const increased: ChangeItem[] = [];
  const decreased: ChangeItem[] = [];

  for (const [k, lat] of latestByKey) {
    const prev = prevByKey.get(k);
    if (!prev) {
      newEntries.push(lat);
      continue;
    }
    const valueDelta = lat.value - prev.value;
    const sshDelta = lat.sshPrnamt - prev.sshPrnamt;
    const item: ChangeItem = {
      nameOfIssuer: lat.nameOfIssuer,
      cusip: lat.cusip,
      value: lat.value,
      valuePrev: prev.value,
      valueDelta,
      sshPrnamt: lat.sshPrnamt,
      sshPrnamtPrev: prev.sshPrnamt,
      sshPrnamtDelta: sshDelta,
    };
    if (valueDelta > 0) increased.push(item);
    else if (valueDelta < 0) decreased.push(item);
  }
  for (const [k, p] of prevByKey) {
    if (!latestByKey.has(k)) soldOut.push(p);
  }

  increased.sort((a, b) => b.valueDelta - a.valueDelta);
  decreased.sort((a, b) => a.valueDelta - b.valueDelta);
  return { newEntries, soldOut, increased, decreased };
}
