# 한끼 — 3교대 간편식 횟수 계산기

**공개 주소: https://rlasksk030.github.io/hankki/**

오늘근무 앱의 월간 달력 스크린샷 2장을 넣으면 정산기간의 출근일(A·B·C)을 자동으로 세고,
받을 수 있는 간편식 횟수를 계산해 주는 iPhone 우선 웹앱입니다.
받은 날을 기록하면 남은 횟수를 바로 보여 줍니다.

- 로그인·회원가입 없음. 주소를 열면 Safari에서 바로 사용합니다. (홈 화면 추가는 선택)
- 여러 사람이 같은 주소를 써도 **각자의 기록은 각자의 기기 브라우저에만** 저장되어 서로 보이거나 섞이지 않습니다.
- 서버, 서버 API, 데이터베이스, 유료 서비스가 없습니다. GitHub Pages의 정적 파일만으로 동작합니다.

## 계산 규칙

| 항목 | 규칙 |
| --- | --- |
| 정산기간 | 기준월 21일 ~ 다음 달 20일 (예: 2026년 9월 정산 = 9.21 ~ 10.20) |
| 출근일 | A + B + C 날짜 수 (A/B/C 구분 없이 모두 1일), 휴 = 비근무 |
| 간편식 총 가능 횟수 | **30 − 출근일** (31일·28일이 포함돼도 항상 30 기준, 0 미만 불가) |
| 남은 횟수 | 총 가능 횟수 − 수령 횟수 (0 미만 불가, 같은 날짜 중복 기록 불가) |

## 사용 방법

1. 오늘근무 앱에서 **기준월**과 **다음 달** 월간 화면을 각각 캡처합니다.
   (예: 9월 정산이면 9월 화면 1장, 10월 화면 1장. 라이트 모드, 달력 전체가 보이게)
2. 한끼에서 **근무표 등록하기 → 기준월 확인 → 사진 2장 선택 → 근무표 분석하기**를 누릅니다.
   - 1번에 기준월, 2번에 다음 달 화면을 넣습니다. 순서가 바뀌어도 자동으로 바로잡습니다.
   - 사진 보관함 선택과 카메라 촬영 모두 됩니다.
3. 결과(예: 간편식 7회)를 확인하고, 필요하면 **근무표 확인**에서 날짜를 눌러 A/B/C/휴를 고칩니다.
4. **사용 시작** 후 매일 **오늘 간편식 받았어요**를 누르면 됩니다.
   달력의 날짜를 누르면 다른 날도 수령으로 기록하거나 취소할 수 있습니다.
5. 지난 정산은 **기록** 탭에서 볼 수 있습니다.

## 데이터 저장과 개인정보

- 모든 기록은 이 기기 브라우저의 localStorage(`hankki:v1:settlements`, `schemaVersion: 1`)에만 저장됩니다.
- 근무표 사진은 **기기 안에서 Canvas로만 분석**하고 저장하거나 전송하지 않습니다. 분석이 끝나면 날짜별 A/B/C/휴만 남습니다.
- 근무표·근무 날짜·간편식 수령 기록·사진을 GitHub을 포함한 어떤 서버로도 보내지 않습니다.
  - 앱 코드에 `fetch`/XHR/`sendBeacon`/WebSocket이 없음을 `tests/static-only.test.ts`가 검사합니다.
  - 빌드한 페이지에 CSP(`connect-src 'self'`)를 넣어 외부 서버 연결을 브라우저가 차단합니다.
  - `e2e/app.spec.ts`가 사진 선택·근무 수정·수령·백업 중 네트워크 요청이 같은 주소의 정적 파일 GET뿐인지 확인합니다.

## 백업 / 복원

