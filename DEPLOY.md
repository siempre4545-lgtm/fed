# Vercel 배포 가이드

## 현재 상태 확인

현재 프로젝트는 다음과 같이 구성되어 있습니다:
- `api/index.ts` - Vercel serverless function (Express 앱)
- `vercel.json` - Vercel 설정 파일
- `src/` - 소스 코드

## 배포 방법

### 1. GitHub에 푸시

```bash
cd h41-dashboard
git add .
git commit -m "Fix Vercel deployment"
git push
```

### 2. Vercel에서 재배포

1. [Vercel Dashboard](https://vercel.com/dashboard)에 접속
2. 프로젝트 선택 (`fedreportsh`)
3. "Settings" → "General"에서 확인:
   - **Root Directory**: `h41-dashboard` (또는 프로젝트가 루트에 있다면 `.`)
   - **Framework Preset**: Other
   - **Build Command**: (비워두기)
   - **Output Directory**: (비워두기)
   - **Install Command**: `npm install`

4. "Deployments" 탭에서 최신 배포를 선택하고 "Redeploy" 클릭

### 3. 문제 해결

만약 여전히 404 에러가 발생한다면:

1. **Vercel 로그 확인**:
   - Vercel Dashboard → 프로젝트 → "Deployments" → 최신 배포 → "Functions" 탭
   - 에러 메시지 확인

2. **로컬에서 테스트**:
   ```bash
   npm install -g vercel
   vercel dev
   ```

3. **파일 구조 확인**:
   - `api/index.ts` 파일이 존재하는지 확인
   - `vercel.json` 파일이 루트에 있는지 확인

## 대안: 프로젝트 루트를 Vercel 루트로 설정

만약 프로젝트가 `h41-dashboard` 폴더 안에 있다면, Vercel 설정에서:
- **Root Directory**: `h41-dashboard`

또는 프로젝트 파일들을 루트로 이동:
```bash
# h41-dashboard 폴더의 내용을 상위로 이동
cd h41-dashboard
mv * ..
mv .* .. 2>/dev/null || true
cd ..
```

