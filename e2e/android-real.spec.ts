import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { BASE } from "./target";
// Existing public September fixture's independently recorded answer (tests/expected.ts).
const expectedSeptember = ([['B',1],['OFF',2],['C',6],['OFF',2],['A',6],['OFF',2],['B',6],['OFF',2],['C',3]] as const).flatMap(([shift,count]) => Array<string>(count).fill(shift));

const privateImage = fileURLToPath(new URL("../tests/fixtures/private/android-2026-09.jpeg", import.meta.url));
const publicImage = fileURLToPath(new URL("../tests/fixtures/deid-2026-09.png", import.meta.url));
const october = fileURLToPath(new URL("../tests/fixtures/deid-2026-10.png", import.meta.url));
for (const actual of [false, true]) for (const fallback of [false, true]) {
  test(`${actual ? 'private Android original' : 'public synthetic floating button'} / ${fallback ? 'Image fallback' : 'bitmap'}`, async ({ page }) => {
    test.skip(actual && !existsSync(privateImage), "Private image stays local and is never committed");
    if (fallback) await page.addInitScript(() => { window.createImageBitmap = async () => { throw new Error("test fallback"); }; });
    await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
    await page.goto(BASE);
    await page.getByRole("button", { name: "근무표 등록하기" }).click();
    await page.getByRole("button", { name: "계속" }).click();
    if (actual) await page.getByLabel(/1번째 사진 선택/).setInputFiles(privateImage);
    else {
      const overlay = Buffer.from('<svg width="923" height="2000"><circle cx="823" cy="1730" r="80" fill="#0080ff"/></svg>');
      const buffer = await sharp(publicImage).composite([{ input: overlay }]).png().toBuffer();
      await page.getByLabel(/1번째 사진 선택/).setInputFiles({ name: "floating-button.png", mimeType: "image/png", buffer });
    }
    await page.getByLabel(/2번째 사진 선택/).setInputFiles(october);
    await page.getByRole("button", { name: "근무표 분석하기" }).click();
    await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 20000 });
    await page.getByRole("button", { name: "사용 시작" }).click();
    const shifts = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("hankki:v1:settlements")!);
      return stored.months.find((m: { id: string }) => m.id === "2026-09");
    });
    expect(shifts.days.map((d: { shift: string }) => d.shift)).toEqual(expectedSeptember);
  });
}
