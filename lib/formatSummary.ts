/**
 * 13F 방향성 요약 — 계산 결과 기반 템플릿만 사용.
 * - LLM/추측 문장 금지. 숫자/퍼센트는 계산된 값만.
 */

import type { Holding13F } from "@/lib/parse13fInfoTable";
import type { Changes13F } from "@/lib/compute13fChanges";

function top10Pct(holdings: Holding13F[]): number {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  if (total <= 0) return 0;
  const top10 = holdings
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const sum10 = top10.reduce((s, h) => s + h.value, 0);
  return Math.round((sum10 / total) * 1000) / 10;
}

function concentrationLabel(pct: number): string {
  if (pct >= 70) return "높음";
  if (pct >= 40) return "중간";
  return "낮음";
}

export type Summary13F = {
  lines: string[];
  top10Pct: number;
  concentrationLabel: string;
  top1Issuer: string | null;
  top1ValueUsd: number;
  newCount: number;
  soldCount: number;
  increasedTop: string[];
  decreasedTop: string[];
};

export function formatSummary(
  holdings: Holding13F[],
  changes: Changes13F | null
): Summary13F {
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const pct = top10Pct(holdings);
  const top1 = sorted[0];
  const top1Issuer = top1?.nameOfIssuer ?? null;
  const top1ValueUsd = (top1?.value ?? 0) * 1000;

  const lines: string[] = [];
  lines.push(`Top 10 보유가 전체의 ${pct}%로 집중도가 ${concentrationLabel(pct)}입니다.`);
  if (top1Issuer) lines.push(`가장 큰 비중은 ${top1Issuer} (약 $${top1ValueUsd.toLocaleString()})입니다.`);

  let newCount = 0;
  let soldCount = 0;
  const increasedTop: string[] = [];
  const decreasedTop: string[] = [];

  if (changes) {
    newCount = changes.newEntries.length;
    soldCount = changes.soldOut.length;
    lines.push(`전분기 대비 신규편입 ${newCount}개, 청산 ${soldCount}개입니다.`);
    increasedTop.push(...changes.increased.slice(0, 5).map((c) => c.nameOfIssuer));
    decreasedTop.push(...changes.decreased.slice(0, 5).map((c) => c.nameOfIssuer));
    if (increasedTop.length) lines.push(`증가 상위: ${increasedTop.join(", ")}`);
    if (decreasedTop.length) lines.push(`감소 상위: ${decreasedTop.join(", ")}`);
  }

  return {
    lines,
    top10Pct: pct,
    concentrationLabel: concentrationLabel(pct),
    top1Issuer,
    top1ValueUsd,
    newCount,
    soldCount,
    increasedTop,
    decreasedTop,
  };
}
