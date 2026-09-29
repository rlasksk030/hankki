// ACTUAL 오늘근무 dark-theme screenshots (iPhone, 1188×2576) supplied by the user.
// - deid-dark-*.png: public de-identified copies (scripts/deidentify-fixtures.mjs: status bar and
//   per-day labels painted black). Run everywhere, including CI.
// - private/dark-*.png: the originals, gitignored, run only where they exist.
// Expected shifts were read by a person from the screenshots (they equal tests/expected.ts:
// 2026-09/10 EXPECTED_MONTHS, 2026-12 EXPECTED_REAL_MONTHS), never copied from analyzer output.
//
// Real dark palette (measured): black background, 2px grey (~20) grid, white dates, shift circles in
// the same colours as the light theme (C = rgb(66,66,66): contrast only 0.26 on black), navy
// (10,45,84) "today" fill over the whole cell, very dim circles for adjacent months.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import { analyzeMonth, analyzePair } from "../src/lib/analyzer/analyze";
import { diagnose } from "../src/lib/analyzer/diagnostics";
import { analysisSize } from "../src/lib/analyzer/loadImage";
import type { RasterImage } from "../src/lib/analyzer/pixels";
import { countShifts, createSettlement, type Shift } from "../src/lib/settlement";
import { rasterLikeBrowser } from "./deviceLayout";
import { EXPECTED_2026_09, EXPECTED_MONTHS, EXPECTED_REAL_MONTHS } from "./expected";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const MONTHS = [
  { id: "2026-09", ym: { year: 2026, month: 9 }, expected: EXPECTED_MONTHS["2026-09"] },
  { id: "2026-10", ym: { year: 2026, month: 10 }, expected: EXPECTED_MONTHS["2026-10"] },
  { id: "2026-12", ym: { year: 2026, month: 12 }, expected: EXPECTED_REAL_MONTHS["2026-12"] },
];
const tally = (s: Shift[]) => ({ A: s.filter((x) => x === "A").length, B: s.filter((x) => x === "B").length, C: s.filter((x) => x === "C").length, OFF: s.filter((x) => x === "OFF").length });

async function load(path: string, transform?: (s: Sharp) => Sharp): Promise<RasterImage> {
  let pipeline = sharp(path);
  if (transform) pipeline = transform(pipeline);
  return rasterLikeBrowser(await pipeline.png().toBuffer(), analysisSize);
}

for (const set of [
  { name: "de-identified public copy", file: (id: string) => fixture(`deid-dark-${id}.png`) },
  { name: "private original (local only)", file: (id: string) => fixture(`private/dark-${id}.png`) },
]) {
  const available = MONTHS.every((m) => existsSync(set.file(m.id)));
  describe(`actual dark-theme screenshot: ${set.name}`, () => {
    if (!available) {
      it.skip("files not present", () => {});
      return;
    }
    for (const m of MONTHS) {
      it(`${m.id}: every day matches, title verified, no uncertain day`, async () => {
        const img = await load(set.file(m.id));
        const r = analyzeMonth(img, m.ym);
        expect(r.ok, JSON.stringify(diagnose(img, m.ym))).toBe(true);
        if (!r.ok) return;
        expect(r.days.map((d) => d.shift)).toEqual(m.expected);
        expect(tally(r.days.map((d) => d.shift))).toEqual(tally(m.expected));
        expect(r.check).toMatchObject({ status: "ok", by: "title" });
        expect(r.days.filter((d) => d.confidence < 0.7)).toEqual([]);
      });
    }

    it("September + October pair: A6 B11 C6, 23 work days, 7 meals", async () => {
      const r = analyzePair(await load(set.file("2026-09")), await load(set.file("2026-10")), { year: 2026, month: 9 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(Object.fromEntries(r.shifts.map((s) => [s.date, s.shift]))).toEqual(EXPECTED_2026_09);
      const s = createSettlement({ year: 2026, month: 9 }, r.shifts);
      expect(countShifts(s.shifts)).toMatchObject({ A: 6, B: 11, C: 6 });
      expect([s.workDays, s.mealAllowance]).toEqual([23, 7]);
      expect(r.checks.map((c) => c.status === "ok" && c.by)).toEqual(["title", "title"]);
    });

    it("the navy today fill is background: 2026-09-30 stays C, not B", async () => {
      const r = analyzeMonth(await load(set.file("2026-09")), { year: 2026, month: 9 });
      expect(r.ok && r.days[29]).toMatchObject({ date: "2026-09-30", shift: "C" });
    });

    it("a highlighted cell in the first week (October) does not hide the top boundary", async () => {
      const r = analyzeMonth(await load(set.file("2026-10")), { year: 2026, month: 10 });
      expect(r.ok && r.diagnostics.grid.rows).toBe(5);
    });

    it("other month selected: rejected with the photo's own title", async () => {
      expect(analyzeMonth(await load(set.file("2026-09")), { year: 2026, month: 12 })).toMatchObject({
        ok: false,
        kind: "month-mismatch",
        title: "2026.09",
      });
      expect(analyzeMonth(await load(set.file("2026-12")), { year: 2026, month: 10 })).toMatchObject({ ok: false, kind: "month-mismatch" });
    });

    it("resized, JPEG and WebP copies read the same days", async () => {
      const variants: Array<[string, (s: Sharp) => Sharp]> = [
        ["600px", (s) => s.resize({ width: 600 })],
        ["923px", (s) => s.resize({ width: 923 })],
        ["1320px", (s) => s.resize({ width: 1320 })],
        ["JPEG 80", (s) => s.jpeg({ quality: 80 })],
        ["WebP 75", (s) => s.webp({ quality: 75 })],
      ];
      for (const m of MONTHS) {
        for (const [name, transform] of variants) {
          const img = await load(set.file(m.id), transform);
          const r = analyzeMonth(img, m.ym);
          expect(r.ok, `${m.id} ${name}: ${JSON.stringify(diagnose(img, m.ym))}`).toBe(true);
          if (r.ok) expect(r.days.map((d) => d.shift), `${m.id} ${name}`).toEqual(m.expected);
        }
      }
    }, 120_000);
  });
}

it("light and actual dark captures mix in one registration (each photo judged on its own)", async () => {
  const lightSep = await load(fixture("deid-2026-09.png"));
  const darkOct = await load(fixture("deid-dark-2026-10.png"));
  const darkSep = await load(fixture("deid-dark-2026-09.png"));
  const lightOct = await load(fixture("deid-2026-10.png"));
  for (const [a, b, label] of [[lightSep, darkOct, "light+dark"], [darkSep, lightOct, "dark+light"]] as const) {
    const r = analyzePair(a, b, { year: 2026, month: 9 });
    expect(r.ok, label).toBe(true);
    if (r.ok) expect(Object.fromEntries(r.shifts.map((s) => [s.date, s.shift])), label).toEqual(EXPECTED_2026_09);
  }
});
