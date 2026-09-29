// Test-only generators (never used by the app).
//
// 1. renderDeviceCapture: re-lays the public de-identified fixture out the way a phone with a
//    different screen size draws the same app. Real devices do NOT simply resize a screenshot:
//    text, shift circles and the title keep their size in points (pt) while the seven columns
//    stretch to the screen width and the week rows stretch to the remaining height.
//    So each glyph/marker is copied at the device's pixel density and anchored like the app does
//    (date: cell top-left, marker: horizontal centre, title: left, icons: right).
// 2. toSyntheticDark: turns a light capture into a dark-theme capture for polarity tests.
//    This is NOT the real 오늘근무 dark palette (no actual dark screenshot is available);
//    it only checks that the analyzer does not depend on "light background, dark text".
//
// Source geometry is measured from the 923×2000 fixtures (a 393×852pt screen, 2.3486 px/pt).
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";
import { calendarRows } from "../src/lib/dates";

const SOURCE_WIDTH = 923;
const SOURCE_PX_PER_PT = SOURCE_WIDTH / 393;
const SOURCE_SAFE_TOP_PT = 59;
const SOURCE_SAFE_BOTTOM_PT = 34;
const SRC = { gridTop: 264, gridBottom: 1753, headerTop: 128, headerBottom: 218, weekdayTop: 234, weekdayBottom: 262 };
const SRC_CELL_WIDTH = SOURCE_WIDTH / 7;
const SRC_MARKER = { x: 66, y: 65.4, box: 74 };
const SRC_DATE = { x: 2, y: 3, width: 46, height: 28 };

export interface DeviceClass {
  /** screen size in points and device pixel ratio */
  widthPt: number;
  heightPt: number;
  scale: number;
  safeTopPt: number;
  safeBottomPt: number;
  /** grid line thickness in device pixels (hairline = 1) */
  lineWidth?: number;
}

// Representative screen classes. These are TEST inputs only; the analyzer never sees a device name.
export const DEVICE_CLASSES: Record<string, DeviceClass> = {
  "small-2x (SE class, 750×1334)": { widthPt: 375, heightPt: 667, scale: 2, safeTopPt: 20, safeBottomPt: 0 },
  "mini (1125×2436)": { widthPt: 375, heightPt: 812, scale: 3, safeTopPt: 50, safeBottomPt: 34 },
  "standard (1179×2556)": { widthPt: 393, heightPt: 852, scale: 3, safeTopPt: 59, safeBottomPt: 34 },
  "pro-max 430pt (1290×2796)": { widthPt: 430, heightPt: 932, scale: 3, safeTopPt: 59, safeBottomPt: 34 },
  "17 Pro Max resolution class 440pt (1320×2868)": { widthPt: 440, heightPt: 956, scale: 3, safeTopPt: 62, safeBottomPt: 34 },
  "android HD (720×1600)": { widthPt: 360, heightPt: 800, scale: 2, safeTopPt: 24, safeBottomPt: 16, lineWidth: 1 },
  "android FHD (1080×2400)": { widthPt: 1080 / 2.625, heightPt: 2400 / 2.625, scale: 2.625, safeTopPt: 28, safeBottomPt: 20, lineWidth: 2 },
  "android QHD (1440×3120)": { widthPt: 1440 / 3.5, heightPt: 3120 / 3.5, scale: 3.5, safeTopPt: 28, safeBottomPt: 20, lineWidth: 3 },
};

const fixturePath = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function piece(source: string, left: number, top: number, width: number, height: number, k: number): Promise<Buffer> {
  return sharp(source)
    .extract({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) })
    .resize({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), kernel: "lanczos3" })
    .png()
    .toBuffer();
}

/** Pixel geometry of the calendar in a re-laid-out capture (used to place test overlays). */
export function deviceGrid(device: DeviceClass, rows: number) {
  const k = device.scale / SOURCE_PX_PER_PT; // source px → target px for fixed-size (pt) content
  const W = Math.round(device.widthPt * device.scale);
  const H = Math.round(device.heightPt * device.scale);
  const dy = (device.safeTopPt - SOURCE_SAFE_TOP_PT) * device.scale; // shift of everything anchored to the top
  const gridTop = Math.round(SRC.gridTop * k + dy);
  const bottomInset = ((2000 - SRC.gridBottom) / SOURCE_PX_PER_PT - SOURCE_SAFE_BOTTOM_PT + device.safeBottomPt) * device.scale;
  const gridBottom = Math.round(H - bottomInset);
  return { k, W, H, dy, gridTop, gridBottom, cw: W / 7, rh: (gridBottom - gridTop) / rows };
}

/** Where each target cell takes its date number and its marker from (source row/column in the fixture). */
export interface SyntheticMonth {
  ym: { year: number; month: number };
  cell: (row: number, column: number) => { date: [number, number]; marker: [number, number] };
  /** title glyphs: source x-range in the fixture title → target x (fixture px) */
  title: Array<{ from: [number, number]; to: number }>;
}

