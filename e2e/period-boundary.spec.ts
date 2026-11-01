// 정산 경계 20일 23시: 그 전에는 지난 정산, 23시부터는 새 정산이 기본으로 선택된다.
import { expect, test } from "@playwright/test";
import { BASE } from "./target";

for (const [time, label, range] of [
  ["2026-10-20T22:59:00+09:00", "2026년 9월", "9월 21일 ~ 10월 20일"],
  ["2026-10-20T23:00:00+09:00", "2026년 10월", "10월 21일 ~ 11월 20일"],
] as const) {
  test(`${time.slice(0, 16)} 에 근무표를 등록하면 기준월은 ${label}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(time));
    await page.goto(BASE);
    await page.getByRole("button", { name: "근무표 등록하기" }).click();
    await expect(page.getByText("어느 정산을 계산할까요?")).toBeVisible();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText(range)).toBeVisible();
    await expect(page.getByText("정산기간은 기준월 20일 23시부터 다음 달 20일 23시 전까지예요.", { exact: false })).toBeVisible();
  });
}
