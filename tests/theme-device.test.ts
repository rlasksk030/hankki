// Screen-class and theme regression.
// Inputs are generated from public de-identified fixtures (tests/deviceLayout.ts):
// - "resolution class" captures are re-laid-out fixtures, NOT screenshots taken on those phones.
// - dark captures are SYNTHETIC polarity transforms, NOT the real 오늘근무 dark palette.
// Every case compares every date's shift with the human-read answers in tests/expected.ts.
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });
import { analyzeMonth, analyzePair } from "../src/lib/analyzer/analyze";
import { analysisSize } from "../src/lib/analyzer/loadImage";
import { verifyTitle } from "../src/lib/analyzer/title";
import type { RasterImage } from "../src/lib/analyzer/pixels";
import { countShifts, createSettlement, type Shift } from "../src/lib/settlement";
import { EXPECTED_2026_09, EXPECTED_MONTHS, EXPECTED_REAL_MONTHS } from "./expected";
import { type DarkVariant, DEVICE_CLASSES, rasterLikeBrowser, renderDeviceCapture, toSyntheticDark } from "./deviceLayout";

type Theme = "light" | DarkVariant;
const SEP = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };
const expectedFor = (id: string): Shift[] => (id === "2026-09" || id === "2026-10" ? EXPECTED_MONTHS[id] : EXPECTED_REAL_MONTHS[id]);
const counts = (shifts: Shift[]) => ({
  A: shifts.filter((s) => s === "A").length,
  B: shifts.filter((s) => s === "B").length,
  C: shifts.filter((s) => s === "C").length,
  OFF: shifts.filter((s) => s === "OFF").length,
});

async function capture(month: string, device: string, theme: Theme): Promise<RasterImage> {
  const [year, m] = month.split("-").map(Number);
  let buffer = await renderDeviceCapture(`deid-${month}.png`, { year, month: m }, DEVICE_CLASSES[device]);
  if (theme !== "light") buffer = await toSyntheticDark(buffer, theme);
  return rasterLikeBrowser(buffer, analysisSize);
}

function expectPeriod(result: ReturnType<typeof analyzePair>, label: string) {
  expect(result.ok, `${label}: ${JSON.stringify(result.ok ? {} : { kind: result.kind, photo: result.photo })}`).toBe(true);
  if (!result.ok) return;
  expect(Object.fromEntries(result.shifts.map((s) => [s.date, s.shift])), label).toEqual(EXPECTED_2026_09);
  expect(result.months[0].map((d) => d.shift), label).toEqual(EXPECTED_MONTHS["2026-09"]);
  expect(result.months[1].map((d) => d.shift), label).toEqual(EXPECTED_MONTHS["2026-10"]);
  expect(result.checks.map((c) => c.status === "ok" && c.by), label).toEqual(["title", "title"]);
  expect(result.shifts.filter((s) => s.confidence < 0.7), label).toEqual([]);
  const settlement = createSettlement(SEP, result.shifts);
  expect(countShifts(settlement.shifts), label).toMatchObject({ A: 6, B: 11, C: 6 });
  expect([settlement.workDays, settlement.mealAllowance], label).toEqual([23, 7]);
}

describe("screen-size classes (re-laid-out public fixture, light theme)", () => {
  for (const device of Object.keys(DEVICE_CLASSES)) {
    it(`${device}: September + October read all 30 settlement days`, async () => {
      expectPeriod(analyzePair(await capture("2026-09", device, "light"), await capture("2026-10", device, "light"), SEP), device);
    });
  }
});