/** Re-render a public fixture month as another screen class would draw it (light theme PNG). */
export async function renderDeviceCapture(
  file: string,
  ym: { year: number; month: number },
  device: DeviceClass,
  synthetic?: SyntheticMonth,
): Promise<Buffer> {
  const source = fixturePath(file);
  const sourceRows = calendarRows(ym.year, ym.month);
  const target = synthetic?.ym ?? ym;
  const rows = calendarRows(target.year, target.month);
  const { k, W, H, dy, gridTop, gridBottom, cw, rh } = deviceGrid(device, rows);
  const srcRh = (SRC.gridBottom - SRC.gridTop) / sourceRows;
  const pieces: OverlayOptions[] = [];
  const place = (input: Buffer, left: number, top: number) => pieces.push({ input, left: Math.round(left), top: Math.round(top) });
  // Each cell first gets its source cell's surface colour: a highlighted "today" cell is filled
  // edge to edge in the real app (both themes), not only behind the copied glyph pieces.
  const raw = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const surfaceOf = ([sr, sc]: [number, number]) => {
    const counts = new Map<string, number>();
    const x0 = Math.round(sc * SRC_CELL_WIDTH + 8), y0 = Math.round(SRC.gridTop + sr * srcRh + 8);
    for (let y = y0; y < y0 + srcRh - 16; y += 3) {
      for (let x = x0; x < x0 + SRC_CELL_WIDTH - 16; x += 3) {
        const i = (y * raw.info.width + x) * 4;
        const key = `${raw.data[i]},${raw.data[i + 1]},${raw.data[i + 2]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const fills: string[] = [];

  // Header: menu + title anchored left, action icons anchored right.
  if (synthetic) {
    place(await piece(source, 0, SRC.headerTop, 105, SRC.headerBottom - SRC.headerTop, k), 0, SRC.headerTop * k + dy);
    for (const g of synthetic.title) {
      const input = await piece(source, g.from[0], SRC.headerTop, g.from[1] - g.from[0], SRC.headerBottom - SRC.headerTop, k);
      place(input, g.to * k, SRC.headerTop * k + dy);
    }
  } else {
    place(await piece(source, 0, SRC.headerTop, 360, SRC.headerBottom - SRC.headerTop, k), 0, SRC.headerTop * k + dy);
  }
  place(await piece(source, 610, SRC.headerTop, SOURCE_WIDTH - 610, SRC.headerBottom - SRC.headerTop, k), W - (SOURCE_WIDTH - 610) * k, SRC.headerTop * k + dy);
  for (let c = 0; c < 7; c++) {
    const labelWidth = 60;
    const input = await piece(source, (c + 0.5) * SRC_CELL_WIDTH - labelWidth / 2, SRC.weekdayTop, labelWidth, SRC.weekdayBottom - SRC.weekdayTop, k);
    place(input, (c + 0.5) * cw - (labelWidth * k) / 2, SRC.weekdayTop * k + dy);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 7; c++) {
      const from = synthetic?.cell(r, c) ?? { date: [r, c], marker: [r, c] };
      const at = ([sr, sc]: [number, number]) => ({ sx: sc * SRC_CELL_WIDTH, sy: SRC.gridTop + sr * srcRh });
      const tx = c * cw;
      const ty = gridTop + r * rh;
      const surface = surfaceOf(from.marker);
      if (surface !== "255,255,255") fills.push(`<rect x="${tx}" y="${ty}" width="${cw}" height="${rh}" fill="rgb(${surface})"/>`);
      const d = at(from.date);
      place(await piece(source, d.sx + SRC_DATE.x, d.sy + SRC_DATE.y, SRC_DATE.width, SRC_DATE.height, k), tx + SRC_DATE.x * k + 1, ty + SRC_DATE.y * k + 1);
      const half = SRC_MARKER.box / 2;
      const m = at(from.marker);
      place(
        await piece(source, m.sx + SRC_MARKER.x - half, m.sy + SRC_MARKER.y - half, SRC_MARKER.box, SRC_MARKER.box, k),
        tx + cw / 2 - half * k,
        ty + (SRC_MARKER.y - half) * k,
      );
    }
  }
  // Footer: monthly memo row, separator, tab bar icons (spacing in pt).
  const footerTop = gridBottom;
  place(await piece(source, 0, SRC.gridBottom + 4, 300, 60, k), 0, footerTop + 4 * k);
  for (let i = 0; i < 5; i++) {
    const cx = 110 + i * 175.8; // five tabs spread evenly across the screen width
    place(await piece(source, cx - 40, 1835, 80, 75, k), ((i + 0.5) * W) / 5 - 40 * k, footerTop + (1835 - SRC.gridBottom) * k);
  }
  if (fills.length) pieces.unshift({ input: Buffer.from(`<svg width="${W}" height="${H}">${fills.join("")}</svg>`), left: 0, top: 0 });
  const lw = device.lineWidth ?? 1;
  const lines: string[] = [];
  for (let r = 0; r <= rows; r++) lines.push(`<rect x="0" y="${Math.round(gridTop + r * rh) - Math.floor(lw / 2)}" width="${W}" height="${lw}"/>`);
  for (let c = 1; c < 7; c++) lines.push(`<rect x="${Math.round(c * cw) - Math.floor(lw / 2)}" y="${gridTop}" width="${lw}" height="${gridBottom - gridTop}"/>`);
  lines.push(`<rect x="0" y="${Math.round(footerTop + 68 * k)}" width="${W}" height="${lw}"/>`);
  pieces.push({ input: Buffer.from(`<svg width="${W}" height="${H}"><g fill="#ebebeb">${lines.join("")}</g></svg>`), left: 0, top: 0 });
  return sharp({ create: { width: W, height: H, channels: 4, background: "white" } }).composite(pieces).png().toBuffer();
}

export type DarkVariant = "black-inverted" | "gray-keep-chips";

/**
 * Synthetic dark theme (for polarity independence only, not the real app palette).
 * - black-inverted: HSL lightness inverted for every pixel (pure black background, C circle becomes light gray).
 * - gray-keep-chips: neutral pixels mapped to an iOS-like dark gray (#1c1c1e) background with light text,
 *   saturated colours (A yellow, B blue, red labels) kept exactly as in light mode.
 */
export async function toSyntheticDark(input: Buffer, variant: DarkVariant): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (variant === "black-inverted") {
      const shift = 255 - max - min; // keeps hue and chroma, inverts lightness
      out[i] = r + shift; out[i + 1] = g + shift; out[i + 2] = b + shift;
    } else {
      const lum = (r + g + b) / 3;
      const neutral = 28 + ((255 - lum) / 255) * (236 - 28);
      const t = Math.min(1, (max - min) / 120); // colour weight: anti-aliased edges blend smoothly
      out[i] = Math.round(t * r + (1 - t) * neutral);
      out[i + 1] = Math.round(t * g + (1 - t) * neutral);
      out[i + 2] = Math.round(t * b + (1 - t) * (neutral + 2));
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** Same bound as the browser loader (src/lib/analyzer/loadImage.ts) so tests analyse what a phone analyses. */
export async function rasterLikeBrowser(input: Buffer, bound: (w: number, h: number) => { width: number; height: number }) {
  const meta = await sharp(input).metadata();
  const size = bound(meta.width!, meta.height!);
  let pipeline = sharp(input).ensureAlpha();
  if (size.width !== meta.width) pipeline = pipeline.resize({ width: size.width, height: size.height, fit: "fill" });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

// Glyph boxes of the "2026.09" title in deid-2026-09.png (x ranges, measured with findTitleGlyphs).
const TITLE_GLYPHS_2026_09 = { "2": [110, 140], "0": [141, 174], "6": [206, 238], ".": [240, 251], "9": [296, 328] } as const;
/** Cells of the 2026.09 fixture (Tuesday start) that show each shift, and each date number 1..30. */
const SEPTEMBER_OFFSET = 2;
const SEPTEMBER_MARKER = { A: [2, 0], B: [0, 2], C: [1, 0], OFF: [0, 3] } as const;

/**
 * SYNTHETIC month assembled from 2026.09 fixture pieces: real glyphs and markers, new arrangement.
 * Used for 4-week months (e.g. 2026.02: Sunday start, 28 days) that no public capture covers.
 */
export function syntheticMonth(ym: { year: number; month: number }, shifts: Array<"A" | "B" | "C" | "OFF">, offset: number): SyntheticMonth {
  const yy = String(ym.year);
  const mm = String(ym.month).padStart(2, "0");
  const chars = [...yy, ".", ...mm];
  const positions = [110, 141, 175, 206, 240, 262, 296]; // x of each character in "2026.09"
  const title = chars.map((ch, i) => {
    const box = TITLE_GLYPHS_2026_09[ch as keyof typeof TITLE_GLYPHS_2026_09];
    if (!box) throw new Error(`no glyph for ${ch}`);
    return { from: [box[0], box[1]] as [number, number], to: positions[i] };
  });
  return {
    ym,
    title,
    cell: (row, column) => {
      const day = row * 7 + column - offset + 1;
      if (day < 1 || day > shifts.length) throw new Error("synthetic months must fill every cell");
      const index = SEPTEMBER_OFFSET + day - 1;
      return { date: [Math.floor(index / 7), index % 7], marker: [...SEPTEMBER_MARKER[shifts[day - 1]]] as [number, number] };
    },
  };
}
