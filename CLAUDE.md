# 한끼 (hankki) 작업 규칙

## 배포 제한 (필수)

- 배포는 **GitHub Pages만** 사용한다(`.github/workflows/deploy-pages.yml`, 공식 Pages Actions). Vercel·Cloudflare 등 다른 호스팅은 쓰지 않는다.
- GitHub Pages의 정적 파일만 사용한다. 서버, 서버 API, 데이터베이스, 유료 서비스 금지.
- 모든 계산, 이미지 분석, 데이터 저장은 사용자의 브라우저 안에서 처리한다(localStorage, Canvas).
- 사용자 근무표 사진과 간편식 데이터는 GitHub을 포함한 어떤 서버로도 업로드하지 않는다.
- 공개 주소는 https://rlasksk030.github.io/hankki/ 이다. 배포 빌드 base는 `/hankki/`(로컬 개발은 `/`), manifest `start_url`/`scope`는 `./`, 아이콘은 상대 경로를 유지한다. 루트 `/`를 하드코딩하지 않는다.
- 원본 오늘근무 스크린샷은 `tests/fixtures/private/`(gitignore)에만 두고 절대 커밋하지 않는다. 공개 fixture는 `scripts/deidentify-fixtures.mjs`로 만든 비식별 이미지만 쓴다.
- 앞으로 어떤 기능이든 서버나 유료 서비스가 필요해지면 **자동으로 추가하지 말고 먼저 사용자에게 알린다.**
- `tests/static-only.test.ts`와 `e2e/pages.spec.ts`가 이 규칙을 검사한다. 규칙을 우회하도록 테스트를 고치지 않는다.

## 제품 범위

- 로그인·계정 없음. 여러 사람이 같은 공개 URL을 쓰지만 데이터는 브라우저마다 독립적이다.
- 근무표·근무 날짜·간편식 수령 기록·스크린샷을 서버로 저장하거나 전송하지 않는다.
- 설치(홈 화면 추가)는 선택 사항이며, Safari에서 바로 모든 기능을 쓸 수 있어야 한다.
- 계산식: 간편식 = 30 − (A+B+C 출근일), 정산기간 = 기준월 21일 ~ 다음 달 20일.
- 저장 구조 v2: 근무표는 월별(`months`)로 한 번만, 정산(`settlements`)은 수령 기록만 저장하고 근무일·간편식은 매번 계산한다(`src/lib/schedule.ts`). 데이터가 모자란 정산은 계산값을 만들지 않는다.

## 확인 명령

```bash
npm run typecheck && npm test && npm run test:e2e
```

`tests/analyzer.test.ts`의 실제 스크린샷 판독(A6 B11 C6, 근무 23, 간편식 7)은 항상 통과해야 한다.
