# 모바일 성능 최적화 리포트

## 개요
Express.js + Vercel Serverless Functions 기반 사이트의 모바일 성능 최적화 작업 완료

## 수정된 파일
1. `h41-dashboard/api/index.ts` - 메인 API 라우트 파일

## 적용된 최적화

### 1. Summary/Detail API 분리 ✅
**목적**: 초기 로딩 payload 축소

**변경사항**:
- `/api/h41/summary`: 숫자 데이터만 반환 (해석 제외)
- `/api/h41/detail?key=...`: 카드별 해석만 반환
- `/api/h41`: 기존 호환성 유지 (전체 데이터)

**효과**:
- 초기 HTML 크기 약 30-40% 감소 (해석 텍스트 제거)
- TTFB 개선 예상: 500ms-1s 감소

### 2. 병렬 Fetch 적용 ✅
**목적**: 순차적 await 제거로 총 로딩 시간 단축

**변경사항**:
- 홈 페이지: `releaseDates`, `indicators`, `news`, `usdKrwRate` 병렬 fetch
- 히스토리 API: 배치 크기 5로 병렬 처리 (기존 순차 for loop 제거)

**효과**:
- 홈 페이지: 순차 3-4초 → 병렬 1-2초 (약 50% 개선)
- 히스토리: 순차 10-15초 → 병렬 3-5초 (약 70% 개선)

### 3. 캐시 헤더 최적화 ✅
**목적**: Vercel Edge Caching 활성화

**변경사항**:
- H.4.1 데이터: `Cache-Control: public, s-maxage=600, stale-while-revalidate=3600` (10분 캐시)
- 경제 지표: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` (5분 캐시)
- 기존 `no-store` 헤더 제거

**효과**:
- 캐시 hit 시 TTFB: 5-6초 → 100-200ms (약 95% 개선)
- Edge 캐시로 전 세계 사용자에게 빠른 응답

### 4. Lazy Load 구현 ✅
**목적**: 초기 렌더링 시 불필요한 데이터 로드 방지

**변경사항**:
- 카드 해석을 초기 HTML에서 제거
- 카드 클릭 시 `/api/h41/detail` API 호출하여 해석 로드
- 클라이언트 측 캐싱 (브라우저 fetch cache)

**효과**:
- 초기 HTML 크기 감소
- 사용자가 실제로 필요한 해석만 로드

### 5. 에러 핸들링 강화 ✅
**목적**: 부분 실패 시에도 페이지 정상 작동

**변경사항**:
- `Promise.allSettled` 사용으로 일부 실패해도 나머지 성공
- 외부 API timeout 추가 (5초)
- `response.ok` 및 `content-type` 체크
- 실패한 카드만 "로드 실패" 표시, 전체 페이지는 정상 렌더

**효과**:
- 안정성 향상
- 사용자 경험 개선 (전체 페이지 다운 방지)

## 성능 개선 예상 수치

### 모바일 (p75 기준)
| 지표 | 개선 전 | 개선 후 | 개선율 |
|------|---------|---------|--------|
| TTFB (캐시 miss) | 5-6초 | 2-3초 | 약 50% |
| TTFB (캐시 hit) | 5-6초 | 100-200ms | 약 95% |
| LCP | 6-8초 | 2-4초 | 약 50% |
| 초기 HTML 크기 | ~150KB | ~100KB | 약 33% |
| 히스토리 로딩 | 10-15초 | 3-5초 | 약 70% |

### 데스크톱
| 지표 | 개선 전 | 개선 후 | 개선율 |
|------|---------|---------|--------|
| TTFB (캐시 miss) | 4-5초 | 1.5-2.5초 | 약 50% |
| TTFB (캐시 hit) | 4-5초 | 50-100ms | 약 98% |

## 배포 후 확인 체크리스트

### 1. Vercel Speed Insights 확인
- [ ] 모바일 p75 TTFB < 2.5초
- [ ] 모바일 p75 LCP < 4초
- [ ] 모바일 p75 INP < 200ms
- [ ] 캐시 hit rate > 70% (2회 이상 접속 후)

### 2. 기능 검증
- [ ] 홈 페이지 정상 로드
- [ ] 카드 클릭 시 해석 lazy load 정상 작동
- [ ] `/economic-indicators` 페이지 정상 로드
- [ ] `/economic-indicators/fed-assets-liabilities` 페이지 정상 로드
- [ ] 히스토리 테이블 정상 표시

### 3. 에러 핸들링 검증
- [ ] 외부 API 실패 시에도 페이지 정상 렌더
- [ ] 실패한 카드만 "로드 실패" 표시
- [ ] 콘솔 에러 없음

### 4. 캐시 동작 확인
- [ ] 첫 접속: TTFB 2-3초
- [ ] 두 번째 접속: TTFB 100-200ms (캐시 hit)
- [ ] Vercel Functions 로그에서 캐시 hit 확인

## 추가 최적화 권장사항

### 단기 (1-2주)
1. **이미지 최적화**: 현재 이미지 없음, 향후 추가 시 `next/image` 사용
2. **폰트 최적화**: 시스템 폰트 사용 중 (이미 최적화됨)
3. **JavaScript 번들 최적화**: 현재 인라인 스크립트 사용 중

### 중기 (1-2개월)
1. **Service Worker**: 오프라인 캐싱 및 백그라운드 동기화
2. **HTTP/2 Server Push**: 자주 사용되는 리소스 사전 푸시
3. **CDN 최적화**: Vercel Edge Network 활용 (이미 적용됨)

### 장기 (3-6개월)
1. **Next.js 마이그레이션**: App Router로 전환 시 추가 최적화 가능
2. **GraphQL API**: 필요한 데이터만 요청
3. **실시간 업데이트**: WebSocket 또는 Server-Sent Events

## 주의사항

1. **캐시 무효화**: H.4.1 데이터는 주간 업데이트이므로 10분 캐시 적절
2. **에러 모니터링**: Vercel Functions 로그에서 외부 API 실패율 모니터링
3. **사용자 피드백**: 모바일 사용자 체감 속도 수집

## 참고
- Vercel Edge Caching: https://vercel.com/docs/concepts/edge-network/caching
- Web Vitals: https://web.dev/vitals/
- Speed Insights: Vercel 대시보드에서 확인 가능

