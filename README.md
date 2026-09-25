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
   (예: 9월 정산이면 9월 화면 1장, 10월 화면 1장. 라이트 모드, 월간 달력 화면 전체가 보이게)
2. 한끼에서 **근무표 등록하기 → 기준월 확인 → 사진 2장 선택 → 근무표 분석하기**를 누릅니다.
   - 1번에 기준월, 2번에 다음 달 화면을 넣습니다. 순서가 바뀌어도 자동으로 바로잡습니다.
   - 사진 보관함 선택과 카메라 촬영 모두 됩니다.
3. 결과(예: 간편식 7회)를 확인하고, 필요하면 **근무표 확인**에서 날짜를 눌러 A/B/C/휴를 고칩니다.
4. **사용 시작** 후 매일 **오늘 간편식 받았어요**를 누르면 됩니다.
   메인 화면 위쪽의 `‹ 9.21 — 10.20 ›`로 이전·다음 정산을 넘겨 볼 수 있습니다(처음에는 오늘이 포함된 정산).
   오늘은 날짜 둘레의 **로즈색 링**(근무·수령 표시에 쓰지 않는 색)으로, 받은 날은 초록색 **✓ 받음** 배지로 표시됩니다. 달력의 날짜를 누르면 다른 날도 수령으로 기록하거나 취소할 수 있습니다.
5. 다음 정산(예: 10.21 ~ 11.20)을 보려면 11월 근무표가 필요합니다. 다음 정산 화면의 **11월 근무표 추가**
   (또는 **설정 → 등록된 근무표**)에서 **사진 한 장**만 추가하면 이미 있는 10월 데이터와 합쳐 정산이 자동으로 만들어집니다.
   데이터가 모자란 기간은 계산값을 임의로 만들지 않고 어떤 달이 필요한지 알려 줍니다.
6. **설정 → 등록된 근무표**에서 등록한 달을 확인하고, 달을 눌러 **다시 등록(교체)**할 수 있습니다.
   기본 목록은 **오늘이 속한 정산의 기준월부터 딱 4개월**만 보여 줍니다(등록돼 있으면 ✓ 등록됨, 아니면 추가).
   등록된 달이 늘어나도 4행을 넘지 않고, 날짜가 지나면 자동으로 다음 4개월로 옮겨 갑니다.
   그 밖의 과거·미래 근무표는 **전체 근무표 보기**에서 연도별·최신순으로 확인·교체할 수 있습니다(데이터는 모두 보관).
   교체하면 그 달을 쓰는 정산이 모두 다시 계산되고, 수령 기록은 지우지 않습니다.
   다시 계산한 총 가능 횟수보다 수령 기록이 많아지면 메인 화면에 경고를 보여 줍니다.
7. 지난 정산은 **기록** 탭에서 볼 수 있습니다.

### 선택한 달과 사진이 같은지 확인 (월 검증)

사진을 넣으면 근무를 읽기 전에 **선택한 연/월이 사진 속 근무표와 같은지** 먼저 확인합니다. 모두 브라우저 안에서 픽셀로만 처리합니다.

1. **1순위 — 상단 제목 `YYYY.MM`**: 제목 줄의 글자 7개(숫자 4 · 점 · 숫자 2)를 연결된 잉크 덩어리로 잘라,
   5×7 칸 잉크 밀도를 실제 오늘근무 제목에서 뽑은 숫자 기준표(`digitTemplates.ts`)와 비교합니다. 범용 OCR이 아니라 제목 한 줄만 읽습니다.
2. **2순위 — 달력 구조**: 시작 요일·주 수·날짜 칸 배치를 선택한 달 앞뒤 12개월과 비교해, 선택한 달이 유일하게 가장 잘 맞는지 봅니다.
3. 제목이 다른 달로 읽히거나 구조상 다른 달이 더 잘 맞으면 **거부**하고 사진 속 제목을 알려 줍니다
   (예: "사진 속 제목은 2026.09로 보여요"). 제목을 못 읽고 구조만으로 확신할 수 없으면
   "선택한 X월과 사진 속 근무표가 다른 달처럼 보여요." 화면에서 **[다시 선택] / [그래도 사용]**을 고르게 하고,
   그래도 사용하면 그 달에 `monthCheck: "user-confirmed"`로 기록합니다.
