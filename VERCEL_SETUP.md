# Vercel 프로젝트 수동 연결 및 설정 가이드

## 현재 상황
- GitHub 저장소: `siempre4545-lgtm/fed`
- Vercel 프로젝트: `fed_report_sh`
- 문제: "No Production Deployment"

## 해결 방법

### 방법 1: Vercel Dashboard에서 Root Directory 설정 (권장)

1. **Vercel Dashboard 접속**
   - https://vercel.com/dashboard
   - `fed_report_sh` 프로젝트 선택

2. **Settings → General 이동**

3. **Root Directory 설정**
   - "Root Directory" 섹션 찾기
   - `h41-dashboard` 입력
   - "Save" 클릭

4. **프로젝트 설정 확인**
   - **Framework Preset**: Other
   - **Build Command**: (비워두기)
   - **Output Directory**: (비워두기)
   - **Install Command**: `npm install`
   - **Node.js Version**: 18.x 또는 20.x

5. **재배포**
   - "Deployments" 탭으로 이동
   - 최신 배포 선택 → "Redeploy" 클릭
   - 또는 GitHub에 새 커밋 푸시 (자동 재배포)

### 방법 2: 프로젝트 파일을 루트로 이동 (대안)

만약 Root Directory 설정이 작동하지 않는다면:

1. GitHub 저장소의 루트에 파일들을 이동
2. Vercel에서 Root Directory를 `.` (루트)로 설정

## 배포 확인

배포가 성공하면:
- "Deployments" 탭에서 "Ready" 상태 확인
- `https://fedreportsh.vercel.app` 접속 시 대시보드가 표시됨

## 문제 해결

### 배포 실패 시
1. "Deployments" → 최신 배포 → "Functions" 탭에서 에러 로그 확인
2. 일반적인 문제:
   - TypeScript 컴파일 에러
   - 의존성 설치 실패
   - 파일 경로 문제

### 로그 확인 방법
- Vercel Dashboard → 프로젝트 → Deployments → 최신 배포
- "Functions" 탭에서 `api/index.ts` 로그 확인
- "Build Logs" 탭에서 빌드 과정 확인

