import sharp from "sharp";
import { expect, it } from "vitest";
import { analyzeMonth, analyzePair, samePhoto } from "../src/lib/analyzer/analyze";
import { EXPECTED_MONTHS, EXPECTED_2026_09 } from "./expected";
import { REFLOW_LAYOUTS, reflowFixture } from "./reflowFixture";

async function raster(buffer: Buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}
for (const [name, layout] of Object.entries(REFLOW_LAYOUTS)) {
  it(`reflow ${name}: actual calendar bounds and unchanged glyph sizes`, async () => {
    const sep = await raster(await reflowFixture("09", layout));
    const oct = await raster(await reflowFixture("10", layout));
    const result = analyzePair(sep, oct, { year: 2026, month: 9 });
    expect(result.ok, JSON.stringify(result.ok ? {} : result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(Object.fromEntries(result.shifts.map(s => [s.date, s.shift]))).toEqual(EXPECTED_2026_09);
    expect(result.months[0].map(s => s.shift)).toEqual(EXPECTED_MONTHS["2026-09"]);
    expect(result.months[1].map(s => s.shift)).toEqual(EXPECTED_MONTHS["2026-10"]);
    expect(result.checks.map(c => c.status === "ok" && c.by)).toEqual(["title", "title"]);
    expect(result.diagnostics[0].grid.columnWidth).toBeCloseTo(layout.cellWidth, 0);
    expect(analyzeMonth(sep, { year: 2026, month: 12 }).ok).toBe(false);
    // January has the same calendar layout as October: its differing title must not auto-pass.
    const wrong = analyzeMonth(oct, { year: 2026, month: 1 });
    expect(wrong.ok && wrong.check.status === "ok").toBe(false);
  });
}
it("same calendar with different outside margins has the same fingerprint", async () => {
  const a = analyzeMonth(await raster(await reflowFixture("09", REFLOW_LAYOUTS["phone-tall"])), { year: 2026, month: 9 });
  const b = analyzeMonth(await raster(await reflowFixture("09", { ...REFLOW_LAYOUTS["phone-tall"], left: 400, right: 400, top: 600, bottom: 1000 })), { year: 2026, month: 9 });
  expect(a.ok && b.ok).toBe(true);
  if (a.ok && b.ok) expect(samePhoto(a.fingerprint, b.fingerprint)).toBe(true);
});

it("dark outside panels do not make a light calendar dark-mode", async () => {
  const buffer = await reflowFixture("09", REFLOW_LAYOUTS["phone-tall"]);
  const framed = await sharp(buffer).extend({ left: 1800, right: 1800, top: 0, bottom: 0, background: "black" }).png().toBuffer();
  const result = analyzeMonth(await raster(framed), { year: 2026, month: 9 });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.days.map(d => d.shift)).toEqual(EXPECTED_MONTHS["2026-09"]);
});
it("horizontal separator lists are not calendars", async () => {
  const lines = Array.from({ length: 6 }, (_, i) => `<path d="M20 ${200 + i * 180}H1000"/>`).join("");
  const image = Buffer.from(`<svg width="1100" height="1400"><rect width="1100" height="1400" fill="white"/><g stroke="#ededed">${lines}</g></svg>`);
  expect(analyzeMonth(await raster(await sharp(image).png().toBuffer()), { year: 2026, month: 9 }).ok).toBe(false);
});
it("a truncated wide calendar does not become a valid full month", async () => {
  const buffer = await reflowFixture("09", REFLOW_LAYOUTS["fold-wide"]);
  const truncated = await sharp(buffer).extract({ left: 0, top: 0, width: 1670, height: 1000 }).png().toBuffer();
  expect(analyzeMonth(await raster(truncated), { year: 2026, month: 9 }).ok).toBe(false);
});
for (const scale of [0.75, 1.3]) {
  it(`fold with glyph scale ${scale} and lower markers`, async () => {
    const image = await raster(await reflowFixture("09", { ...REFLOW_LAYOUTS["fold-wide"], glyphScale: scale, markerTop: 90 }));
    const result = analyzeMonth(image, { year: 2026, month: 9 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.days.map(d => d.shift)).toEqual(EXPECTED_MONTHS["2026-09"]);
  });
}
it("all-OFF wide calendar is recognized by actual red-label positions", async () => {
  const result = analyzeMonth(await raster(await reflowFixture("09", { ...REFLOW_LAYOUTS["fold-wide"], allOff: true, markerTop: 90 })), { year: 2026, month: 9 });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.days.map(d => d.shift)).toEqual(Array(30).fill("OFF"));
});
it("flat light-gray backgrounds and colored icons are not grid lines", async () => {
  const image = await raster(await sharp('public/icons/icon-512.png').png().toBuffer());
  expect(analyzeMonth(image, { year: 2026, month: 9 })).toMatchObject({ ok: false, kind: 'not-calendar' });
});
