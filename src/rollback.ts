/**
 * 롤백 기준일 설정
 * - macro-trace 화면은 제외하고 H.4.1 계열 데이터만 고정
 */

export const ROLLBACK_ENABLED = true;
export const ROLLBACK_DATE = "2026-01-24";

export const getRollbackDate = () => (ROLLBACK_ENABLED ? ROLLBACK_DATE : null);

export const applyRollbackDate = (requested?: string | null) =>
  ROLLBACK_ENABLED ? ROLLBACK_DATE : requested ?? undefined;
