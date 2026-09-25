import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { BASE, BASE_PATH, ORIGIN } from "./target";

const fixture = (name: string) => fileURLToPath(new URL(`../tests/fixtures/${name}`, import.meta.url));
// 공개 저장소용 비식별 fixture (원본에서 상태 표시줄·칸 라벨만 지운 것)
const SEP = fixture("deid-2026-09.png");
const OCT = fixture("deid-2026-10.png");
// 원본 스크린샷은 개인 정보 보호를 위해 gitignore — 로컬에 있을 때만 추가로 검증한다
const PRIVATE_SEP = fixture("private/oneulgeunmu-2026-09.webp");
const PRIVATE_OCT = fixture("private/oneulgeunmu-2026-10.webp");
const SHOTS = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function open(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
  await page.goto("./");
}

async function registerSchedule(page: Page, files: [string, string] = [SEP, OCT]) {
  await page.getByRole("button", { name: "근무표 등록하기" }).click();
  await expect(page.getByText("어느 정산을 계산할까요?")).toBeVisible();
  await expect(page.getByText("2026년 9월")).toBeVisible();
  await expect(page.getByText("9월 21일 ~ 10월 20일")).toBeVisible();
  await shot(page, "02-month");
  await page.getByRole("button", { name: "계속" }).click();
  // 근무표 등록은 스크린샷 2장 방식 하나 (링크 입력 UI 없음)
  await expect(page.getByRole("heading", { name: "근무표 가져오기" })).toBeVisible();
  await expect(page.getByText("이번 달 근무표", { exact: true })).toBeVisible();
  await expect(page.getByText("다음 달 근무표", { exact: true })).toBeVisible();
  await expect(page.getByText("오늘근무의 월간 달력 화면 전체가 보이도록 캡처하면 가장 정확해요.")).toBeVisible();
  await expect(page.getByText(/링크|todayshift/)).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByLabel("1번째 사진 선택: 2026년 9월").setInputFiles(files[0]);
  await page.getByLabel("2번째 사진 선택: 2026년 10월").setInputFiles(files[1]);
  await shot(page, "03-photos");
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
}

