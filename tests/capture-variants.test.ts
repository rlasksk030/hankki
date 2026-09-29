// Metamorphic regression: the same calendar must give the same shifts after ordinary capture
// differences (scale, format, margins, small overlays, colour shifts), and must NOT turn into a
// confident schedule when the evidence is gone (blur, heavy crop, hidden last row, other tables).
// Inputs derive from public de-identified fixtures only. "synthetic" / "transformed" are labelled.
import sharp, { type Sharp } from "sharp";
import { describe, expect, it, vi } from "vitest";
import { analyzeMonth } from "../src/lib/analyzer/analyze";
import { diagnose } from "../src/lib/analyzer/diagnostics";
import { analysisSize } from "../src/lib/analyzer/loadImage";
import type { RasterImage } from "../src/lib/analyzer/pixels";
import type { Shift } from "../src/lib/settlement";
import { EXPECTED_MONTHS } from "./expected";
import {
  DEVICE_CLASSES,
  deviceGrid,
  rasterLikeBrowser,
  renderDeviceCapture,
  syntheticMonth,
  toSyntheticDark,
} from "./deviceLayout";

vi.setConfig({ testTimeout: 60_000 });

const SEP = { year: 2026, month: 9 };
const STANDARD = DEVICE_CLASSES["standard (1179×2556)"];
const PRO_MAX_1320 = DEVICE_CLASSES["17 Pro Max resolution class 440pt (1320×2868)"];
const ANDROID_FHD = DEVICE_CLASSES["android FHD (1080×2400)"];
const september = EXPECTED_MONTHS["2026-09"];

const tally = (s: Shift[]) => ({ A: s.filter((x) => x === "A").length, B: s.filter((x) => x === "B").length, C: s.filter((x) => x === "C").length, OFF: s.filter((x) => x === "OFF").length });
const raster = (buffer: Buffer) => rasterLikeBrowser(buffer, analysisSize);

function expectSeptember(img: RasterImage, label: string, expected: Shift[] = september, ym = SEP) {
  const r = analyzeMonth(img, ym);
  expect(r.ok, `${label}: ${JSON.stringify(diagnose(img, ym))}`).toBe(true);
  if (!r.ok) return;
  const read = r.days.map((d) => d.shift);
  expect(read, label).toEqual(expected);
  expect(tally(read), label).toEqual(tally(expected));
  expect(r.check, label).toMatchObject({ status: "ok", by: "title" });
  expect(r.days.filter((d) => d.confidence < 0.7), label).toEqual([]);
}

/** Never a confident wrong schedule: either rejected, or every day correct. */
function expectNoConfidentWrongRead(img: RasterImage, label: string, mustReject = true) {
  const r = analyzeMonth(img, SEP);
  if (mustReject) expect(r.ok, `${label}: ${JSON.stringify(diagnose(img, SEP))}`).toBe(false);
  if (r.ok) expect(r.days.map((d) => d.shift), label).toEqual(september);
}

describe("scale (transformed standard 1179px capture)", () => {
  for (const percent of [50, 60, 67, 75, 80, 100, 125, 150]) {
    it(`${percent}% scale preserves all 30 shifts`, async () => {
      const base = await renderDeviceCapture("deid-2026-09.png", SEP, STANDARD);
      const width = Math.round(1179 * (percent / 100));
      expectSeptember(await raster(await sharp(base).resize({ width }).png().toBuffer()), `${percent}%`);
    });
  }
});

describe("image formats (1320px and Android FHD class, light and synthetic dark)", () => {
  const formats = [
    ["png", {}],
    ["jpeg", { quality: 95 }],
    ["jpeg", { quality: 80 }],
    ["jpeg", { quality: 60 }],
    ["webp", { quality: 90 }],
    ["webp", { quality: 70 }],
  ] as const;
  for (const [device, spec] of [["1320px class", PRO_MAX_1320], ["android FHD", ANDROID_FHD]] as const) {
    for (const dark of [false, true]) {
      it(`${device} ${dark ? "dark" : "light"}: PNG / JPEG 95·80·60 / WebP 90·70 read the same 30 shifts`, async () => {
        let base = await renderDeviceCapture("deid-2026-09.png", SEP, spec);
        if (dark) base = await toSyntheticDark(base, "gray-keep-chips");
        for (const [format, options] of formats) {
          const encoded = await sharp(base).toFormat(format, options).toBuffer();
          expectSeptember(await raster(encoded), `${device} ${dark ? "dark" : "light"} ${format} ${JSON.stringify(options)}`);
        }
      });
    }
  }
});