describe("synthetic dark theme (polarity independence; not the real app palette)", () => {
  const devices = ["standard (1179×2556)", "17 Pro Max resolution class 440pt (1320×2868)", "android FHD (1080×2400)", "small-2x (SE class, 750×1334)"];
  for (const theme of ["black-inverted", "gray-keep-chips"] as const) {
    for (const device of devices) {
      it(`${theme} ${device}: all 30 settlement days, title verified`, async () => {
        expectPeriod(analyzePair(await capture("2026-09", device, theme), await capture("2026-10", device, theme), SEP), `${theme} ${device}`);
      });
    }
  }

  it("dark theme title polarity still reads YYYY.MM (every public month, 1320px class)", async () => {
    for (const month of Object.keys(EXPECTED_REAL_MONTHS).concat(["2026-09", "2026-10"])) {
      const [year, m] = month.split("-").map(Number);
      const img = await capture(month, "17 Pro Max resolution class 440pt (1320×2868)", "gray-keep-chips");
      expect(verifyTitle(img, { year, month: m }), month).toEqual({ kind: "match", text: `${year}.${String(m).padStart(2, "0")}` });
      const r = analyzeMonth(img, { year, month: m });
      expect(r.ok, month).toBe(true);
      if (!r.ok) continue;
      expect(r.days.map((d) => d.shift), month).toEqual(expectedFor(month));
      expect(counts(r.days.map((d) => d.shift)), month).toEqual(counts(expectedFor(month)));
      expect(r.check, month).toMatchObject({ status: "ok", by: "title" });
    }
  }, 120_000);

  it("6-week months (2027.01, 2027.05) in dark theme keep six observed rows", async () => {
    for (const month of ["2027-01", "2027-05"]) {
      const [year, m] = month.split("-").map(Number);
      const r = analyzeMonth(await capture(month, "android QHD (1440×3120)", "black-inverted"), { year, month: m });
      expect(r.ok, month).toBe(true);
      if (!r.ok) continue;
      expect(r.diagnostics.grid.rows, month).toBe(6);
      expect(r.days.map((d) => d.shift), month).toEqual(expectedFor(month));
    }
  });

  it("each photo is analysed on its own: light + dark and dark + light pairs", async () => {
    const device = "17 Pro Max resolution class 440pt (1320×2868)";
    expectPeriod(analyzePair(await capture("2026-09", device, "light"), await capture("2026-10", device, "gray-keep-chips"), SEP), "light+dark");
    expectPeriod(analyzePair(await capture("2026-09", device, "black-inverted"), await capture("2026-10", device, "light"), SEP), "dark+light");
    // order swapped by the user is still corrected with mixed themes
    const swapped = analyzePair(await capture("2026-10", device, "light"), await capture("2026-09", device, "gray-keep-chips"), SEP);
    expect(swapped.ok && swapped.swapped).toBe(true);
  });

  it("dark capture of another month is rejected with the photo's own title", async () => {
    const r = analyzeMonth(await capture("2026-09", "standard (1179×2556)", "gray-keep-chips"), { year: 2026, month: 12 });
    expect(r).toMatchObject({ ok: false, kind: "month-mismatch", title: "2026.09" });
    const r2 = analyzeMonth(await capture("2026-10", "standard (1179×2556)", "black-inverted"), { year: 2026, month: 1 });
    expect(r2.ok && r2.check.status === "ok").toBe(false);
  });

  it("a uniformly dark image is not a calendar (dark is not an excuse to guess)", () => {
    const dark: RasterImage = { width: 400, height: 860, data: new Uint8Array(400 * 860 * 4).fill(20) };
    expect(analyzeMonth(dark, SEP)).toMatchObject({ ok: false, kind: "not-calendar" });
    expect(analyzePair(dark, dark, SEP)).toMatchObject({ ok: false, kind: "not-calendar" });
  });
});

it("October keeps working in both themes as a single-month registration", async () => {
  for (const theme of ["light", "black-inverted", "gray-keep-chips"] as const) {
    const r = analyzeMonth(await capture("2026-10", "pro-max 430pt (1290×2796)", theme), OCT);
    expect(r.ok, theme).toBe(true);
    if (r.ok) expect(r.days.map((d) => d.shift), theme).toEqual(EXPECTED_MONTHS["2026-10"]);
  }
});
