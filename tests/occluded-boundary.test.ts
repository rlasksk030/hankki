import sharp from "sharp";
import { expect, it } from "vitest";
import { analyzeMonth } from "../src/lib/analyzer/analyze";
import { EXPECTED_MONTHS } from "./expected";

// Synthetic overlay on an already-public fixture, not a user's screenshot.
export async function coveredFixture(side: "left" | "right", oversized = false) {
  const radius = oversized ? 350 : 80;
  const cx = oversized ? 461 : side === "right" ? 823 : 100;
  const overlay = Buffer.from(`<svg width="923" height="2000"><circle cx="${cx}" cy="1730" r="${radius}" fill="#0080ff"/></svg>`);
  return sharp("tests/fixtures/deid-2026-09.png").composite([{ input: overlay }]).png().toBuffer();
}
for (const side of ["left", "right"] as const) {
  for (const width of [600, 923, 1440]) it(`partially hidden ${side} bottom edge at ${width}px still has five observed rows`, async () => {
    const { data, info } = await sharp(await coveredFixture(side)).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = analyzeMonth({ data, width: info.width, height: info.height }, { year: 2026, month: 9 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics.grid.rows).toBe(5);
      expect(result.days.map(d => d.shift)).toEqual(EXPECTED_MONTHS["2026-09"]);
      expect(result.check).toMatchObject({ status: "ok", by: "title" });
    }
  });
}
it("a mostly obscured last row is not invented from the selected month", async () => {
  const { data, info } = await sharp(await coveredFixture("right", true)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(analyzeMonth({ data, width: info.width, height: info.height }, { year: 2026, month: 9 }).ok).toBe(false);
});