4. 이미 다른 달로 등록된 사진과 같은 사진(축소본 포함)이면 경고합니다(사진 지문 비교, 사진 자체는 저장하지 않음).

### 메인 화면 구성

스크롤 없이 한 화면에 `정산기간(‹ ›) · 남은 간편식(가장 큰 숫자) · 사용/총 횟수 · 출근일 · 5주 달력 · 오늘 간편식 받았어요 · 하단 탭`이
모두 보이도록 세로 간격을 맞췄습니다. 화면 높이는 `100dvh`와 safe area(`env(safe-area-inset-*)`)를 기준으로 계산하고,
달력의 주(행)들이 남는 높이를 나눠 가집니다(한 주 최대 84px). iPhone SE처럼 아주 작은 화면에서는 달력만 조금 스크롤되고
버튼은 항상 보입니다.

## 데이터 저장과 개인정보

- 모든 기록은 이 기기 브라우저의 localStorage(`hankki:v1:settlements`, `schemaVersion: 2`)에만 저장됩니다.
- 저장 구조(v2)
  - `months`: **월별 근무표** `{ id: "2026-10", year, month, days: [{ date, shift: A|B|C|OFF, source, confidence }] }`.
    같은 10월 근무표를 9.21~10.20과 10.21~11.20 정산에 중복 저장하지 않습니다.
  - `settlements`: **정산기간별 간편식 수령 기록** `{ id: "2026-09", startDate, endDate, mealUses: [...] }`.
    정산마다 독립적이라 한 정산의 수령 기록이 다른 정산에 영향을 주지 않습니다.
  - 근무일·간편식 횟수는 저장하지 않고, 월별 근무표에서 기준월 21일 ~ 다음 달 20일을 모아 매번 계산합니다.
  - 이전 구조(v1) 데이터와 백업 파일은 불러올 때 자동으로 v2로 옮깁니다.
- 근무표 사진은 **기기 안에서 Canvas로만 분석**하고 저장하거나 전송하지 않습니다. 분석이 끝나면 날짜별 A/B/C/휴만 남습니다.
- 근무표·근무 날짜·간편식 수령 기록·사진을 GitHub을 포함한 어떤 서버로도 보내지 않습니다.
  - 앱 코드에 `fetch`/XHR/`sendBeacon`/WebSocket이 없음을 `tests/static-only.test.ts`가 검사합니다.
  - 빌드한 페이지에 CSP(`connect-src 'self'`)를 넣어 외부 서버 연결을 브라우저가 차단합니다.
  - `e2e/app.spec.ts`가 사진 선택·근무 수정·수령·백업 중 네트워크 요청이 같은 주소의 정적 파일 GET뿐인지 확인합니다.

## 백업 / 복원

