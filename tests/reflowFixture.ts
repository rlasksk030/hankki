// Test-only reflow: copy public fixture glyphs without stretching them as cells grow.
// Coordinates are independently measured from the 923×2000 September/October fixtures.
import sharp, { type OverlayOptions } from "sharp";
import { fileURLToPath } from "node:url";

export interface ReflowLayout { cellWidth: number; rowHeight: number; left: number; right: number; top: number; bottom: number; glyphScale?: number; markerTop?: number; allOff?: boolean }
export const REFLOW_LAYOUTS: Record<string, ReflowLayout> = {
  "phone-tall": { cellWidth: 132, rowHeight: 360, left: 0, right: 0, top: 220, bottom: 200 },
  "fold-wide": { cellWidth: 230, rowHeight: 220, left: 30, right: 30, top: 250, bottom: 200 },
  "landscape": { cellWidth: 260, rowHeight: 155, left: 20, right: 20, top: 180, bottom: 100 },
  "side-panel": { cellWidth: 132, rowHeight: 220, left: 650, right: 100, top: 300, bottom: 200 },
  "letterbox": { cellWidth: 132, rowHeight: 250, left: 350, right: 350, top: 250, bottom: 100 },
};
export async function reflowFixture(month: "09" | "10", layout: ReflowLayout): Promise<Buffer> {
  const source = fileURLToPath(new URL(`./fixtures/deid-2026-${month}.png`, import.meta.url));
  const { cellWidth: cw, rowHeight: rh, left, right, top, bottom } = layout;
  const width = left + 7 * cw + right;
  const height = top + 5 * rh + bottom;
  const pieces: OverlayOptions[] = [];
  const scale = layout.glyphScale ?? 1;
  // The title moves with the calendar, not with screenshot height/width.
  pieces.push({ input: await sharp(source).extract({ left: 105, top: 145, width: 235, height: 55 }).png().toBuffer(), left: left + 20, top: top - 110 });
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) {
      const sx = Math.round(c * (923 / 7));
      const sy = Math.round(264 + r * (1489 / 5));
      pieces.push({ input: await sharp(source).extract({ left: sx + 3, top: sy + 3, width: 42, height: 28 }).resize({ width: Math.round(42 * scale) }).png().toBuffer(), left: left + c * cw + 3, top: top + r * rh + 3 });
      pieces.push({ input: await sharp(source).extract({ left: (layout.allOff ? 396 : sx) + 28, top: (layout.allOff ? 264 : sy) + 35, width: 76, height: 65 }).resize({ width: Math.round(76 * scale) }).png().toBuffer(), left: left + c * cw + Math.round((cw - Math.round(76 * scale)) / 2), top: top + r * rh + (layout.markerTop ?? 35) });
    }
  }
  const lines: string[] = [];
  for (let r = 0; r <= 5; r++) lines.push(`<path d="M${left} ${top + r * rh}H${left + 7 * cw}"/>`);
  for (let c = 0; c <= 7; c++) lines.push(`<path d="M${left + c * cw} ${top}V${top + 5 * rh}"/>`);
  pieces.push({ input: Buffer.from(`<svg width="${width}" height="${height}"><g stroke="#ededed" stroke-width="1">${lines.join("")}</g></svg>`), left: 0, top: 0 });
  return sharp({ create: { width, height, channels: 4, background: "white" } }).composite(pieces).png().toBuffer();
}
