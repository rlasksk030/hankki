// 월 검증: 다른 달 사진은 자동 통과하지 않는다 (GitHub Pages /hankki/ 조건, 실제 브라우저)
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { BASE } from "./target";

const fixture = (name: string) => fileURLToPath(new URL(`../tests/fixtures/${name}`, import.meta.url));
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("hankki:v1:settlements") ?? "{}"));

async function startPair(page: Page, first: string, second: string) {
  await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
  await page.goto(BASE);
  await page.getByRole("button", { name: "근무표 등록하기" }).click();
  await page.getByRole("button", { name: "계속" }).click();
  await page.getByLabel("1번째 사진 선택: 2026년 9월").setInputFiles(fixture(first));
  await page.getByLabel("2번째 사진 선택: 2026년 10월").setInputFiles(fixture(second));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
}

async function tryMonth(page: Page, year: number, month: number, photo: string) {
  await page.getByRole("button", { name: `${month}월 근무표 추가` }).click();
  await page.getByLabel(`근무표 사진 선택: ${year}년 ${month}월`).setInputFiles(fixture(photo));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
}

test("9월 사진을 12월로, 11월 사진을 2027년 2월로 선택하면 자동 통과하지 않는다", async ({ page }) => {
  await startPair(page, "deid-2026-09.png", "deid-2026-10.png");
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await page.getByRole("button", { name: "사용 시작" }).click();
  await page.getByRole("button", { name: "다음 정산 10.21 — 11.20" }).click();
  await tryMonth(page, 2026, 11, "synthetic-2026-11.png");
  await expect(page.getByRole("heading", { name: "11월 근무표 확인" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "저장" }).click();

  // ① 9월 사진을 12월로 → 거부, 사진 속 제목(2026.09)을 알려 준다
  await page.getByRole("button", { name: "다음 정산 11.21 — 12.20" }).click();
  await tryMonth(page, 2026, 12, "deid-2026-09.png");
  const alert1 = page.getByRole("alert");
  await expect(alert1).toContainText("2026년 12월 화면이 아닌 것 같아요", { timeout: 15_000 });
  await expect(alert1).toContainText("사진 속 제목은 2026.09로 보여요");
  await expect(page.getByRole("heading", { name: "12월 근무표 확인" })).toHaveCount(0);
  expect((await stored(page)).months.map((m: { id: string }) => m.id)).not.toContain("2026-12");

  // 올바른 12월 사진으로 다시 선택하면 통과
  await page.getByRole("button", { name: "다시 선택" }).click();
  await page.getByLabel("근무표 사진 선택: 2026년 12월").setInputFiles(fixture("synthetic-2026-12.png"));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByText("11.21 — 12.20 · 간편식 6회")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "저장" }).click();

  // 1월: 실제 6주짜리 1월 화면으로 추가
  await page.getByRole("button", { name: "다음 정산 12.21 — 1.20" }).click();
  await tryMonth(page, 2027, 1, "deid-2027-01.png");
  await expect(page.getByRole("heading", { name: "1월 근무표 확인" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "저장" }).click();

  // ② 실제 11월 사진을 2027년 2월로 → 거부, 사진 속 제목(2026.11)
  await page.getByRole("button", { name: "다음 정산 1.21 — 2.20" }).click();
  await tryMonth(page, 2027, 2, "deid-2026-11.png");
  const alert2 = page.getByRole("alert");
  await expect(alert2).toContainText("2027년 2월 화면이 아닌 것 같아요", { timeout: 15_000 });
  await expect(alert2).toContainText("사진 속 제목은 2026.11로 보여요");
  await expect(page.getByRole("heading", { name: "2월 근무표 확인" })).toHaveCount(0);

  // 실제 2월 화면으로 다시 선택하면 통과
  await page.getByRole("button", { name: "다시 선택" }).click();
  await page.getByLabel("근무표 사진 선택: 2027년 2월").setInputFiles(fixture("deid-2027-02.png"));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByRole("heading", { name: "2월 근무표 확인" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "저장" }).click();

  // ③ 이미 11월로 등록한 사진을 다른 달(12월 다시 등록)에 넣어도 거부 → 중복 등록 안 됨
  await page.getByRole("button", { name: "설정" }).click();
  await page.getByRole("button", { name: "2026년 12월 근무표 등록됨, 다시 등록" }).click();
  await page.getByLabel("근무표 사진 선택: 2026년 12월").setInputFiles(fixture("synthetic-2026-11.png"));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByRole("alert")).toContainText("사진 속 제목은 2026.11로 보여요", { timeout: 15_000 });

  const data = await stored(page);
  expect(data.months.map((m: { id: string }) => m.id)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  // 모두 사진 제목으로 월을 확인해 저장됨
  expect(data.months.map((m: { monthCheck?: string }) => m.monthCheck)).toEqual(["title", "title", "title", "title", "title", "title"]);
});

test("같은 사진 두 장으로 시작하면 거부한다", async ({ page }) => {
  await startPair(page, "deid-2026-09.png", "deid-2026-09.png");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("2번째 사진이 2026년 10월 화면이 아닌 것 같아요", { timeout: 15_000 });
});

test("제목을 읽지 못하고 같은 배치의 달이 있으면 확인을 받는다: [다시 선택] / [그래도 사용]은 사용자 확인으로 기록", async ({
  page,
}) => {
  // 10월 사진의 제목만 지운 화면: 2026년 1월과 달력 배치가 같아 구조만으로는 확신할 수 없다
  await startPair(page, "deid-2026-09.png", "synthetic-2026-10-notitle.png");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("2번째 사진: 선택한 2026년 10월과", { timeout: 15_000 });
  await expect(alert).toContainText("사진 속 근무표가 다른 달처럼 보여요.");
  await expect(page.getByTestId("result-allowance")).toHaveCount(0); // 자동 통과하지 않음

  // 다시 선택 → 사진 화면
  await page.getByRole("button", { name: "다시 선택" }).click();
  await expect(page.getByRole("heading", { name: "근무표 가져오기" })).toBeVisible();

  // 다시 분석 → 그래도 사용 → 결과 7회, '사용자 확인'으로 기록
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByRole("alert")).toContainText("다른 달처럼 보여요", { timeout: 15_000 });
  await page.getByRole("button", { name: "그래도 사용" }).click();
  await expect(page.getByTestId("result-allowance")).toHaveText("7");
  await page.getByRole("button", { name: "사용 시작" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("7");
  const data = await stored(page);
  expect(data.months.map((m: { monthCheck?: string }) => m.monthCheck)).toEqual(["title", "user-confirmed"]);
});
