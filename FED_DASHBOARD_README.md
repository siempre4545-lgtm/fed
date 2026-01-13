# FED Dashboard 구현 가이드

## 개요

이 문서는 Next.js App Router 기반의 FED H.4.1 상세 대시보드 구현에 대한 설명입니다.

## 구현된 기능

### 1. 메인 페이지 헤더 버튼 추가
- 우측 상단에 "FED Dashboard" 버튼이 추가되었습니다.
- `/fed-dashboard` 경로로 이동합니다.

### 2. Next.js App Router 구조
- `app/` 디렉토리에 Next.js App Router 구조가 생성되었습니다.
- `app/fed-dashboard/page.tsx`: 메인 대시보드 페이지
- `app/api/h41/`: API 라우트 핸들러

### 3. API 엔드포인트

#### `/api/h41/dates`
- FED H.4.1 발표일 목록과 PDF URL 매핑을 반환합니다.
- 6-24시간 캐시 적용
- `?debug=1` 파라미터로 디버그 정보 포함

#### `/api/h41/report?date=YYYY-MM-DD`
- 특정 날짜의 H.4.1 PDF를 다운로드하고 파싱합니다.
- 날짜별 캐시 적용 (최소 6시간)
- `?debug=1` 파라미터로 파싱 메타데이터 포함

#### `/api/h41/compare?from=YYYY-MM-DD&to=YYYY-MM-DD`
- 두 날짜의 리포트를 비교합니다.
- Δ(변화량), %(변화율), 방향(↑↓→) 계산
- `?debug=1` 파라미터로 비교 메타데이터 포함

### 4. PDF 파싱
- `lib/pdf-parser.ts`: PDF 파싱 로직
- `pdf-parse` 라이브러리 사용
- 다음 테이블 파싱 지원:
  - Table 1: Factors Affecting Reserve Balances
  - Table 2: Maturity Distribution
  - Table 5: Consolidated Statement
  - Table 6: Each Federal Reserve Bank
  - Table 7: Collateral

### 5. 프론트엔드 UI

#### 탭 구성
- 개요
- 준비금요인
- 요인요약
- 만기분포
- 대출·증권
- 재무제표
- 지역연준
- 연방준비권
- 추이 (두 날짜 비교)

#### 설정 패널
- 테마: 다크/라이트 (나이트/라이트로 표기)
- 글자 크기: 작게/보통/크게
- 본문 서체: IBM Plex Sans KR, Noto Sans KR, Inter
- 설정은 localStorage에 저장되어 새로고침 후에도 유지됩니다.

#### 디버그 UI
- `?debugUI=1` 쿼리 파라미터로 활성화
- Fetch URL, Response 상태, 데이터 요약, DOM 정보 등 표시

### 6. 안정화 작업

#### 테이블/리스트 렌더링 안정성
- 행별 try-catch로 개별 행 오류가 전체 렌더링을 중단하지 않도록 처리
- 안전한 날짜/숫자 포맷팅 함수 사용
- API 응답 검증 강화 (data.ok, rows 배열 여부 체크)
- 빈 상태/오류 상태 UI 표시

#### Fetch 캐시/최신성 제어
- 동적 데이터 fetch 시 `cache: 'no-store'` 및 no-cache 헤더 처리
- 서버 라우트에서 캐시 정책 명확히 분리
- 날짜별 캐시 + 수동 무효화 가능

#### Delta 계산 로직
- 동일 지표 키 기준으로 absolute delta(Δ) + percent delta(%) 계산
- 수치 파싱 실패/NaN 발생 시 해당 지표만 N/A 처리

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

#### Express 서버 (기존)
```bash
npm run dev
```

#### Next.js 서버 (FED Dashboard)
```bash
npm run dev:nextjs
```

### 3. 빌드

#### Express 서버
```bash
npm run build
```

#### Next.js 서버
```bash
npm run build:nextjs
```

## 환경 변수

현재는 환경 변수가 필요하지 않습니다. 필요시 `.env.local` 파일에 추가할 수 있습니다.

## 배포

### Vercel 배포

Vercel은 Next.js를 자동으로 인식하므로, `app/` 디렉토리가 있으면 자동으로 Next.js 앱으로 배포됩니다.

기존 Express 서버와 함께 사용하려면 `vercel.json`에서 라우팅을 설정해야 합니다:

```json
{
  "rewrites": [
    {
      "source": "/fed-dashboard/:path*",
      "destination": "/fed-dashboard/:path*"
    },
    {
      "source": "/api/h41/:path*",
      "destination": "/api/h41/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ]
}
```

## 주의사항

1. **PDF 파싱**: 현재 PDF 파싱 로직은 기본 구현입니다. 실제 PDF 구조에 맞게 정교하게 조정이 필요할 수 있습니다.

2. **캐싱**: 개발 환경에서는 캐시가 문제가 될 수 있으므로, 필요시 캐시를 비활성화하거나 수동으로 무효화하세요.

3. **에러 처리**: PDF 다운로드 실패 시 fallback 로직이 있지만, 모든 경우를 커버하지 못할 수 있습니다.

4. **성능**: 대용량 PDF 파싱은 시간이 걸릴 수 있으므로, 적절한 타임아웃과 로딩 상태 표시가 필요합니다.

## 향후 개선 사항

1. PDF 파싱 로직 정교화
2. 더 많은 테이블 파싱 지원
3. 차트/그래프 시각화
4. 데이터 내보내기 기능
5. 알림 기능

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
