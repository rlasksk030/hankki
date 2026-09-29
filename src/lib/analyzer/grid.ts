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

interface Line { left: number; right: number; y: number }
const gridCache = new WeakMap<object, Map<number, CalendarGrid>>();
const lineCache = new WeakMap<object, Line[]>();

function isLine(img: RasterImage, x: number, y: number): boolean {
  const i = (y * img.width + x) * 4;
  const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
  const low = Math.min(r, g, b), high = Math.max(r, g, b);
  return low > 120 && high < 254 && high - low < 16;
}

// A flat gray panel is not a grid line: require contrast perpendicular to the stroke.
function isStroke(img: RasterImage, x: number, y: number, horizontal: boolean): boolean {
  if (!isLine(img, x, y)) return false;
  const offset = Math.max(2, Math.ceil(img.width * 0.004));
  const before = luminanceAt(img, horizontal ? x : Math.max(0, x - offset), horizontal ? Math.max(0, y - offset) : y);
  const after = luminanceAt(img, horizontal ? x : Math.min(img.width - 1, x + offset), horizontal ? Math.min(img.height - 1, y + offset) : y);
  return Math.max(before, after) - luminanceAt(img, x, y) >= 2;
}

/** Find thin neutral strokes anywhere in the image, including a calendar in a side panel. */
function horizontalSegments(img: RasterImage): Line[] {
  const cached = lineCache.get(img.data);
  if (cached) return cached;
  const step = Math.max(1, Math.floor(img.width / 900));
  const minSpan = Math.max(70, img.width * 0.15);
  const bands: Array<Line & { endY: number }> = [];
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
  const lines = bands.filter(b => b.endY - b.y <= Math.max(3, img.width * 0.008))
    .map(b => ({ left: b.left, right: b.right, y: (b.y + b.endY) / 2 }));
  lineCache.set(img.data, lines);
  return lines;
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
      // A floating action/ad button can cover part of the bottom boundary.
      // Use the wider observed boundary, but require the shorter one to lie
      // within it and cover most of its width. Never invent a missing row.
      const full = first.right - first.left >= last.right - last.left ? first : last;
      const partial = full === first ? last : first;
      const span = full.right - full.left;
      const edgeTolerance = Math.max(3, span * 0.015);
      if (last.y <= first.y || partial.left < full.left - edgeTolerance ||
          partial.right > full.right + edgeTolerance || partial.right - partial.left < span * 0.6) continue;
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
              l.left >= left - edgeTolerance && l.right <= right + edgeTolerance && l.right - l.left >= span * 0.6)) matched++;
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