describe("margins around the calendar (status bars, app versions)", () => {
  for (const [side, amount] of [["top", 50], ["top", 100], ["top", 150], ["top", 300], ["bottom", 50], ["bottom", 100], ["bottom", 150], ["bottom", 300]] as const) {
    it(`${side} +${amount}px`, async () => {
      const base = await renderDeviceCapture("deid-2026-09.png", SEP, STANDARD);
      expectSeptember(await raster(await sharp(base).extend({ [side]: amount, background: "#ffffff" }).png().toBuffer()), `${side}${amount}`);
    });
  }
  it("small light and dark side margins", async () => {
    const base = await renderDeviceCapture("deid-2026-09.png", SEP, STANDARD);
    expectSeptember(await raster(await sharp(base).extend({ left: 24, right: 24, background: "#f2f2f7" }).png().toBuffer()), "light sides");
    const dark = await toSyntheticDark(base, "black-inverted");
    expectSeptember(await raster(await sharp(dark).extend({ left: 24, right: 40, top: 120, background: "#1c1c1e" }).png().toBuffer()), "dark sides");
  });
});

describe("small floating overlays on the final boundary", () => {
  const shapes = {
    "bottom-right circle": (g: ReturnType<typeof deviceGrid>) => `<circle cx="${g.W - g.cw * 0.6}" cy="${g.gridBottom}" r="${g.cw * 0.45}" fill="#0080ff"/>`,
    "bottom-left circle": (g: ReturnType<typeof deviceGrid>) => `<circle cx="${g.cw * 0.6}" cy="${g.gridBottom}" r="${g.cw * 0.45}" fill="#0080ff"/>`,
    "bottom-center circle": (g: ReturnType<typeof deviceGrid>) => `<circle cx="${g.W / 2}" cy="${g.gridBottom}" r="${g.cw * 0.45}" fill="#333333"/>`,
    "bottom-center rounded rectangle": (g: ReturnType<typeof deviceGrid>) =>
      `<rect x="${g.W * 0.35}" y="${g.gridBottom - g.rh * 0.12}" width="${g.W * 0.3}" height="${g.rh * 0.3}" rx="${g.rh * 0.1}" fill="#e9e9ee"/>`,
  };
  for (const [name, shape] of Object.entries(shapes)) {
    it(`partial ${name} does not remove the final observed row`, async () => {
      const g = deviceGrid(PRO_MAX_1320, 5);
      const overlay = Buffer.from(`<svg width="${g.W}" height="${g.H}">${shape(g)}</svg>`);
      const base = await renderDeviceCapture("deid-2026-09.png", SEP, PRO_MAX_1320);
      const img = await raster(await sharp(base).composite([{ input: overlay }]).png().toBuffer());
      expectSeptember(img, name);
      const r = analyzeMonth(img, SEP);
      expect(r.ok && r.diagnostics.grid.rows).toBe(5);
    });
  }
  it("mostly hidden final row is rejected instead of inferred (wide bottom sheet)", async () => {
    const g = deviceGrid(PRO_MAX_1320, 5);
    const sheet = `<rect x="${g.W * 0.04}" y="${g.gridBottom - g.rh * 0.8}" width="${g.W * 0.92}" height="${g.rh * 1.2}" rx="60" fill="#f4f4f6"/>`;
    const base = await renderDeviceCapture("deid-2026-09.png", SEP, PRO_MAX_1320);
    const img = await raster(await sharp(base).composite([{ input: Buffer.from(`<svg width="${g.W}" height="${g.H}">${sheet}</svg>`) }]).png().toBuffer());
    expectNoConfidentWrongRead(img, "bottom sheet");
  });
});

describe("colour and tone shifts (screenshot pipelines, colour profiles)", () => {
  const variants: Array<[string, (s: Sharp) => Sharp]> = [
    // Brightening further clips the ≈235 grey hairlines into the 255 background: the grid is then
    // really gone from the pixels, so that case is not expected to pass.
    ["brightness +5%", (s) => s.modulate({ brightness: 1.05 })],
    ["brightness -10%", (s) => s.modulate({ brightness: 0.9 })],
    ["contrast +15%", (s) => s.linear(1.15, -0.15 * 128)],
    ["contrast -15%", (s) => s.linear(0.85, 0.15 * 128)],
    ["saturation 80% (Display-P3 values read as sRGB)", (s) => s.modulate({ saturation: 0.8 })],
  ];
  for (const [name, apply] of variants) {
    for (const dark of [false, true]) {
      it(`${name} (${dark ? "synthetic dark" : "light"})`, async () => {
        let base = await renderDeviceCapture("deid-2026-09.png", SEP, PRO_MAX_1320);
        if (dark) base = await toSyntheticDark(base, "black-inverted");
        expectSeptember(await raster(await apply(sharp(base)).png().toBuffer()), name);
      });
    }
  }
});

