/**
 * 구형 어댑터 - 더 이상 사용되지 않음
 * 이 파일은 타입 호환성을 위해 최소 구현만 유지
 * 실제 사용은 parseH41HTML을 직접 사용하도록 변경됨
 */

// 더 이상 사용되지 않지만 타입 에러를 방지하기 위한 최소 구현
export async function convertH41ToH4Report(): Promise<never> {
  throw new Error('convertH41ToH4Report is deprecated. Use parseH41HTML instead.');
}
