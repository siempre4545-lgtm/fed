# H.4.1 Parser Test Fixtures

## Fixture 파일 생성 방법

테스트를 실행하려면 다음 fixture 파일이 필요합니다:

- `h41-20260108.html`: 2026-01-08 날짜의 H.4.1 HTML 페이지

### Fixture 파일 다운로드

```bash
# PowerShell에서 실행
curl -o __tests__/fixtures/h41-20260108.html "https://www.federalreserve.gov/releases/h41/20260108/"
```

또는 브라우저에서 https://www.federalreserve.gov/releases/h41/20260108/ 페이지를 열고 "페이지 저장"으로 HTML 파일을 저장하세요.

### Fixture 파일 위치

- 경로: `__tests__/fixtures/h41-20260108.html`
- 파일이 없으면 테스트는 자동으로 스킵됩니다.
