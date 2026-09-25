// 정산 메인 화면 한 화면 구성 검증 (실제 fixture: A6 B11 C6, 근무 23, 총 7회)
// 남은 횟수 · 사용/총 · 출근일 · 정산기간 · 전체 달력 · CTA · 하단 탭이 스크롤 없이 보이는지 잰다.
import { fileURLToPath } from "node:url";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { BASE } from "./target";

const fixture = (name: string) => fileURLToPath(new URL(`../tests/fixtures/${name}`, import.meta.url));

interface Target {
  name: string;
  viewport: { width: number; height: number };
  /** 홈 화면 앱(standalone)의 safe area를 흉내 낸다 */
  safe?: { top: number; bottom: number };
  /** 허용하는 세로 스크롤(px) */
  maxScroll: number;
  colorScheme?: "light" | "dark";
}

// Safari 주소창·툴바를 뺀 실제 보이는 영역 (Playwright 기기 정의)
const TARGETS: Target[] = [
  { name: "iPhone 15 Pro Max (Safari)", viewport: { width: 430, height: 739 }, maxScroll: 0 },
  { name: "iPhone 15 Pro Max (홈 화면 앱)", viewport: { width: 430, height: 932 }, safe: { top: 59, bottom: 34 }, maxScroll: 0 },
  { name: "iPhone 15 (Safari)", viewport: { width: 393, height: 659 }, maxScroll: 0 },
  { name: "iPhone 14 (Safari)", viewport: { width: 390, height: 664 }, maxScroll: 0 },
  { name: "iPhone 15 Pro Max 다크 (Safari)", viewport: { width: 430, height: 739 }, maxScroll: 0, colorScheme: "dark" },
  // 아주 작은 화면: 최소 스크롤만 허용 (CTA는 항상 보임)
  { name: "iPhone SE (Safari)", viewport: { width: 375, height: 548 }, maxScroll: 140 },
];

async function openHome(browser: Browser, t: Target): Promise<Page> {
  const ctx = await browser.newContext({ viewport: t.viewport, colorScheme: t.colorScheme ?? "light", deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
  await page.goto(BASE);
  if (t.safe) {
    // (앱 CSP가 인라인 <style>을 막으므로 CSSOM으로 safe area 값을 넣는다)
    await page.evaluate((safe) => {
      document.documentElement.style.setProperty("--safe-top", `${safe.top}px`);
      document.documentElement.style.setProperty("--safe-bottom", `${safe.bottom}px`);
    }, t.safe);
  }
  await page.getByRole("button", { name: "근무표 등록하기" }).click();
  await page.getByRole("button", { name: "계속" }).click();
  await page.getByLabel("1번째 사진 선택: 2026년 9월").setInputFiles(fixture("deid-2026-09.png"));
  await page.getByLabel("2번째 사진 선택: 2026년 10월").setInputFiles(fixture("deid-2026-10.png"));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await page.getByRole("button", { name: "사용 시작" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("7");
  return page;
}

for (const t of TARGETS) {
  test(`메인 한 화면: ${t.name}`, async ({ browser }) => {
    const page = await openHome(browser, t);
    // 수령 1회(오늘) + 휴무일 1회 → '✓ 받음' 배지가 있는 상태로 잰다
    await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
    await page.getByRole("gridcell", { name: /^9월 26일/ }).click();
    await page.getByRole("button", { name: "이 날 수령으로 기록" }).click();
    await expect(page.getByTestId("usage")).toHaveText("2회 사용 · 총 7회");
    await page.waitForTimeout(2800); // 토스트가 사라진 뒤
    await page.evaluate(() => window.scrollTo(0, 0));

    const m = await page.evaluate(() => {
      const r = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, height: b.height };
      };
      const rows = [...document.querySelectorAll(".calendar.is-fill > .calendar-row:not(.calendar-head)")];
      const lastRow = rows.at(-1)!.getBoundingClientRect();
      const cells = [...document.querySelectorAll(".calendar.is-fill .calendar-cell:not(.is-empty)")].map((c) => c.getBoundingClientRect().height);
      return {
        scroll: document.documentElement.scrollHeight - window.innerHeight,
        innerHeight: window.innerHeight,
        number: r(".home-number"),
        summary: r(".home-summary"),
        nav: r(".period-nav"),
        lastRowBottom: lastRow.bottom,
        weeks: rows.length,
        minCell: Math.min(...cells),
        cta: r(".cta-dock .button-cta"),
        tabbar: r(".tabbar"),
      };
    });
    console.log(t.name, JSON.stringify(m));

    expect(m.scroll).toBeLessThanOrEqual(t.maxScroll);
    // 남은 횟수는 여전히 가장 크게
    expect(m.number!.height).toBeGreaterThanOrEqual(80);
    // 전체 5주 달력, 터치 영역 44px 이상
    expect(m.weeks).toBe(5);
    expect(m.minCell).toBeGreaterThanOrEqual(44);
    // CTA는 항상 보이고 하단 탭 바로 위, 높이 52~56
    expect(m.cta!.height).toBeGreaterThanOrEqual(52);
    expect(m.cta!.height).toBeLessThanOrEqual(56);
    expect(m.cta!.bottom).toBeLessThanOrEqual(m.tabbar!.top + 0.5);
    expect(m.tabbar!.bottom).toBeLessThanOrEqual(m.innerHeight + 0.5);
    if (t.maxScroll === 0) {
      // 스크롤 없이 모든 요소가 화면 안: 정산기간 · 요약 · 달력 마지막 주 · CTA
      expect(m.nav!.top).toBeGreaterThanOrEqual(0);
      expect(m.lastRowBottom).toBeLessThanOrEqual(m.cta!.top + 0.5);
    }
    await expect(page.getByText("출근 23일 · 기준 30일")).toBeVisible();
    await expect(page.getByTestId("period")).toHaveText("9.21 — 10.20");
    await expect(page.getByRole("button", { name: "오늘 받은 것으로 기록됨" })).toBeInViewport();

    const dir = process.env.SHOT_DIR;
    if (dir) await page.screenshot({ path: `${dir}/layout-${t.name.replace(/[^\w가-힣]+/g, "-")}.png` });
    await page.context().close();
  });
}
