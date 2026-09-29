// Theme (light/dark) normalisation.
//
// The analyzer never asks "is this pixel dark?". It asks "how far is this pixel from the
// calendar's own background, in the direction of its text?" (contrast 0~1) and "how colourful
// is it?" (chroma + hue). A light screen with dark text and a dark screen with light text give
// the same contrast values, so grid, markers, OFF labels, date ink and the title are all read by
// one code path. Each image is estimated on its own: two photos in different themes are fine.
import type { RasterImage } from "./pixels";

export type Polarity = "light" | "dark";

export interface Background {
  /** Typical luminance (0~255) of the background surface. */
  luminance: number;
  polarity: Polarity;
  /** Largest luminance distance possible from the background (towards black or white). */
  range: number;
  /** Typical colour of the surface (a highlighted cell can be tinted, e.g. navy "today" fill). */
  rgb: [number, number, number];
}

const HISTOGRAM_BINS = 32;
/** Samples per axis used to estimate a background (fast and memory-free). */
const BACKGROUND_SAMPLES = 96;

const luma = (r: number, g: number, b: number) => (r + g + b) / 3;

export function backgroundOf(luminance: number, rgb: [number, number, number] = [luminance, luminance, luminance]): Background {
  return {
    luminance,
    polarity: luminance >= 128 ? "light" : "dark",
    range: Math.max(24, Math.max(luminance, 255 - luminance)),
    rgb,
  };
}

/**
 * Background of a region = its most common tone. Calendar cells are mostly empty surface,
 * so the histogram mode is the background whatever the theme (text, markers and lines are minorities).
 */
export function estimateBackground(img: RasterImage, x0: number, y0: number, x1: number, y1: number): Background {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(img.width, Math.ceil(x1));
  const bottom = Math.min(img.height, Math.ceil(y1));
  if (right <= left || bottom <= top) return backgroundOf(255);
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  const sums = new Array<number>(HISTOGRAM_BINS).fill(0);
  const rgbSums = Array.from({ length: HISTOGRAM_BINS }, () => [0, 0, 0]);
  const stepX = Math.max(1, (right - left) / BACKGROUND_SAMPLES);
  const stepY = Math.max(1, (bottom - top) / BACKGROUND_SAMPLES);
  for (let y = top; y < bottom; y += stepY) {
    for (let x = left; x < right; x += stepX) {
      const i = (Math.floor(y) * img.width + Math.floor(x)) * 4;
      const l = luma(img.data[i], img.data[i + 1], img.data[i + 2]);
      const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor((l / 256) * HISTOGRAM_BINS));
      bins[bin] += 1;
      sums[bin] += l;
      rgbSums[bin][0] += img.data[i];
      rgbSums[bin][1] += img.data[i + 1];
      rgbSums[bin][2] += img.data[i + 2];
    }
  }
  let best = 0;
  for (let b = 1; b < HISTOGRAM_BINS; b++) if (bins[b] > bins[best]) best = b;
  if (!bins[best]) return backgroundOf(255);
  const n = bins[best];
  return backgroundOf(sums[best] / n, [rgbSums[best][0] / n, rgbSums[best][1] / n, rgbSums[best][2] / n]);
}

/** 0 = same as background, 1 = as far from it as possible (black on white, white on black). */
export function contrast(luminance: number, bg: Background): number {
  return Math.min(1, Math.abs(luminance - bg.luminance) / bg.range);
}


const gridBackgroundCache = new WeakMap<object, Map<string, Background>>();

/** Background of the detected calendar itself (not of the whole screenshot or outside panels). */
export function gridBackground(img: RasterImage, grid: { left: number; right: number; top: number; bottom: number }): Background {
  let entries = gridBackgroundCache.get(img.data);
  if (!entries) {
    entries = new Map();
    gridBackgroundCache.set(img.data, entries);
  }
  const key = [grid.left, grid.right, grid.top, grid.bottom].join(",");
  let bg = entries.get(key);
  if (!bg) {
    bg = estimateBackground(img, grid.left, grid.top, grid.right, grid.bottom);
    entries.set(key, bg);
  }
  return bg;
}

const cellSurfaceCache = new WeakMap<object, Map<string, Background>>();

/**
 * The cell's own surface. Normally the calendar background; a highlighted cell (today) has a
 * tinted fill that must count as background, never as a marker colour.
 */
export function cellSurface(img: RasterImage, left: number, top: number, width: number, height: number): Background {
  let entries = cellSurfaceCache.get(img.data);
  if (!entries) {
    entries = new Map();
    cellSurfaceCache.set(img.data, entries);
  }
  const key = [left, top, width, height].map((n) => Math.round(n)).join(",");
  let bg = entries.get(key);
  if (!bg) {
    // Inset past the grid lines and highlight borders.
    const inset = Math.max(2, Math.min(width, height) * 0.06);
    bg = estimateBackground(img, left + inset, top + inset, left + width - inset, top + height - inset);
    entries.set(key, bg);
  }
  return bg;
}
