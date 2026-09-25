// 브라우저 재실행 후 유지, 잘못된 백업 거부, 다크 모드·iPhone SE·데스크톱 화면 검증 (GitHub Pages /hankki/ 조건)
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, chromium, expect, test } from "@playwright/test";

const BASE = "http://localhost:4173/hankki/";
const fixture = (name: string) => fileURLToPath(new URL(`../tests/fixtures/${name}`, import.meta.url));

async function registerAndStart(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
  await page.goto(BASE);
  await page.getByRole("button", { name: "근무표 등록하기" }).click();
  await page.getByRole("button", { name: "계속" }).click();
  await page.getByLabel(/1번째 사진 선택/).setInputFiles(fixture("deid-2026-09.png"));
  await page.getByLabel(/2번째 사진 선택/).setInputFiles(fixture("deid-2026-10.png"));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await page.getByRole("button", { name: "사용 시작" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("7");
}

test("브라우저를 완전히 종료했다 다시 열어도 기록이 남아 있다", async () => {
  const profile = mkdtempSync(join(tmpdir(), "hankki-profile-"));
  try {
    const first = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 } });
    const page = first.pages()[0] ?? (await first.newPage());
    await registerAndStart(page);
    await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
    await expect(page.getByTestId("remaining")).toHaveText("6");
    await first.close(); // 브라우저 종료

    const second = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 } });
    const again = second.pages()[0] ?? (await second.newPage());
    await again.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
    await again.goto(BASE);
    await expect(again.getByTestId("remaining")).toHaveText("6");
    await expect(again.getByTestId("usage")).toHaveText("1회 사용 · 총 7회");
    await second.close();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
});

test("빈 저장소에서 잘못된 JSON·다른 버전 백업은 복원하지 않는다", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "hankki-bad-"));
  const broken = join(dir, "broken.json");
  const wrongVersion = join(dir, "wrong-version.json");
  const otherApp = join(dir, "other-app.json");
  writeFileSync(broken, '{"app":"hankki","schemaVersion":1,"settlements":[{"id":');
  writeFileSync(wrongVersion, JSON.stringify({ app: "hankki", schemaVersion: 2, activeId: null, settlements: [] }));
  writeFileSync(otherApp, JSON.stringify({ todos: [1, 2, 3] }));
  try {
    await page.goto(BASE);
    await page.getByLabel("백업 파일 선택").setInputFiles(broken);
    await expect(page.getByText("복원할 수 없는 파일이에요")).toBeVisible();
    await page.getByLabel("백업 파일 선택").setInputFiles(wrongVersion);
    await expect(page.getByText("지원하지 않는 버전이에요")).toBeVisible();
    await page.getByLabel("백업 파일 선택").setInputFiles(otherApp);
    await expect(page.getByText("한끼에서 만든 백업 파일인지 확인해 주세요")).toBeVisible();
    // 여전히 첫 화면(데이터 없음)
    await expect(page.getByRole("button", { name: "근무표 등록하기" })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("hankki:v1:settlements") ?? "{}"));
    expect(stored.settlements ?? []).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("다크 모드", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  await registerAndStart(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(17, 17, 18)");
  expect(await page.getByTestId("remaining").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(242, 242, 244)");
  await ctx.close();
});

test("iPhone SE(375×667): 가로 스크롤 없이 핵심 버튼이 보인다", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  await registerAndStart(page);
  const cta = page.getByRole("button", { name: "오늘 간편식 받았어요" });
  await expect(cta).toBeInViewport();
  const box = (await cta.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await ctx.close();
});

test("데스크톱(1280×800): 가운데 정렬된 폭으로 정상 동작한다", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await registerAndStart(page);
  const width = await page.locator(".app").evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(560);
  await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("6");
  await ctx.close();
});
