# FED H.4.1 유동성 대시보드

FED 대차대조표(H.4.1)를 기반으로 거시 유동성 환경을 분석하고 자산군 대응 방향을 제시하는 대시보드입니다.

## 기능

- **실시간 H.4.1 데이터 파싱**: FED 공식 페이지에서 자동으로 데이터 수집
- **경고 레벨 시스템**: LEVEL 0~3 (안정/주의/경계/위험)
- **자산군 가이드**: 각 레벨에 맞는 투자 자산군 추천
- **청팀/백팀 시그널**: 성장 자산 vs 방어 자산 포트폴리오 가이드
- **주간 요약 리포트**: 자동 생성되는 거시경제 분석 리포트
- **모바일 최적화**: 반응형 디자인으로 모바일에서도 완벽하게 작동

## Vercel 배포 방법

### 1. GitHub에 프로젝트 푸시

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Vercel에 프로젝트 연결

1. [Vercel](https://vercel.com)에 로그인
2. "Add New Project" 클릭
3. GitHub 저장소 선택
4. 프로젝트 설정:
   - **Framework Preset**: Other
   - **Root Directory**: `h41-dashboard` (또는 프로젝트 루트)
   - **Build Command**: `npm run build` (선택사항)
   - **Output Directory**: (비워두기)
   - **Install Command**: `npm install`

### 3. 환경 변수 (필요한 경우)

현재는 환경 변수가 필요하지 않지만, 향후 추가할 수 있습니다.

### 4. 배포

"Deploy" 버튼을 클릭하면 자동으로 배포가 시작됩니다.

배포가 완료되면 `https://your-project.vercel.app` 형태의 URL이 생성됩니다.

## 로컬 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build

# 프로덕션 실행
npm start
```

## API 엔드포인트

- `GET /` - 대시보드 메인 페이지
- `GET /api/h41` - JSON 형식의 H.4.1 리포트
- `GET /api/h41.txt` - 텍스트 형식의 H.4.1 리포트
- `GET /levels` - 레벨 설명 페이지
- `GET /concepts` - 계정항목 설명 페이지

## 기술 스택

- **TypeScript**: 타입 안전성
- **Express**: 웹 서버
- **Cheerio**: HTML 파싱
- **Vercel**: 서버리스 배포

## 주의사항

- FED H.4.1 데이터는 매주 목요일(미 동부시간 4:30pm)에 업데이트됩니다.
- 이 도구는 거시 환경 해석용 참고 자료이며, 특정 종목 추천이 아닙니다.
- 투자 결정은 본인의 판단에 따라 이루어져야 합니다.