test("스크린샷 2장 → 근무 23일 / 간편식 7회 → 수령 기록 → 새로고침 후 유지", async ({ page }) => {
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await open(page);
  expect(page.url()).toBe(BASE);
  await expect(page.getByText("근무표만 넣으면")).toBeVisible();
  await shot(page, "01-welcome");

  await registerSchedule(page);
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await expect(page.getByText("9.21 — 10.20")).toBeVisible();
  await expect(page.getByTestId("result-workdays")).toHaveText("23일");
  await expect(page.getByLabel("A 6일, B 11일, C 6일")).toBeVisible();
  await expect(page.getByText("확인이 필요한 날짜가 있어요")).toHaveCount(0);
  await shot(page, "04-result");

  await page.getByRole("button", { name: "근무표 확인" }).click();
  await expect(page.getByTestId("editor-allowance")).toHaveText("7회");
  await shot(page, "05-review");
  await page.getByRole("button", { name: "완료" }).click();

  await page.getByRole("button", { name: "사용 시작" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("7");
  await expect(page.getByTestId("usage")).toHaveText("0회 사용 · 총 7회");
  await expect(page.getByText("출근 23일 · 기준 30일")).toBeVisible();
  await page.waitForTimeout(2600);
  await shot(page, "06-home");

  await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("6");
  await expect(page.getByRole("status").getByText("9월 25일")).toBeVisible();
  await expect(page.getByRole("status").getByText("간편식 수령을 기록했어요")).toBeVisible();
  await shot(page, "07-recorded");

  // 같은 날 다시 누르면 중복 등록하지 않는다
  await page.getByRole("button", { name: "오늘 받은 것으로 기록됨" }).click();
  await expect(page.getByText("오늘은 이미 기록되어 있어요.")).toBeVisible();
  await expect(page.getByTestId("remaining")).toHaveText("6");

  // 새로고침해도 유지
  await page.reload();
  await expect(page.getByTestId("remaining")).toHaveText("6");
  await expect(page.getByTestId("usage")).toHaveText("1회 사용 · 총 7회");

  // 과거 날짜 직접 기록
  await page.getByRole("gridcell", { name: /^9월 22일/ }).click();
  await expect(page.getByRole("dialog")).toContainText("근무");
  await shot(page, "08-sheet");
  await page.getByRole("button", { name: "이 날 수령으로 기록" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("5");

  // 수령 취소
  await page.getByRole("gridcell", { name: /^9월 25일/ }).click();
  await expect(page.getByRole("dialog")).toContainText("수령 완료");
  await page.getByRole("button", { name: "수령 취소" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("6");

  // 기록 탭
  await page.getByRole("button", { name: "기록" }).click();
  await expect(page.getByText("2026.09")).toBeVisible();
  await expect(page.getByText("총 7회 · 사용 1회")).toBeVisible();
  await shot(page, "09-history");
  await page.getByText("2026.09").click();
  await expect(page.getByText("2026년 9월 정산")).toBeVisible();
  await shot(page, "10-history-detail");

  await page.getByRole("button", { name: "뒤로" }).click();
  await page.getByRole("button", { name: "설정" }).click();
  await expect(page.getByText("데이터 백업")).toBeVisible();
  await shot(page, "11-settings");

  // 전체 흐름 동안 GitHub Pages 하위 경로에서 404 등 실패한 요청이 없다
  expect(failures).toEqual([]);
});

test("원본 스크린샷(로컬 전용)도 A6 B11 C6 → 근무 23일 / 간편식 7회", async ({ page }) => {
  test.skip(!existsSync(PRIVATE_SEP) || !existsSync(PRIVATE_OCT), "원본 스크린샷이 없는 환경(CI 등)");
  await open(page);
  await registerSchedule(page, [PRIVATE_SEP, PRIVATE_OCT]);
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await expect(page.getByTestId("result-workdays")).toHaveText("23일");
  await expect(page.getByLabel("A 6일, B 11일, C 6일")).toBeVisible();
});

test("사진 순서가 반대여도 바로잡아 7회로 계산한다", async ({ page }) => {
  await open(page);
  await registerSchedule(page, [OCT, SEP]);
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await expect(page.getByText("두 사진의 순서를 바로잡아 계산했어요.")).toBeVisible();
});

test("근무표 수정: A→휴 하면 간편식 +1", async ({ page }) => {
  await open(page);
  await registerSchedule(page);
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await page.getByRole("button", { name: "근무표 확인" }).click();
  await page.getByRole("gridcell", { name: /^10월 6일, A 근무/ }).click();
  await expect(page.getByRole("radio", { name: "A 근무" })).toHaveAttribute("aria-checked", "true");
  await shot(page, "12-edit-sheet");
  await page.getByRole("radio", { name: "휴무" }).click();
  await expect(page.getByTestId("editor-allowance")).toHaveText("8회");
  await page.getByRole("button", { name: "완료" }).click();
  await expect(page.getByTestId("result-allowance")).toHaveText("8");
});

test("달력이 아닌 사진은 다시 선택을 안내하고, 직접 입력할 수 있다", async ({ page }) => {
  await open(page);
  const icon = fileURLToPath(new URL("../public/icons/icon-512.png", import.meta.url));
  await registerSchedule(page, [icon, icon]);
  await expect(page.getByText("근무표를 정확하게 읽지 못했어요.")).toBeVisible({ timeout: 15_000 });
  await shot(page, "13-error");
  await page.getByRole("button", { name: "직접 입력하기" }).click();
  await expect(page.getByText("근무표 확인")).toBeVisible();
});

test("L. 같은 주소라도 기기마다 데이터가 독립적이고, 사진 선택·근무 수정·수령·백업 중 개인 데이터를 서버로 보내지 않는다", async ({
  browser,
}) => {
  const phoneA = await browser.newContext();
  const phoneB = await browser.newContext();
  const pageA = await phoneA.newPage();
  const requests: { url: string; method: string; body: string | null }[] = [];
  pageA.on("request", (r) => {
    // blob:/data: 는 기기 메모리 안의 주소(사진 미리보기)라 네트워크로 나가지 않는다
    if (/^https?:/.test(r.url())) requests.push({ url: r.url(), method: r.method(), body: r.postData() });
  });

  await open(pageA);
  await registerSchedule(pageA);
  await expect(pageA.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await pageA.getByRole("button", { name: "사용 시작" }).click();
  await pageA.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
  await expect(pageA.getByTestId("remaining")).toHaveText("6");
  // 근무 수정
  await pageA.getByRole("button", { name: "근무표 수정" }).click();
  await pageA.getByRole("gridcell", { name: /^10월 6일, A 근무/ }).click();
  await pageA.getByRole("radio", { name: "휴무" }).click();
  await pageA.getByRole("button", { name: "완료" }).click();
  await expect(pageA.getByTestId("remaining")).toHaveText("7");
  // 날짜 직접 수령
  await pageA.getByRole("gridcell", { name: /^9월 22일/ }).click();
  await pageA.getByRole("button", { name: "이 날 수령으로 기록" }).click();
  await expect(pageA.getByTestId("remaining")).toHaveText("6");
  // 백업 다운로드
  await pageA.getByRole("button", { name: "설정" }).click();
  const download = pageA.waitForEvent("download");
  await pageA.getByRole("button", { name: /데이터 백업/ }).click();
  await download;

  const pageB = await phoneB.newPage();
  await open(pageB);
  await expect(pageB.getByText("근무표만 넣으면")).toBeVisible();
  const storedB = await pageB.evaluate(() => JSON.parse(localStorage.getItem("hankki:v1:settlements") ?? "{}"));
  expect(storedB.months ?? []).toEqual([]);
  expect(storedB.settlements ?? []).toEqual([]);
  const storedA = await pageA.evaluate(() => JSON.parse(localStorage.getItem("hankki:v1:settlements") ?? "{}"));
  expect(storedA.months).toHaveLength(2);
  expect(storedA.settlements).toHaveLength(1);

  // 모든 요청은 같은 주소의 정적 파일 GET 뿐 (근무표·수령 기록·사진 전송 없음)
  expect(requests.length).toBeGreaterThan(0);
  for (const r of requests) {
    expect(new URL(r.url).origin).toBe(ORIGIN);
    expect(new URL(r.url).pathname.startsWith(BASE_PATH), r.url).toBe(true);
    expect(r.method).toBe("GET");
    expect(r.body).toBeNull();
  }
  await phoneA.close();
  await phoneB.close();
});

test("백업 → 다른 기기에서 복원", async ({ browser }) => {
  const oldPhone = await browser.newContext({ acceptDownloads: true });
  const page = await oldPhone.newPage();
  await open(page);
  await registerSchedule(page);
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await page.getByRole("button", { name: "사용 시작" }).click();
  await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
  await page.getByRole("button", { name: "설정" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /데이터 백업/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path, "utf8"));
  expect(backup.schemaVersion).toBe(2);
  // 월별 근무표(9월 30일, 10월 31일)와 정산별 수령 기록
  expect(backup.months.map((m: { id: string }) => m.id)).toEqual(["2026-09", "2026-10"]);
  expect(backup.months[0].days).toHaveLength(30);
  expect(backup.months[1].days).toHaveLength(31);
  expect(backup.settlements[0].mealUses).toHaveLength(1);

  const newPhone = await browser.newContext();
  const page2 = await newPhone.newPage();
  await open(page2);
  await page2.getByLabel("백업 파일 선택").setInputFiles(path);
  await expect(page2.getByTestId("remaining")).toHaveText("6");
  await expect(page2.getByTestId("usage")).toHaveText("1회 사용 · 총 7회");
  await oldPhone.close();
  await newPhone.close();
});

test("오프라인에서도 저장된 정산 확인과 수령 기록이 된다", async ({ page, context }) => {
  await open(page);
  await registerSchedule(page);
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await page.getByRole("button", { name: "사용 시작" }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // 서비스 워커가 페이지를 제어하도록
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("remaining")).toHaveText("7");
  await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("6");
  await context.setOffline(false);
});
