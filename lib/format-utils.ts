/**
 * 공통 포맷팅 유틸리티
 * null-safe 처리를 위한 헬퍼 함수들
 */

/**
 * 델타 값 포맷팅 (null이면 "—" 반환)
 */
export function formatDelta(value: number | null): string {
  if (value === null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value / 1000).toFixed(1)}B`;
}

/**
 * 델타 값과 퍼센트 포맷팅
 */
export function formatDeltaPct(value: number | null, base: number | null): string {
  if (value === null || base === null || base === 0) return '—';
  const sign = value >= 0 ? '+' : '';
  const percent = ((value / base) * 100).toFixed(2);
  return `${sign}${(value / 1000).toFixed(1)}B (${sign}${percent}%)`;
}

/**
 * 값 포맷팅 (백만 달러 단위)
 */
export function formatValue(value: number | null): string {
  if (value === null) return '데이터 없음';
  return `$${value.toLocaleString('en-US')}M`;
}

/**
 * 값 포맷팅 (B 단위)
 */
export function formatValueB(value: number | null): string {
  if (value === null) return '—';
  return `${(value / 1000).toFixed(1)}B`;
}

/**
 * 변화 색상 결정
 */
export function getChangeColor(value: number | null): string {
  if (value === null) return 'text-gray-400';
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
}
