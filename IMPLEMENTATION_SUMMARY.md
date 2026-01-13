# FED Dashboard 구현 완료 요약

## 구현된 기능

### ✅ 1. 메인 페이지 헤더 버튼 추가
- `src/index.ts`와 `api/index.ts`의 헤더에 "FED Dashboard" 버튼 추가
- `/fed-dashboard` 경로로 이동하는 링크

### ✅ 2. Next.js App Router 구조
- `app/` 디렉토리 생성
- `app/layout.tsx`: 루트 레이아웃
- `app/fed-dashboard/page.tsx`: 메인 대시보드 페이지
- `app/globals.css`: 전역 스타일 (Tailwind CSS)
- `next.config.js`, `tailwind.config.js`, `postcss.config.js`: 설정 파일

### ✅ 3. API 라우트 핸들러
- `app/api/h41/dates/route.ts`: 발표일 목록 및 PDF URL 매핑
- `app/api/h41/report/route.ts`: 특정 날짜 리포트 파싱
- `app/api/h41/compare/route.ts`: 두 날짜 비교

### ✅ 4. PDF 파싱 로직
- `lib/pdf-parser.ts`: PDF 파싱 구현
- `pdf-parse` 라이브러리 사용
- 다음 테이블 파싱 지원:
  - Table 1: Factors Affecting Reserve Balances
  - Table 2: Maturity Distribution
  - Table 5: Consolidated Statement
  - Table 6: Each Federal Reserve Bank
  - Table 7: Collateral

### ✅ 5. 프론트엔드 컴포넌트
- `components/DateSelector.tsx`: 날짜 선택 컴포넌트
- `components/SettingsPanel.tsx`: 설정 패널 (테마, 글자 크기, 서체)
- `components/Tabs.tsx`: 탭 네비게이션 및 콘텐츠
- `components/TrendTab.tsx`: 추이 탭 (두 날짜 비교)
- `components/DebugPanel.tsx`: 디버그 패널

### ✅ 6. 설정 기능
- 테마: 다크/라이트 (나이트/라이트로 표기)
- 글자 크기: 작게/보통/크게
- 본문 서체: IBM Plex Sans KR, Noto Sans KR, Inter
- localStorage에 저장되어 새로고침 후에도 유지

### ✅ 7. 안정화 작업
- 행별 try-catch로 개별 행 오류 처리
- API 응답 검증 강화
- 빈 상태/오류 상태 UI 표시
- 캐시 정책 명확히 분리
- Delta 계산 로직 일관성 유지
- 디버그 UI (`?debugUI=1`)

## 파일 구조

```
h41-dashboard/
├── app/
│   ├── api/
│   │   └── h41/
│   │       ├── dates/
│   │       │   └── route.ts
│   │       ├── report/
│   │       │   └── route.ts
│   │       └── compare/
│   │           └── route.ts
│   ├── fed-dashboard/
│   │   └── page.tsx
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── DateSelector.tsx
│   ├── SettingsPanel.tsx
│   ├── Tabs.tsx
│   ├── TrendTab.tsx
│   └── DebugPanel.tsx
├── lib/
│   └── pdf-parser.ts
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── package.json (업데이트됨)
```

## 실행 방법

### 개발 환경

1. 의존성 설치:
```bash
npm install
```

2. Next.js 개발 서버 실행:
```bash
npm run dev:nextjs
```

3. 브라우저에서 접속:
```
http://localhost:3000/fed-dashboard
```

### 프로덕션 빌드

1. Next.js 빌드:
```bash
npm run build:nextjs
```

2. 프로덕션 서버 실행:
```bash
npm run start:nextjs
```

## 주요 기능 사용법

### 날짜 선택
1. 상단의 날짜 선택기에서 발표일 선택
2. 자동으로 해당 날짜의 PDF를 다운로드하고 파싱
3. 결과를 탭별로 표시

### 추이 탭 (두 날짜 비교)
1. "추이" 탭 선택
2. "From"과 "To" 날짜 선택
3. "비교" 버튼 클릭
4. Δ(변화량), %(변화율), 방향(↑↓→) 표시

### 설정
1. 우측 상단 "설정" 버튼 클릭
2. 테마, 글자 크기, 서체 선택
3. 설정은 자동으로 localStorage에 저장

### 디버그 모드
- URL에 `?debugUI=1` 추가하여 디버그 패널 활성화
- API 호출에 `?debug=1` 추가하여 상세 메타데이터 확인

## 주의사항

1. **PDF 파싱**: 현재 구현은 기본 구조입니다. 실제 PDF 구조에 맞게 정교하게 조정이 필요할 수 있습니다.

2. **캐싱**: 개발 환경에서는 캐시가 문제가 될 수 있으므로, 필요시 캐시를 비활성화하거나 수동으로 무효화하세요.

3. **에러 처리**: PDF 다운로드 실패 시 fallback 로직이 있지만, 모든 경우를 커버하지 못할 수 있습니다.

4. **성능**: 대용량 PDF 파싱은 시간이 걸릴 수 있으므로, 적절한 타임아웃과 로딩 상태 표시가 필요합니다.

## 향후 개선 사항

1. PDF 파싱 로직 정교화 (정규표현식 개선, 테이블 구조 분석 강화)
2. 더 많은 테이블 파싱 지원
3. 차트/그래프 시각화 추가
4. 데이터 내보내기 기능 (CSV, JSON)
5. 알림 기능 (새 리포트 발표 시)
6. 검색 기능
7. 즐겨찾기 날짜 저장

## 문제 해결

### PDF를 찾을 수 없음
- 해당 날짜의 PDF가 실제로 존재하는지 확인
- FED 웹사이트에서 직접 확인: `https://www.federalreserve.gov/releases/h41/YYYYMMDD/`

### 파싱 오류
- `?debug=1` 파라미터를 추가하여 상세 오류 정보 확인
- `?debugUI=1` 파라미터로 프론트엔드 디버그 패널 활성화

### 캐시 문제
- 브라우저 캐시 삭제
- 서버 측 캐시는 `revalidate` 값을 조정하여 해결

### 타입 오류
- `npm run typecheck` 실행하여 타입 오류 확인
- `tsconfig.json`의 경로 설정 확인

## 배포

Vercel에서는 Next.js가 자동으로 인식되므로, `app/` 디렉토리가 있으면 자동으로 Next.js 앱으로 배포됩니다.

기존 Express 서버와 함께 사용하려면 `vercel.json`에서 라우팅을 설정해야 합니다 (자세한 내용은 `FED_DASHBOARD_README.md` 참조).