- **설정 → 데이터 백업**: 정산 기록, 날짜별 A/B/C/OFF, 간편식 수령 기록을 JSON 파일로 저장합니다. (사진은 포함하지 않음)
- **설정 → 데이터 복원**, 또는 데이터가 없는 새 기기라면 **첫 화면의 "백업 파일로 복원"**.
- 복원할 때 한끼 백업인지(`app: "hankki"`), `schemaVersion`, 필수 필드, 날짜 형식, 근무 값(A/B/C/OFF), 수령 기록 구조를 검사해서
  잘못된 JSON·다른 앱의 파일·손상된 파일·다른 버전 파일은 거부합니다. 근무일·간편식 횟수는 파일 값을 믿지 않고 다시 계산합니다.
- Safari 방문 기록·웹사이트 데이터를 지우거나 휴대폰을 바꾸기 전에 백업해 두세요.

## 로컬 실행

```bash
npm ci
npm run dev          # http://localhost:5173/
npm run build        # 배포용 빌드 → dist/ (/hankki/ 하위 경로 기준)
```

Node 22 (`.nvmrc`)를 사용합니다.

## 테스트

```bash
npm run typecheck
npm test             # 단위 테스트 + 스크린샷 판독 회귀 테스트 (Vitest)
npm run test:e2e     # 실제 브라우저(Chromium) E2E, GitHub Pages 하위 경로 조건 (Playwright)
```

| 파일 | 내용 |
| --- | --- |
| `tests/settlement.test.ts` | 계산 규칙 A~K |
| `tests/storage.test.ts` | 저장, 백업/복원 검증, 다중 사용자 데이터 독립(L) |
| `tests/analyzer.test.ts` | 실제 오늘근무 스크린샷 판독 → `tests/expected.ts`(사람이 읽어 적은 정답지)와 30일 모두 일치 |
| `tests/static-only.test.ts` | 서버·외부 전송 코드 없음, GitHub Pages 설정, 원본 사진 gitignore |
| `e2e/app.spec.ts` | 사진 2장 → 7회 → 수령/중복 방지/취소 → 새로고침 유지, 순서 보정, 수정, 오류, 외부 전송 없음, 백업→복원, 오프라인 |
| `e2e/pages.spec.ts` | `/hankki/` 하위 경로에서 CSS·아이콘·manifest·서비스 워커 범위·404 복귀 |
| `e2e/devices.spec.ts` | 브라우저 재실행 후 유지, 잘못된 백업 거부, 다크 모드, iPhone SE, 데스크톱 |

`npm run test:e2e`는 `scripts/serve-pages.mjs`로 `http://localhost:4173/hankki/`에 GitHub Pages와 같은 조건
(하위 경로 제공, 없는 주소는 `404.html`을 404 상태로 응답)을 만들어 빌드 결과물을 검증합니다.

### 판독 fixture와 개인정보

- `tests/fixtures/deid-2026-09.png`, `deid-2026-10.png` — 공개용 **비식별** fixture.
  원본 스크린샷에서 상단 상태 표시줄(시각·배터리)과 날짜 칸의 라벨(회사 연휴명, 음력 날짜, 공휴일명)을 지운 것입니다
  (`scripts/deidentify-fixtures.mjs`). 판독에 쓰는 격자·날짜 숫자·A/B/C 원·'휴'는 원본 그대로입니다.
- `tests/fixtures/private/` — 원본 스크린샷 자리. **gitignore되어 저장소에 올라가지 않으며**, 파일이 있으면
  같은 판독 테스트가 원본으로도 한 번 더 실행됩니다(없으면 건너뜀).
- 기대 결과(2026-09-21 ~ 2026-10-20): **A 6 · B 11 · C 6, 출근 23일, 간편식 7회.** 이 값이 달라지면 회귀입니다.

## GitHub Pages 배포 구조

`main` 브랜치에 push하면 `.github/workflows/deploy-pages.yml`(GitHub 공식 Pages Actions)이 실행됩니다.

```
checkout → setup-node(.nvmrc) → npm ci → typecheck → npm test → Playwright E2E
→ configure-pages → npm run build → upload-pages-artifact(dist) → deploy-pages
```