- **설정 → 데이터 백업**: 월별 근무표(날짜별 A/B/C/OFF)와 정산별 간편식 수령 기록을 JSON 파일로 저장합니다. (사진은 포함하지 않음)
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
| `tests/storage.test.ts` | 저장, v1→v2 이전, 백업/복원 검증, 다중 사용자 데이터 독립(L) |
| `tests/schedule.test.ts` | 월별 근무표 → 정산 자동 생성(9월+10월 → 11월 필요 → 11월·12월 추가), 중복 저장 없음, 정산별 수령 독립, 월 수정 시 관련 정산만 재계산, 초과 경고 |
| `tests/analyzer.test.ts` | 실제 오늘근무 스크린샷 판독 → `tests/expected.ts`(사람이 읽어 적은 정답지)와 30일 모두 일치 |
| `tests/static-only.test.ts` | 서버·외부 전송 코드 없음, GitHub Pages 설정, 원본 사진 gitignore |
| `e2e/app.spec.ts` | 사진 2장 → 7회 → 수령/중복 방지/취소 → 새로고침 유지, 순서 보정, 수정, 오류, 외부 전송 없음, 백업→복원, 오프라인 |
| `e2e/pages.spec.ts` | `/hankki/` 하위 경로에서 CSS·아이콘·manifest·서비스 워커 범위·404 복귀 |
| `e2e/devices.spec.ts` | 브라우저 재실행 후 유지, 잘못된 백업 거부, 다크 모드, iPhone SE, 데스크톱, '✓ 받음' 배지, 오늘 표시(로즈 링) |
| `e2e/month-check.spec.ts` | 9월 사진을 12월로·11월 사진을 2027년 2월로 선택 시 거부, 같은 사진 두 장 거부, 확신 없을 때 [다시 선택]/[그래도 사용] |
| `e2e/layout.spec.ts` | 메인 화면 한 화면 구성: iPhone 15 Pro Max(Safari·홈 화면 앱·다크)·15·14는 세로 스크롤 0px, SE는 최소 스크롤, 터치 영역 44px 이상 |
| `e2e/periods.spec.ts` | 정산기간 좌우 이동, 11월 근무표 필요 안내 → 한 장 추가로 정산 생성, 정산별 수령 독립, 등록된 근무표·교체·초과 경고 |

실제 공개 주소 검증: `HANKKI_URL=https://rlasksk030.github.io/hankki/ npm run test:live`
(배포 workflow의 `verify-live` 단계가 매 배포마다 자동으로 실행합니다)

`npm run test:e2e`는 `scripts/serve-pages.mjs`로 `http://localhost:4173/hankki/`에 GitHub Pages와 같은 조건
(하위 경로 제공, 없는 주소는 `404.html`을 404 상태로 응답)을 만들어 빌드 결과물을 검증합니다.

### 판독 fixture와 개인정보

- `tests/fixtures/deid-2026-09.png`, `deid-2026-10.png` — 공개용 **비식별** fixture.
  월 검증 테스트용으로 `deid-2026-11.png` ~ `deid-2027-05.png`, `deid-2027-08.png`(실제 화면, 같은 방법으로 비식별)도 있습니다.
  원본 스크린샷에서 상단 상태 표시줄(시각·배터리)과 날짜 칸의 라벨(회사 연휴명, 음력 날짜, 공휴일명)을 지운 것입니다
  (`scripts/deidentify-fixtures.mjs`). 판독에 쓰는 격자·날짜 숫자·A/B/C 원·'휴'는 원본 그대로입니다.
- `tests/fixtures/private/` — 원본 스크린샷 자리. **gitignore되어 저장소에 올라가지 않으며**, 파일이 있으면
  같은 판독 테스트가 원본으로도 한 번 더 실행됩니다(없으면 건너뜀).
- 기대 결과(2026-09-21 ~ 2026-10-20): **A 6 · B 11 · C 6, 출근 23일, 간편식 7회.** 이 값이 달라지면 회귀입니다.
  두 장 모두 월 전체(9월 30일, 10월 31일)를 읽으며, 전체 날짜 정답은 `tests/expected.ts`의 `EXPECTED_MONTHS`입니다.
- `tests/fixtures/synthetic-2026-11.png`, `synthetic-2026-12.png` — **합성** fixture(한 장 추가 흐름 테스트용).
  실제 11·12월 스크린샷이 없어서, 실제 10월 화면의 칸 조각(원·'휴'·날짜 숫자)과 제목 글자 조각("2026.11")을 옮겨 붙여 만들었습니다
  (`scripts/make-synthetic-months.mjs`, 근무 패턴은 `tests/fixtures/synthetic-months.json`).
  기대 결과: 10.21~11.20 간편식 8회, 11.21~12.20 간편식 6회.
  `synthetic-2026-10-notitle.png`는 10월 화면에서 제목만 지운 것으로, 제목을 못 읽을 때의 월 검증 테스트에 씁니다.