describe("4-week month (SYNTHETIC 2026.02: Sunday start, 28 days, exactly four rows)", () => {
  const shifts = "A,A,OFF,OFF,B,B,B,B,B,B,OFF,OFF,C,C,C,C,C,C,OFF,OFF,A,A,A,A,A,A,OFF,OFF".split(",") as Shift[];
  const FEB = { year: 2026, month: 2 };
  for (const dark of [false, true]) {
    it(`synthetic 4-row ${dark ? "dark" : "light"} month keeps four observed rows and all 28 shifts`, async () => {
      let buffer = await renderDeviceCapture("deid-2026-09.png", SEP, ANDROID_FHD, syntheticMonth(FEB, shifts as never, 0));
      if (dark) buffer = await toSyntheticDark(buffer, "gray-keep-chips");
      const img = await raster(buffer);
      expectSeptember(img, "feb", shifts, FEB);
      const r = analyzeMonth(img, FEB);
      expect(r.ok && r.diagnostics.grid.rows).toBe(4);
      // 2026.02 and 2027.02 are different titles; a 4-row layout alone never auto-passes another month
      const other = analyzeMonth(img, { year: 2027, month: 2 });
      expect(other.ok && other.check.status === "ok").toBe(false);
    });
  }
});

describe("evidence is missing → never a confident wrong schedule", () => {
  it("heavily blurred capture is rejected", async () => {
    const base = await renderDeviceCapture("deid-2026-09.png", SEP, STANDARD);
    expectNoConfidentWrongRead(await raster(await sharp(base).blur(12).png().toBuffer()), "blur");
  });
  it("extreme JPEG compression is either rejected or read exactly", async () => {
    const base = await renderDeviceCapture("deid-2026-09.png", SEP, STANDARD);
    const tiny = await sharp(base).resize({ width: 400 }).jpeg({ quality: 5 }).toBuffer();
    expectNoConfidentWrongRead(await raster(tiny), "jpeg q5", false);
  });
  it("only the top half of the calendar is rejected (major crop)", async () => {
    const base = await renderDeviceCapture("deid-2026-09.png", SEP, PRO_MAX_1320);
    expectNoConfidentWrongRead(await raster(await sharp(base).extract({ left: 0, top: 0, width: 1320, height: 1500 }).png().toBuffer()), "top half");
  });
  it("side columns cut off are rejected", async () => {
    const base = await renderDeviceCapture("deid-2026-09.png", SEP, PRO_MAX_1320);
    expectNoConfidentWrongRead(await raster(await sharp(base).extract({ left: 0, top: 0, width: 900, height: 2868 }).png().toBuffer()), "left 5 columns");
  });
  it("capture rotated to landscape is rejected", async () => {
    const base = await renderDeviceCapture("deid-2026-09.png", SEP, STANDARD);
    expectNoConfidentWrongRead(await raster(await sharp(base).rotate(90).png().toBuffer()), "rotated");
  });
  it("a seven-column table without shift markers is not a schedule (light and dark)", async () => {
    const cells: string[] = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) cells.push(`<text x="${c * 160 + 12}" y="${300 + r * 360 + 40}" font-size="34" font-family="sans-serif">${r * 7 + c + 1}</text>`);
    const lines: string[] = [];
    for (let r = 0; r <= 5; r++) lines.push(`<rect x="0" y="${260 + r * 360}" width="1120" height="1"/>`);
    for (let c = 1; c < 7; c++) lines.push(`<rect x="${c * 160}" y="260" width="1" height="1800"/>`);
    const svg = `<svg width="1120" height="2300"><rect width="1120" height="2300" fill="white"/><g fill="#e5e5e5">${lines.join("")}</g><g fill="#222">${cells.join("")}</g></svg>`;
    const light = await sharp(Buffer.from(svg)).png().toBuffer();
    expectNoConfidentWrongRead(await raster(light), "table light");
    expectNoConfidentWrongRead(await raster(await toSyntheticDark(light, "black-inverted")), "table dark");
  });
  it("low-contrast grey circles are never silently read as OFF", async () => {
    // Replace every C circle of the public 2026.09 fixture with a weak grey disc (contrast ≈0.14, no red 휴 label):
    // weaker than any real shift circle (C is 0.74 on white, 0.26 on black) but clearly not empty.
    const cw = 923 / 7, rh = 1489 / 5;
    const discs: string[] = [];
    september.forEach((shift, i) => {
      if (shift !== "C") return;
      const index = i + 2; // September 2026 starts on Tuesday
      const cx = (index % 7) * cw + 66, cy = 264 + Math.floor(index / 7) * rh + 65.4;
      discs.push(`<circle cx="${cx}" cy="${cy}" r="28" fill="#dcdcdc"/>`);
    });
    const overlay = Buffer.from(`<svg width="923" height="2000">${discs.join("")}</svg>`);
    const img = await raster(await sharp("tests/fixtures/deid-2026-09.png").composite([{ input: overlay }]).png().toBuffer());
    const r = analyzeMonth(img, SEP);
    const days = r.ok ? r.days : (r.days ?? []);
    const faded = days.filter((_, i) => september[i] === "C");
    expect(faded.length).toBe(9);
    for (const day of faded) expect(day.shift === "C" || day.confidence < 0.5, `${day.date} ${day.shift} ${day.confidence}`).toBe(true);
    expect(r.ok).toBe(false);
  });
});