- 권한: `contents: read`, `pages: write`, `id-token: write`, `concurrency: pages`
- 테스트가 하나라도 실패하면 배포하지 않습니다. E2E는 Actions의 Ubuntu + Chromium에서 실행합니다.
- **최초 1회 설정**: 저장소 **Settings → Pages → Build and deployment → Source → GitHub Actions**

| 항목 | 처리 |
| --- | --- |
| Vite base | 배포 빌드 `/hankki/`, 로컬 개발 `/` (`vite.config.ts`, 필요 시 `BASE_PATH`로 변경) |
| JS/CSS | `/hankki/assets/…` |
| manifest | `start_url`·`scope` = `./` → `/hankki/` |
| favicon·PWA 아이콘 | 상대 경로 `icons/…` → `/hankki/icons/…` |
| 서비스 워커 | `/hankki/sw.js`, 범위 `/hankki/`. 빌드 시 앱 셸 목록을 만들어 미리 캐시 → 오프라인 동작 |
| 라우팅·새로고침 | 주소 라우터 없이 화면 상태로 전환하는 단일 페이지라 새로고침해도 `/hankki/` 그대로. 없는 주소는 `404.html`이 `/hankki/`로 되돌림 (HashRouter 불필요) |
| 데이터 | localStorage는 같은 origin(`rlasksk030.github.io`)에서 유지 |

## 주요 파일

```
├─ .github/workflows/deploy-pages.yml   # main push → 테스트 → GitHub Pages
├─ index.html                           # iOS 홈 화면·테마 메타 태그
├─ vite.config.ts                       # base 경로, 서비스 워커 생성, CSP 메타 태그
├─ public/                              # manifest, 아이콘, 404.html, .nojekyll
├─ scripts/                             # 아이콘 생성, fixture 비식별화, Pages 흉내 서버
├─ src/
│  ├─ App.tsx                           # 화면 흐름, 탭
│  ├─ styles.css                        # 디자인 토큰(라이트/다크)
│  ├─ lib/settlement.ts                 # 계산 규칙·데이터 모델
│  ├─ lib/storage.ts                    # localStorage, 백업/복원 검증
│  ├─ lib/dates.ts                      # 정산기간, 달력 행/열
│  └─ lib/analyzer/                     # 스크린샷 판독
├─ tests/  e2e/
```

## 알려진 제한

- 오늘근무 **라이트 모드 iPhone 세로 스크린샷** 기준입니다. 다크 모드 화면은 인식하지 않고 안내 문구를 보여 줍니다.
- 실제 스크린샷 검증은 5주 달력(2026년 9·10월)뿐입니다. 4주·6주 달력은 격자 탐지로 처리하지만 실제 사진으로 확인하지 못했습니다.
- 기록은 브라우저에만 있으므로 Safari 데이터 삭제 시 사라집니다. iOS는 오래 방문하지 않은 사이트의 데이터를 지울 수 있으니
  주기적으로 백업하세요. (홈 화면에 추가하면 영향이 적습니다)
- 오늘근무 화면이 바뀌면 판독 기준을 다시 맞춰야 합니다. 그래도 **근무표 확인**에서 직접 수정할 수 있습니다.

### 오늘근무 UI가 바뀌었을 때 고칠 파일

| 바뀐 것 | 파일 |
| --- | --- |
| 원 색상(A 노랑·B 파랑·C 차콜) | `src/lib/analyzer/pixels.ts` (`classifyPixel`) |
| 원 크기·위치, 판정 임계값, 확신도 | `src/lib/analyzer/analyze.ts` (`CIRCLE_*`, `*_THRESHOLD`) |
| 달력 영역·격자선 | `src/lib/analyzer/grid.ts` |

새 스크린샷을 `tests/fixtures/private/`에 넣고 `node scripts/deidentify-fixtures.mjs`로 비식별 fixture를 만든 뒤,
`tests/expected.ts`와 `tests/analyzer.test.ts`에 케이스를 추가해서 조정하세요.
