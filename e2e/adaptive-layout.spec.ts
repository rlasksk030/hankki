import { test, expect, devices } from "@playwright/test";
import { REFLOW_LAYOUTS, reflowFixture } from "../tests/reflowFixture";
import { BASE } from "./target";

// These are synthetic reflows, not captures from actual Samsung hardware.
for (const [name, layout] of Object.entries(REFLOW_LAYOUTS)) {
  test(`calendar reflow: ${name}`, async ({ page }) => {
    await page.setViewportSize(name === "fold-wide" ? { width: 768, height: 900 } : devices["Pixel 7"].viewport);
    await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
    await page.goto(BASE);
    await page.getByRole("button", { name: "근무표 등록하기" }).click();
    await page.getByRole("button", { name: "계속" }).click();
    for (const [i, month] of (["09", "10"] as const).entries()) {
      await page.getByLabel(new RegExp(`${i + 1}번째 사진 선택`)).setInputFiles({
        name: `${name}-${month}.png`, mimeType: "image/png", buffer: await reflowFixture(month, layout),
      });
    }
    await page.getByRole("button", { name: "근무표 분석하기" }).click();
    await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 20000 });
    await page.getByRole("button", { name: "사용 시작" }).click();
    await expect(page.getByTestId("remaining")).toHaveText("7");
  });
}
