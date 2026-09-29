// Large local stress matrix (≈400 captures, several minutes). Not part of `npm test`/CI;
// run with `npm run test:analyzer:stress`. CI covers representative cases in
// theme-device.test.ts and capture-variants.test.ts.
// Inputs: public de-identified fixtures, re-laid-out per screen class, light + two SYNTHETIC dark variants,
// plus plain resizes. Every date is compared with the human-read answers.
import sharp from "sharp";
import { expect, it } from "vitest";
import { analyzeMonth } from "../src/lib/analyzer/analyze";
import { diagnose } from "../src/lib/analyzer/diagnostics";
import { analysisSize } from "../src/lib/analyzer/loadImage";
import type { Shift } from "../src/lib/settlement";
import { EXPECTED_MONTHS, EXPECTED_REAL_MONTHS } from "./expected";
import { DEVICE_CLASSES, rasterLikeBrowser, renderDeviceCapture, toSyntheticDark } from "./deviceLayout";

const enabled = process.env.npm_lifecycle_event === "test:analyzer:stress" || !!process.env.HANKKI_STRESS;
const MONTHS = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-08"];
const WIDTHS = [600, 640, 720, 750, 828, 900, 923, 945, 1080, 1125, 1170, 1179, 1206, 1242, 1284, 1290, 1320, 1440];
const expected = (id: string): Shift[] => (id === "2026-09" || id === "2026-10" ? EXPECTED_MONTHS[id] : EXPECTED_REAL_MONTHS[id]);

function check(img: Parameters<typeof analyzeMonth>[0], id: string, label: string, failures: string[]) {
  const [year, month] = id.split("-").map(Number);
  const r = analyzeMonth(img, { year, month });
  const ok = r.ok && r.check.status === "ok" && r.days.every((d, i) => d.shift === expected(id)[i]);
  if (!ok) failures.push(`${label} ${id}: ${JSON.stringify(diagnose(img, { year, month }))}`);
}

(enabled ? it : it.skip)("stress: screen classes × themes × months, and resize widths × months", async () => {
  const failures: string[] = [];
  for (const [device, spec] of Object.entries(DEVICE_CLASSES)) {
    for (const id of MONTHS) {
      const [year, month] = id.split("-").map(Number);
      const light = await renderDeviceCapture(`deid-${id}.png`, { year, month }, spec);
      for (const theme of ["light", "black-inverted", "gray-keep-chips"] as const) {
        const buffer = theme === "light" ? light : await toSyntheticDark(light, theme);
        check(await rasterLikeBrowser(buffer, analysisSize), id, `${device} ${theme}`, failures);
      }
    }
  }
  for (const width of WIDTHS) {
    for (const id of MONTHS) {
      const buffer = await sharp(`tests/fixtures/deid-${id}.png`).resize({ width }).png().toBuffer();
      check(await rasterLikeBrowser(buffer, analysisSize), id, `resize ${width}px`, failures);
    }
  }
  expect(failures).toEqual([]);
}, 1_800_000);
