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
