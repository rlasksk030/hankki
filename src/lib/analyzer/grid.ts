import { type RasterImage, luminanceAt } from "./pixels";

export interface CalendarGrid {
  left: number;
  right: number;
  top: number;
  bottom: number;
  rows: number;
  rowHeight: number;
  columnWidth: number;
  /** Repeated horizontal boundaries plus seven-column vertical geometry were found. */
  detected: boolean;
}

/** covered: pixels of the boundary actually observed between left and right (gaps = occlusion). */
interface Line { left: number; right: number; y: number; covered: number }
/** A boundary counts when at least this share of the calendar width is actually visible. */
const MIN_BOUNDARY_COVERAGE = 0.6;
/** Pieces of one boundary interrupted by an overlay are joined only if the hidden gap stays below this share. */
const MAX_OCCLUSION_GAP = 0.4;
const gridCache = new WeakMap<object, Map<number, CalendarGrid>>();
const lineCache = new WeakMap<object, Line[]>();

/** Grid lines are grey: any hue is a marker, label or highlight border instead. */
const LINE_MAX_CHROMA = 16;
/** Minimum luminance step between a line and the surface around it (faint 1px hairlines are ≈15). */
const MIN_LINE_CONTRAST = 2;

// A grid stroke is a thin grey line that differs from the surface on BOTH sides in the same
// direction: darker than a light background (light theme) or lighter than a dark background
// (dark theme). No absolute brightness is assumed. Requiring both sides rejects one-sided steps
// (panel edges) and the plain surface next to a line, which would otherwise look like a
// "lighter line" a few pixels away from every real one.
function isStroke(img: RasterImage, x: number, y: number, horizontal: boolean): boolean {
  const i = (y * img.width + x) * 4;
  const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
  if (Math.max(r, g, b) - Math.min(r, g, b) >= LINE_MAX_CHROMA) return false;
  const l = (r + g + b) / 3;
  const offset = Math.max(2, Math.ceil(img.width * 0.004));
  const before = luminanceAt(img, horizontal ? x : Math.max(0, x - offset), horizontal ? Math.max(0, y - offset) : y);
  // Most pixels are plain surface: one flat neighbour already rules the stroke out.
  if (Math.abs(before - l) < MIN_LINE_CONTRAST) return false;
  const after = luminanceAt(img, horizontal ? x : Math.min(img.width - 1, x + offset), horizontal ? Math.min(img.height - 1, y + offset) : y);
  return Math.min(before, after) - l >= MIN_LINE_CONTRAST || l - Math.max(before, after) >= MIN_LINE_CONTRAST;
}

/** Find thin neutral strokes anywhere in the image, including a calendar in a side panel. */
function horizontalSegments(img: RasterImage): Line[] {
  const cached = lineCache.get(img.data);
  if (cached) return cached;
  const step = Math.max(1, Math.floor(img.width / 900));
  const minSpan = Math.max(70, img.width * 0.15);
  const bands: Array<Omit<Line, "covered"> & { endY: number }> = [];
  for (let y = 0; y < img.height; y++) {
    let start = -1, last = -1;
    const finish = () => {
      if (start >= 0 && last - start >= minSpan) {
        const right = Math.min(img.width, last + step);
        const previous = bands.find(b => y - b.endY <= 2 && Math.abs(b.left - start) <= step * 3 && Math.abs(b.right - right) <= step * 3);
        if (previous) {
          previous.endY = y;
        } else bands.push({ left: start, right, y, endY: y });
      }
      start = -1; last = -1;
    };
    for (let x = 0; x < img.width; x += step) {
      if (isStroke(img, x, y, true)) {
        if (start < 0) start = x;
        last = x;
      } else if (start >= 0 && x - last > Math.max(step * 3, img.width * 0.01)) finish();
    }
    finish();
  }
  const lines: Line[] = bands.filter(b => b.endY - b.y <= Math.max(3, img.width * 0.008))
    .map(b => ({ left: b.left, right: b.right, y: (b.y + b.endY) / 2, covered: b.right - b.left }));
  lines.push(...joinInterruptedLines(lines));
  // scanGrid pairs a first (upper) with a later (lower) boundary: keep the list in top-to-bottom order,
  // joined boundaries included (a highlighted cell in the first week splits the top boundary).
  lines.sort((a, b) => a.y - b.y || b.covered - a.covered);
  lineCache.set(img.data, lines);
  return lines;
}

/**
 * A floating button or tab bar in the middle of a boundary splits it into pieces at the same height.
 * Join them into one boundary whose `covered` length is only what is really visible, so the
 * coverage rule below decides — independent of where the overlay sits (left, right or centre).
 */