## GitHub Pages 배포 구조

`main` 브랜치에 push하면 `.github/workflows/deploy-pages.yml`(GitHub 공식 Pages Actions)이 실행됩니다.

```
[build]       checkout → setup-node(.nvmrc) → npm ci → typecheck → npm test → Playwright E2E(로컬 /hankki/)
              → configure-pages → npm run build → upload-pages-artifact(dist)
[deploy]      deploy-pages
[verify-live] 새 버전이 공개 주소에 반영될 때까지 대기 → 실제 공개 주소에서 같은 Playwright E2E 실행
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
│  ├─ lib/settlement.ts                 # 계산 규칙·정산 화면용 모델
│  ├─ lib/schedule.ts                   # 월별 근무표 → 정산기간 자동 생성, 정산별 수령 기록
│  ├─ lib/storage.ts                    # localStorage, 백업/복원 검증
│  ├─ lib/dates.ts                      # 정산기간, 달력 행/열
│  └─ lib/analyzer/                     # 스크린샷 판독
├─ tests/  e2e/
```

## 알려진 제한

- 오늘근무 **라이트 모드 iPhone 세로 스크린샷** 기준입니다. 다크 모드 화면은 인식하지 않고 안내 문구를 보여 줍니다.
- 실제 스크린샷 검증 범위는 2026년 9월 ~ 2027년 5월, 2027년 8월입니다(5주 · 6주 달력). 4주 달력은 실제 사진으로 확인하지 못했습니다.
- 제목을 읽지 못한 사진에서 선택한 달과 달력 배치가 똑같은 달이 가까이 있으면 자동 통과하지 않고 **[다시 선택] / [그래도 사용]**으로 확인합니다.
- 기록은 브라우저에만 있으므로 Safari 데이터 삭제 시 사라집니다. iOS는 오래 방문하지 않은 사이트의 데이터를 지울 수 있으니
  주기적으로 백업하세요. (홈 화면에 추가하면 영향이 적습니다)
- 오늘근무 공유 링크(`https://todayshift.com/share/…`)로 가져오기는 지원하지 않습니다. GitHub Pages 출처에서 실제로
  확인한 결과 공유 페이지 응답에 CORS 허용 헤더(`Access-Control-Allow-Origin`)가 없어 브라우저가 내용을 읽을 수 없고,
  `X-Frame-Options: SAMEORIGIN`이라 iframe으로도 불가능합니다. 서버·프록시를 두지 않는 원칙에 따라 구현하지 않았습니다.
- 오늘근무 화면이 바뀌면 판독 기준을 다시 맞춰야 합니다. 그래도 **근무표 확인**에서 직접 수정할 수 있습니다.

### 오늘근무 UI가 바뀌었을 때 고칠 파일

| 바뀐 것 | 파일 |
| --- | --- |
| 원 색상(A 노랑·B 파랑·C 차콜) | `src/lib/analyzer/pixels.ts` (`classifyPixel`) |
| 원 크기·위치, 판정 임계값, 확신도 | `src/lib/analyzer/analyze.ts` (`CIRCLE_*`, `*_THRESHOLD`) |
| 상단 제목(`2026.09`) 위치·글꼴 | `src/lib/analyzer/title.ts`, 기준표 재생성: `tests/gen-digit-templates.test.ts` |
| 달력 영역·격자선 | `src/lib/analyzer/grid.ts` |

새 스크린샷을 `tests/fixtures/private/`에 넣고 `node scripts/deidentify-fixtures.mjs`로 비식별 fixture를 만든 뒤,
`tests/expected.ts`와 `tests/analyzer.test.ts`에 케이스를 추가해서 조정하세요.
