// 여러 정산기간: 사진 2장으로 시작 → [다음 달 근무표 추가]로 한 장씩 → 정산 자동 생성, 좌우 이동, 월 교체
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { BASE } from "./target";

const fixture = (name: string) => fileURLToPath(new URL(`../tests/fixtures/${name}`, import.meta.url));

async function startWithTwo(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
  await page.goto(BASE);
  await page.getByRole("button", { name: "근무표 등록하기" }).click();
  await page.getByRole("button", { name: "계속" }).click();
  await page.getByLabel("1번째 사진 선택: 2026년 9월").setInputFiles(fixture("deid-2026-09.png"));
  await page.getByLabel("2번째 사진 선택: 2026년 10월").setInputFiles(fixture("deid-2026-10.png"));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 15_000 });
  await page.getByRole("button", { name: "사용 시작" }).click();
}

async function addMonth(page: Page, month: number, file: string, preview: string) {
  await page.getByRole("button", { name: `${month}월 근무표 추가` }).click();
  await expect(page.getByRole("heading", { name: `${month}월 근무표 추가` })).toBeVisible();
  await page.getByLabel(`근무표 사진 선택: 2026년 ${month}월`).setInputFiles(fixture(file));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByRole("heading", { name: `${month}월 근무표 확인` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(preview)).toBeVisible();
  await page.getByRole("button", { name: "저장" }).click();
}

test("9월+10월 → 다음 정산은 11월 근무표 필요 → 11월·12월 한 장씩 추가하면 정산 자동 생성, 좌우 이동", async ({ page }) => {
  await startWithTwo(page);

  // 기본: 오늘이 포함된 정산
  await expect(page.getByTestId("period-label")).toHaveText("이번 정산");
  await expect(page.getByTestId("period")).toHaveText("9.21 — 10.20");
  await expect(page.getByTestId("remaining")).toHaveText("7");
  await expect(page.getByRole("button", { name: "이전 정산 없음" })).toBeDisabled();

  // 다음 정산: 11월 데이터가 없으면 계산값을 만들지 않고 안내
  await page.getByRole("button", { name: "다음 정산 10.21 — 11.20" }).click();
  await expect(page.getByTestId("period-label")).toHaveText("다음 정산");
  await expect(page.getByTestId("period")).toHaveText("10.21 — 11.20");
  await expect(page.getByText("11월 근무표를 추가하면")).toBeVisible();
  await expect(page.getByTestId("remaining")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /오늘 간편식/ })).toHaveCount(0);

  // 11월 한 장 추가 → 10.21~11.20 자동 생성 (10월 데이터 + 11월 데이터)
  await addMonth(page, 11, "synthetic-2026-11.png", "10.21 — 11.20 · 간편식 8회");
  await expect(page.getByTestId("period")).toHaveText("10.21 — 11.20");
  await expect(page.getByTestId("remaining")).toHaveText("8");
  await expect(page.getByText("출근 22일 · 기준 30일")).toBeVisible();

  // 12월 추가 → 11.21~12.20
  await page.getByRole("button", { name: "다음 정산 11.21 — 12.20" }).click();
  await expect(page.getByText("12월 근무표를 추가하면")).toBeVisible();
  await addMonth(page, 12, "synthetic-2026-12.png", "11.21 — 12.20 · 간편식 6회");
  await expect(page.getByTestId("period")).toHaveText("11.21 — 12.20");
  await expect(page.getByTestId("remaining")).toHaveText("6");

  // 이전 정산들은 그대로
  await page.getByRole("button", { name: "이전 정산 10.21 — 11.20" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("8");
  await page.getByRole("button", { name: "이전 정산 9.21 — 10.20" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("7");

  // 기록 탭에 세 정산
  await page.getByRole("button", { name: "기록" }).click();
  await expect(page.getByText("2026.11")).toBeVisible();
  await expect(page.getByText("2026.10")).toBeVisible();
  await expect(page.getByText("2026.09")).toBeVisible();

  // 새로고침해도 유지, 기본은 오늘(9.25)이 포함된 정산
  await page.reload();
  await expect(page.getByTestId("period")).toHaveText("9.21 — 10.20");
  await page.getByRole("button", { name: "다음 정산 10.21 — 11.20" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("8");
});

test("정산별 수령 기록은 서로 영향을 주지 않는다", async ({ page }) => {
  await startWithTwo(page);
  await page.getByRole("button", { name: "다음 정산 10.21 — 11.20" }).click();
  await addMonth(page, 11, "synthetic-2026-11.png", "10.21 — 11.20 · 간편식 8회");

  // 10월 정산에서 10/22 수령
  await page.getByRole("gridcell", { name: /^10월 22일/ }).click();
  await page.getByRole("button", { name: "이 날 수령으로 기록" }).click();
  await expect(page.getByTestId("usage")).toHaveText("1회 사용 · 총 8회");

  // 9월 정산은 0회 사용 그대로, 오늘 수령해도 10월 정산은 그대로
  await page.getByRole("button", { name: "이전 정산 9.21 — 10.20" }).click();
  await expect(page.getByTestId("usage")).toHaveText("0회 사용 · 총 7회");
  await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();
  await expect(page.getByTestId("remaining")).toHaveText("6");
  await page.getByRole("button", { name: "다음 정산 10.21 — 11.20" }).click();
  await expect(page.getByTestId("usage")).toHaveText("1회 사용 · 총 8회");
});

test("설정의 등록된 근무표: 목록·추가·다시 등록(교체), 수령 기록 초과 경고", async ({ page }) => {
  await startWithTwo(page);

  // 9월 정산에서 7회 모두 수령
  for (const d of ["9월 21일", "9월 22일", "9월 23일", "9월 24일", "9월 25일", "9월 26일", "9월 27일"]) {
    await page.getByRole("gridcell", { name: new RegExp(`^${d}`) }).click();
    await page.getByRole("button", { name: "이 날 수령으로 기록" }).click();
  }
  await expect(page.getByTestId("remaining")).toHaveText("0");
  await expect(page.getByTestId("over-warning")).toHaveCount(0);

  // 근무표 수정으로 근무가 늘면(휴→A) 총 가능 횟수 6 < 수령 7 → 경고, 수령 기록은 지우지 않음
  await page.getByRole("button", { name: "근무표 수정" }).click();
  await page.getByRole("gridcell", { name: /^10월 4일, 휴무/ }).click();
  await page.getByRole("radio", { name: "A 근무" }).click();
  await page.getByRole("button", { name: "완료" }).click();
  await expect(page.getByTestId("over-warning")).toContainText("수령 기록 7회가 총 가능 횟수 6회보다 1회 많아요");
  await expect(page.getByTestId("usage")).toHaveText("7회 사용 · 총 6회");
  await expect(page.getByTestId("remaining")).toHaveText("0");

  // 설정 → 등록된 근무표
  await page.getByRole("button", { name: "설정" }).click();
  await expect(page.getByRole("button", { name: "2026년 9월 근무표 등록됨, 다시 등록" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2026년 10월 근무표 등록됨, 다시 등록" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2026년 11월 근무표 추가" })).toBeVisible();

  // 10월 다시 등록(원래 사진으로 교체) → 수정했던 10/4가 사진 값(휴)으로 돌아와 7회, 경고 사라짐
  await page.getByRole("button", { name: "2026년 10월 근무표 등록됨, 다시 등록" }).click();
  await expect(page.getByRole("heading", { name: "10월 근무표 다시 등록" })).toBeVisible();
  await expect(page.getByText("수령 기록은 그대로 남아요")).toBeVisible();
  await page.getByLabel("근무표 사진 선택: 2026년 10월").setInputFiles(fixture("deid-2026-10.png"));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByText("9.21 — 10.20 · 간편식 7회")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("status")).toContainText("10월 근무표를 교체했어요");
  await expect(page.getByTestId("usage")).toHaveText("7회 사용 · 총 7회");
  await expect(page.getByTestId("over-warning")).toHaveCount(0);

  // 설정에서 11월 추가도 가능
  await page.getByRole("button", { name: "설정" }).click();
  await page.getByRole("button", { name: "2026년 11월 근무표 추가" }).click();
  await expect(page.getByRole("heading", { name: "11월 근무표 추가" })).toBeVisible();
});

test("다른 달 사진을 넣으면 한 장 추가에서도 안내한다", async ({ page }) => {
  await startWithTwo(page);
  await page.getByRole("button", { name: "다음 정산 10.21 — 11.20" }).click();
  await page.getByRole("button", { name: "11월 근무표 추가" }).click();
  await page.getByLabel("근무표 사진 선택: 2026년 11월").setInputFiles(fixture("deid-2026-10.png"));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  await expect(page.getByText("2026년 11월 화면이 아닌 것 같아요")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "다시 선택" })).toBeVisible();
});

/** 맞지 않는 사진 → 안내 화면의 [직접 입력하기]로 한 달을 추가 (1·2월 테스트용 사진이 없어서) */
async function addMonthManually(page: Page, year: number, month: number, wrongPhoto: string) {
  await page.getByRole("button", { name: `${month}월 근무표 추가` }).click();
  await page.getByLabel(`근무표 사진 선택: ${year}년 ${month}월`).setInputFiles(fixture(wrongPhoto));
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  // 달이 다르거나(5주), 달력이 잘렸다는(6주짜리 1월) 안내 화면 → [직접 입력하기]
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "직접 입력하기" }).click();
  await expect(page.getByRole("heading", { name: `${month}월 근무표 확인` })).toBeVisible();
  await page.getByRole("button", { name: "저장" }).click();
}

