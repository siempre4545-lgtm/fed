# Vercel 라우팅 수정 완료

## 문제
`https://fedreportsh.vercel.app/fed-dashboard` 접속 시 "Cannot GET /fed-dashboard" 오류 발생

## 원인
- `vercel.json`의 rewrites 설정이 모든 요청을 `/api/index` (Express 서버)로 보내고 있어서 Next.js App Router 라우트가 처리되지 않음
- Next.js와 Express가 혼재된 환경에서 라우팅 우선순위 문제

## 해결 방법

### 1. vercel.json 수정
- Next.js 라우트(`/fed-dashboard`, `/api/h41/dates`, `/api/h41/report`, `/api/h41/compare`)를 rewrites에서 제외
- Express 라우트만 명시적으로 rewrites에 추가
- `framework: "nextjs"` 설정으로 Next.js 자동 감지

### 2. middleware.ts 추가
- Next.js 라우트가 우선 처리되도록 보장
- Express 라우트는 그대로 통과

### 3. 라우팅 우선순위
1. **Next.js App Router** (`app/` 디렉토리)
   - `/fed-dashboard` → `app/fed-dashboard/page.tsx`
   - `/api/h41/dates` → `app/api/h41/dates/route.ts`
   - `/api/h41/report` → `app/api/h41/report/route.ts`
   - `/api/h41/compare` → `app/api/h41/compare/route.ts`

2. **Express 서버** (`api/index.ts`)
   - `/` → 메인 대시보드
   - `/api/h41` → JSON API
   - `/api/h41/summary` → 요약 API
   - `/economic-indicators` → 경제 지표 페이지
   - `/secret-indicators` → 비밀지표 페이지
   - 기타 Express 라우트

## 배포 후 확인 사항

1. **Vercel 대시보드에서 확인**
   - Routes 섹션에서 `/fed-dashboard`가 Next.js 라우트로 표시되는지 확인
   - 빌드 로그에서 Next.js 빌드가 성공했는지 확인

2. **브라우저에서 확인**
   - `https://fedreportsh.vercel.app/fed-dashboard` 접속
   - 페이지가 정상적으로 렌더링되는지 확인
   - F5 새로고침 시에도 정상 작동하는지 확인

3. **API 라우트 확인**
   - `/api/h41/dates` → Next.js 라우트
   - `/api/h41/report` → Next.js 라우트
   - `/api/h41/compare` → Next.js 라우트
   - `/api/h41` → Express 라우트 (기존 API)

## 문제 해결 체크리스트

- [x] `app/fed-dashboard/page.tsx` 존재 확인
- [x] `vercel.json`에서 Next.js 라우트 제외
- [x] `middleware.ts` 추가
- [x] `framework: "nextjs"` 설정
- [x] `buildCommand` 설정
- [ ] 배포 후 실제 동작 확인

## 추가 참고사항

- Vercel은 `app/` 디렉토리가 있으면 자동으로 Next.js로 인식합니다
- Next.js 라우트는 rewrites보다 우선 처리됩니다
- Express 서버는 Next.js가 처리하지 못한 요청만 처리합니다
