// Full registration flow with captures in different screen classes and themes.
// Images are generated in memory from public de-identified fixtures (tests/deviceLayout.ts):
// "resolution class" = re-laid-out fixture, "dark" = SYNTHETIC polarity transform (not the real app palette).
// Browser engines here are Playwright builds, not physical iPhone/Android devices.
import { expect, type Page, test } from "@playwright/test";
import { type DarkVariant, DEVICE_CLASSES, renderDeviceCapture, toSyntheticDark } from "../tests/deviceLayout";
import { BASE } from "./target";

type Theme = "light" | DarkVariant;
// Same human-read answers as tests/expected.ts (EXPECTED_MONTHS 2026-09 / 2026-10).
const seq = (spec: Array<[string, number]>) => spec.flatMap(([shift, n]) => Array<string>(n).fill(shift));
const EXPECTED_MONTHS = {
  "2026-09": seq([["B", 1], ["OFF", 2], ["C", 6], ["OFF", 2], ["A", 6], ["OFF", 2], ["B", 6], ["OFF", 2], ["C", 3]]),
  "2026-10": seq([["C", 3], ["OFF", 2], ["A", 6], ["OFF", 2], ["B", 6], ["OFF", 2], ["C", 6], ["OFF", 2], ["A", 2]]),
};
interface Case {
  name: string;
  device: string;
  themes: [Theme, Theme];
  fallback?: boolean;
  format?: "png" | "jpeg";
}

const CASES: Case[] = [
  { name: "1320px class light + light", device: "17 Pro Max resolution class 440pt (1320×2868)", themes: ["light", "light"] },
  { name: "1320px class dark + dark", device: "17 Pro Max resolution class 440pt (1320×2868)", themes: ["gray-keep-chips", "gray-keep-chips"] },
  { name: "standard light + dark", device: "standard (1179×2556)", themes: ["light", "black-inverted"] },
  { name: "standard dark + light", device: "standard (1179×2556)", themes: ["black-inverted", "light"] },
  { name: "Android FHD dark JPEG", device: "android FHD (1080×2400)", themes: ["gray-keep-chips", "black-inverted"], format: "jpeg" },
  { name: "Android QHD dark, Image fallback decoder", device: "android QHD (1440×3120)", themes: ["black-inverted", "gray-keep-chips"], fallback: true },
  { name: "1320px class light + dark, Image fallback decoder", device: "17 Pro Max resolution class 440pt (1320×2868)", themes: ["light", "gray-keep-chips"], fallback: true },
];

async function capture(month: "09" | "10", device: string, theme: Theme, format: "png" | "jpeg"): Promise<Buffer> {
  let buffer = await renderDeviceCapture(`deid-2026-${month}.png`, { year: 2026, month: Number(month) }, DEVICE_CLASSES[device]);
  if (theme !== "light") buffer = await toSyntheticDark(buffer, theme);
  if (format === "jpeg") {
    const sharp = (await import("sharp")).default;
    buffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
  }
  return buffer;
}

const storedMonths = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("hankki:v1:settlements");
    return raw ? (JSON.parse(raw).months as Array<{ id: string; days: Array<{ shift: string }>; monthCheck?: string }>) : [];
  });

for (const c of CASES) {
  test(`register ${c.name}: every day matches, saved, survives reload`, async ({ page }) => {
    if (c.fallback) {
      await page.addInitScript(() => {
        window.createImageBitmap = async () => {
          throw new Error("simulated unsupported decoder");
        };
      });
    }
    await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
    await page.goto(BASE);
    await page.getByRole("button", { name: "근무표 등록하기" }).click();
    await expect(page.getByText("9월 21일 ~ 10월 20일")).toBeVisible();
    await page.getByRole("button", { name: "계속" }).click();
    const format = c.format ?? "png";
    for (const [i, month] of (["09", "10"] as const).entries()) {
      await page.getByLabel(`${i + 1}번째 사진 선택: 2026년 ${Number(month)}월`).setInputFiles({
        name: `capture-${month}.${format === "jpeg" ? "jpg" : "png"}`,
        mimeType: `image/${format}`,
        buffer: await capture(month, c.device, c.themes[i], format),
      });
    }
    await page.getByRole("button", { name: "근무표 분석하기" }).click();

    // Month validated by the photo titles (no confirmation screen), 7 meals, no uncertain days.
    await expect(page.getByTestId("result-allowance")).toHaveText("7", { timeout: 30_000 });
    await expect(page.getByTestId("result-workdays")).toHaveText("23일");
    await expect(page.getByLabel("A 6일, B 11일, C 6일")).toBeVisible();
    await expect(page.getByText("확인이 필요한 날짜가 있어요")).toHaveCount(0);

    // Review screen shows the read shifts.
    await page.getByRole("button", { name: "근무표 확인" }).click();
    await expect(page.getByRole("gridcell", { name: /^10월 6일, A 근무/ })).toBeVisible();
    await expect(page.getByRole("gridcell", { name: /^9월 28일, C 근무/ })).toBeVisible();
    await page.getByRole("button", { name: "완료" }).click();

    await page.getByRole("button", { name: "사용 시작" }).click();
    await expect(page.getByTestId("remaining")).toHaveText("7");

    const months = await storedMonths(page);
    expect(months.map((m) => m.id)).toEqual(["2026-09", "2026-10"]);
    expect(months[0].days.map((d) => d.shift)).toEqual(EXPECTED_MONTHS["2026-09"]);
    expect(months[1].days.map((d) => d.shift)).toEqual(EXPECTED_MONTHS["2026-10"]);
    expect(months.map((m) => m.monthCheck)).toEqual(["title", "title"]);

    await page.reload();
    await expect(page.getByTestId("remaining")).toHaveText("7");
    await page.getByRole("button", { name: "설정" }).click();
    await expect(page.getByRole("button", { name: "2026년 9월 근무표 등록됨, 다시 등록" })).toBeVisible();
    await expect(page.getByRole("button", { name: "2026년 10월 근무표 등록됨, 다시 등록" })).toBeVisible();
  });
}

test("dark capture of another month is rejected with the photo's own title", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-25T10:00:00+09:00"));
  await page.goto(BASE);
  await page.getByRole("button", { name: "근무표 등록하기" }).click();
  await page.getByRole("button", { name: "계속" }).click();
  const device = "17 Pro Max resolution class 440pt (1320×2868)";
  // Two September photos: the second one should be October.
  for (const i of [1, 2]) {
    await page.getByLabel(new RegExp(`${i}번째 사진 선택`)).setInputFiles({
      name: `sep-${i}.png`,
      mimeType: "image/png",
      buffer: await capture("09", device, "gray-keep-chips", "png"),
    });
  }
  await page.getByRole("button", { name: "근무표 분석하기" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("2번째 사진이 2026년 10월 화면이 아닌 것 같아요", { timeout: 30_000 });
  await expect(alert).toContainText("사진 속 제목은 2026.09로 보여요");
  expect(await storedMonths(page)).toEqual([]);
});