const windowRows = (page: Page) => page.getByTestId("month-window").getByRole("listitem");
const windowNames = async (page: Page) =>
  (await page.getByTestId("month-window").getByRole("button").all()).map((b) => b.getAttribute("aria-label"));

test("등록된 근무표 기본 목록은 등록 개수와 관계없이 항상 4행, 전체 근무표 보기에서 모두 확인, 날짜가 지나면 자동 이동", async ({
  page,
}) => {
  await startWithTwo(page);
  // 9월 정산에 수령 1회 (숨겨진 뒤에도 유지되는지 확인용)
  await page.getByRole("button", { name: "오늘 간편식 받았어요" }).click();

  // 11·12월 사진 추가 → 9~12월 모두 등록
  await page.getByRole("button", { name: "다음 정산 10.21 — 11.20" }).click();
  await addMonth(page, 11, "synthetic-2026-11.png", "10.21 — 11.20 · 간편식 8회");
  await page.getByRole("button", { name: "다음 정산 11.21 — 12.20" }).click();
  await addMonth(page, 12, "synthetic-2026-12.png", "11.21 — 12.20 · 간편식 6회");

  // 1. 9~12월 등록 → 4행
  await page.getByRole("button", { name: "설정" }).click();
  await expect(windowRows(page)).toHaveCount(4);
  expect(await Promise.all(await windowNames(page))).toEqual([
    "2026년 9월 근무표 등록됨, 다시 등록",
    "2026년 10월 근무표 등록됨, 다시 등록",
    "2026년 11월 근무표 등록됨, 다시 등록",
    "2026년 12월 근무표 등록됨, 다시 등록",
  ]);

  // 2. 1월 추가 → 여전히 4행
  // (메인 화면은 마지막으로 보던 11.21~12.20 정산을 기억한다)
  await page.getByRole("button", { name: "이번 정산" }).click();
  await expect(page.getByTestId("period")).toHaveText("11.21 — 12.20");
  await page.getByRole("button", { name: "다음 정산 12.21 — 1.20" }).click();
  await addMonthManually(page, 2027, 1, "synthetic-2026-11.png");
  await page.getByRole("button", { name: "설정" }).click();
  await expect(windowRows(page)).toHaveCount(4);
  await expect(page.getByRole("button", { name: "2027년 1월 근무표 등록됨, 다시 등록" })).toHaveCount(0);

  // 3. 2월 추가 → 여전히 4행
  await page.getByRole("button", { name: "이번 정산" }).click();
  await page.getByRole("button", { name: "다음 정산 1.21 — 2.20" }).click();
  await addMonthManually(page, 2027, 2, "deid-2026-10.png");
  await page.getByRole("button", { name: "설정" }).click();
  await expect(windowRows(page)).toHaveCount(4);

  // 4. 전체 근무표 보기: 연도별(최신 연도 먼저), 9월~2월 모두 존재
  const toggle = page.getByRole("button", { name: "전체 근무표 보기 (6개월)" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  const y2027 = page.getByRole("region", { name: "2027년 근무표" });
  const y2026 = page.getByRole("region", { name: "2026년 근무표" });
  await expect(y2027.getByRole("button")).toHaveCount(2);
  await expect(y2027.getByRole("button").nth(0)).toHaveAccessibleName("2027년 2월 근무표 등록됨, 다시 등록");
  await expect(y2027.getByRole("button").nth(1)).toHaveAccessibleName("2027년 1월 근무표 등록됨, 다시 등록");
  await expect(y2026.getByRole("button")).toHaveCount(4);
  await expect(y2026.getByRole("button").nth(0)).toHaveAccessibleName("2026년 12월 근무표 등록됨, 다시 등록");
  await expect(y2026.getByRole("button").nth(3)).toHaveAccessibleName("2026년 9월 근무표 등록됨, 다시 등록");
  // 전체 근무표에서도 다음 달 추가 가능
  await expect(page.getByRole("button", { name: "2027년 3월 근무표 추가" })).toBeVisible();
  await expect(windowRows(page)).toHaveCount(4);
  await page.getByRole("button", { name: "전체 근무표 접기" }).click();

  // 5. 날짜가 다음 정산기간으로 이동하면 4개월 창도 자동 이동
  await page.clock.setFixedTime(new Date("2026-10-25T10:00:00+09:00"));
  await page.reload();
  await page.getByRole("button", { name: "설정" }).click();
  await expect(windowRows(page)).toHaveCount(4);
  expect(await Promise.all(await windowNames(page))).toEqual([
    "2026년 10월 근무표 등록됨, 다시 등록",
    "2026년 11월 근무표 등록됨, 다시 등록",
    "2026년 12월 근무표 등록됨, 다시 등록",
    "2027년 1월 근무표 등록됨, 다시 등록",
  ]);
  await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+09:00"));
  await page.reload();
  await page.getByRole("button", { name: "설정" }).click();
  expect(await Promise.all(await windowNames(page))).toEqual([
    "2026년 11월 근무표 등록됨, 다시 등록",
    "2026년 12월 근무표 등록됨, 다시 등록",
    "2027년 1월 근무표 등록됨, 다시 등록",
    "2027년 2월 근무표 등록됨, 다시 등록",
  ]);

  // 6. 숨겨진 9·10월 데이터와 정산 기록은 그대로
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("hankki:v1:settlements") ?? "{}"));
  expect(stored.months.map((m: { id: string }) => m.id)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  expect(stored.settlements.find((r: { id: string }) => r.id === "2026-09").mealUses).toHaveLength(1);
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await page.getByText("2026.09").click();
  await expect(page.getByText("2026년 9월 정산")).toBeVisible();
  await expect(page.getByText("9월 25일 (금)")).toBeVisible();

  const dir = process.env.SHOT_DIR;
  if (dir) {
    await page.getByRole("button", { name: "뒤로" }).click();
    await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
    await page.reload();
    await page.getByRole("button", { name: "설정" }).click();
    await page.waitForTimeout(2800);
    await page.screenshot({ path: `${dir}/window-collapsed.png` });
    await page.getByRole("button", { name: /전체 근무표 보기/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/window-expanded.png`, fullPage: true });
  }
});