function joinInterruptedLines(lines: Line[]): Line[] {
  const joined: Line[] = [];
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.left - b.left);
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].y - sorted[i].y <= 1.5) j++;
    const group = sorted.slice(i, j).sort((a, b) => a.left - b.left);
    i = j;
    if (group.length < 2) continue;
    const left = group[0].left;
    const right = Math.max(...group.map(l => l.right));
    let covered = 0, gap = 0, reach = left;
    for (const l of group) {
      gap = Math.max(gap, l.left - reach);
      covered += Math.max(0, l.right - Math.max(l.left, reach));
      reach = Math.max(reach, l.right);
    }
    if (gap <= (right - left) * MAX_OCCLUSION_GAP) {
      joined.push({ left, right, y: group.reduce((sum, l) => sum + l.y, 0) / group.length, covered });
    }
  }
  return joined;
}

export function findHorizontalLines(img: RasterImage): number[] {
  return [...new Set(horizontalSegments(img).map(l => l.y))];
}

/** Reject lists/separators by requiring repeated internal column boundaries too. */
function verticalSupport(img: RasterImage, left: number, right: number, top: number, bottom: number): number {
  const cw = (right - left) / 7;
  const tolerance = Math.max(2, Math.ceil(img.width / 900) * 2);
  let found = 0;
  for (let c = 1; c < 7; c++) {
    let best = 0;
    for (let dx = -tolerance; dx <= tolerance; dx++) {
      const x = Math.round(left + c * cw) + dx;
      if (x < 0 || x >= img.width) continue;
      let hits = 0;
      for (let k = 0; k < 60; k++) {
        const y = Math.floor(top + (k + 0.5) * (bottom - top) / 60);
        if (isStroke(img, x, y, false)) hits++;
      }
      best = Math.max(best, hits / 60);
    }
    if (best >= 0.55) found++;
  }
  return found;
}

export function detectGrid(img: RasterImage, expectedRows: number): CalendarGrid {
  let entries = gridCache.get(img.data);
  if (!entries) { entries = new Map(); gridCache.set(img.data, entries); }
  const cached = entries.get(expectedRows);
  if (cached) return cached;
  const grid = scanGrid(img, expectedRows);
  entries.set(expectedRows, grid);
  return grid;
}

function scanGrid(img: RasterImage, expectedRows: number): CalendarGrid {
  const lines = horizontalSegments(img);
  let best: (CalendarGrid & { score: number }) | undefined;
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const last = lines[j];
      // A floating action/ad button or tab bar can cover part of the bottom boundary.
      // Use the wider observed boundary for the bounds, but require the other one to lie
      // within it with most of its width really visible. Never invent a missing row.
      const full = first.right - first.left >= last.right - last.left ? first : last;
      const partial = full === first ? last : first;
      const span = full.right - full.left;
      const edgeTolerance = Math.max(3, span * 0.015);
      if (last.y <= first.y || partial.left < full.left - edgeTolerance || partial.right > full.right + edgeTolerance ||
          partial.covered < span * MIN_BOUNDARY_COVERAGE || full.covered < span * MIN_BOUNDARY_COVERAGE) continue;
      const left = full.left;
      const right = full.right;
      const columnWidth = (right - left) / 7;
      for (let rows = 4; rows <= 6; rows++) {
        const rowHeight = (last.y - first.y) / rows;
        // Broad geometric bounds only, independent of screenshot aspect ratio.
        if (rowHeight < Math.max(20, columnWidth * 0.35) || rowHeight > columnWidth * 8) continue;
        const tolerance = Math.max(2, rowHeight * 0.02);
        let matched = 0;
        for (let k = 1; k < rows; k++) {
          if (lines.some(l => Math.abs(l.y - first.y - rowHeight * k) <= tolerance &&
              l.left >= left - edgeTolerance && l.right <= right + edgeTolerance && l.covered >= span * MIN_BOUNDARY_COVERAGE)) matched++;
        }
        const missing = rows - 1 - matched;
        if (missing > 1) continue;
        const columns = verticalSupport(img, left, right, first.y, last.y);
        if (columns < 4) continue;
        const score = (matched + 2) * 10 - missing * 5 + columns + (rows === expectedRows ? 3 : 0);
        if (!best || score > best.score) best = { left, right, top: first.y, bottom: last.y, rows, rowHeight, columnWidth, detected: true, score };
      }
    }
  }
  if (best) return best;
  // No device-specific coordinate fallback: unrecognized geometry must be reviewed.
  return { left: 0, right: img.width, top: 0, bottom: img.height, rows: expectedRows,
    rowHeight: img.height / expectedRows, columnWidth: img.width / 7, detected: false };
}
