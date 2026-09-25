// 브라우저 재실행 후 유지, 잘못된 백업 거부, 다크 모드·iPhone SE·데스크톱 화면 검증 (GitHub Pages /hankki/ 조건)
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, chromium, expect, test } from "@playwright/test";
import { BASE } from "./target";

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

test("수령 표시: '✓ 받음' 배지가 수령·취소 즉시 반영되고, 휴무일에도 같게 보이며 오늘 표시와 구분된다", async ({ page }) => {
  await registerAndStart(page);
  const today = page.getByRole("gridcell", { name: /^9월 25일/ });
  const offDay = page.getByRole("gridcell", { name: /^9월 26일, 휴무/ });

  // 수령 전: 배지 없음
  await expect(today.getByText("받음")).toHaveCount(0);

  // 오늘 수령 → 즉시 배지 + 셀 상태
  await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
  await expect(today.getByText("받음")).toBeVisible();
  await expect(today).toHaveClass(/is-received/);
  await expect(today).toHaveAccessibleName(/간편식 수령/);
  // 오늘 표시(날짜 링)와 근무 원(B)은 그대로
  await expect(today).toHaveClass(/is-today/);
  await expect(today.locator(".cal-shift.shift-b")).toHaveText("B");

  // 휴무일 수령도 같은 배지
  await offDay.click();
  await page.getByRole("button", { name: "이 날 수령으로 기록" }).click();
  await expect(offDay.getByText("받음")).toBeVisible();
  await expect(offDay.locator(".cal-off")).toHaveText("휴");

  // 배지는 green 계열 (B 파랑과 다름)
  const badgeColor = await today.locator(".meal-badge").evaluate((el) => getComputedStyle(el).color);
  expect(badgeColor).toBe("rgb(46, 125, 90)");

  // 수령 취소 → 즉시 배지 사라짐
  await today.click();
  await page.getByRole("button", { name: "수령 취소" }).click();
  await expect(today.getByText("받음")).toHaveCount(0);
  await expect(today).not.toHaveClass(/is-received/);
  await expect(offDay.getByText("받음")).toBeVisible();

  // 안내 문구도 같은 배지 디자인
  await expect(page.locator(".legend .meal-badge")).toHaveText("받음");
  await expect(page.getByText("간편식을 받은 날")).toBeVisible();
});

for (const [name, viewport, scheme] of [
  ["iPhone SE", { width: 375, height: 667 }, "light"],
  ["iPhone 15 Pro Max", { width: 430, height: 932 }, "light"],
  ["다크 모드", { width: 390, height: 844 }, "dark"],
] as const) {
  test(`수령 배지가 날짜·근무 표시와 겹치지 않는다 (${name})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme });
    const page = await ctx.newPage();
    await registerAndStart(page);
    await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
    const cell = page.getByRole("gridcell", { name: /^9월 25일/ });
    const [cellBox, dateBox, markBox, badgeBox] = await Promise.all([
      cell.boundingBox(),
      cell.locator(".calendar-date").boundingBox(),
      cell.locator(".cal-shift").boundingBox(),
      cell.locator(".meal-badge").boundingBox(),
    ]);
    const c = cellBox!;
    const d = dateBox!;
    const m = markBox!;
    const b = badgeBox!;
    // 배지가 셀 안에 들어가고, 위→아래로 날짜 · 근무 · 배지 순서로 겹치지 않는다
    expect(b.x).toBeGreaterThanOrEqual(c.x - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
    expect(d.y + d.height).toBeLessThanOrEqual(m.y + 0.5);
    expect(m.y + m.height).toBeLessThanOrEqual(b.y + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(c.y + c.height + 0.5);
    expect(b.height).toBeGreaterThanOrEqual(21);
    if (scheme === "dark") {
      const color = await cell.locator(".meal-badge").evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe("rgb(127, 209, 168)");
    }
    const shotDir = process.env.SHOT_DIR;
    if (shotDir) await page.screenshot({ path: `${shotDir}/badge-${name.replace(/\s+/g, "-")}.png` });
    await ctx.close();
  });
}

test("오늘 표시는 채운 원이 아니라 날짜 둘레의 링이고, 오늘이 C 근무여도 두 상태가 구분된다", async ({ page }) => {
  await registerAndStart(page);
  // 오늘(9/25)을 C 근무일(9/28)로 옮겨 다시 연다
  await page.clock.setFixedTime(new Date("2026-09-28T10:00:00+09:00"));
  await page.reload();
  const today = page.getByRole("gridcell", { name: /^9월 28일, C 근무.*오늘/ });
  await expect(today).toHaveClass(/is-today/);
  const date = today.locator(".calendar-date");
  const style = await date.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderTopColor, width: parseFloat(cs.borderTopWidth), color: cs.color, h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width };
  });
  expect(style.bg).toBe("rgba(0, 0, 0, 0)"); // 채움 없음
  expect(style.border).toBe("rgb(61, 104, 168)"); // muted blue 링
  expect(style.width).toBeGreaterThanOrEqual(1.5);
  expect(style.color).toBe("rgb(28, 28, 30)"); // 진한 charcoal 숫자
  expect(style.h).toBeGreaterThanOrEqual(32);
  expect(style.w).toBeGreaterThanOrEqual(32);
  // C 근무는 채운 차콜 원 그대로
  const shiftBg = await today.locator(".cal-shift.shift-c").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(shiftBg).toBe("rgb(58, 58, 60)");
  // 링과 근무 원은 겹치지 않는다
  const d = (await date.boundingBox())!;
  const m = (await today.locator(".cal-shift").boundingBox())!;
  expect(d.y + d.height).toBeLessThanOrEqual(m.y + 0.5);
  // 오늘이 아닌 날짜는 링 없음
  const other = page.getByRole("gridcell", { name: /^9월 29일/ }).locator(".calendar-date");
  expect(await other.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgba(0, 0, 0, 0)");
});
