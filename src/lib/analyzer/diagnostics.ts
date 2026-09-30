// Development/test diagnostics. Not imported by the app UI: it only explains, stage by stage,
// what the analyzer saw so a failing capture can be classified (GRID / TITLE / MARKER / MONTH ...).
import type { YearMonth } from "../dates";
import { analyzeMonth, fitMonth, readCell } from "./analyze";
import { findHorizontalLines } from "./grid";
import { markerGeometry } from "./markers";
import type { RasterImage } from "./pixels";
import { gridBackground } from "./theme";
import { findTitleGlyphs, verifyTitle } from "./title";

export interface Diagnosis {
  image: { width: number; height: number };
  theme: { background: number; polarity: string } | null;
  grid: {
    horizontalLines: number;
    detected: boolean;
    left: number;
    right: number;
    top: number;
    bottom: number;
    rows: number;
    columnWidth: number;
    rowHeight: number;
  };
  title: { glyphs: number; verdict: string; text?: string };
  markers: {
    geometry: { x: number; y: number; diameter: number } | null;
    cells: number;
    A: number;
    B: number;
    C: number;
    OFF: number;
    lowConfidence: number;
  };
  month: { fit: number };
  final: { ok: boolean; kind?: string; stage?: string };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Classify where a capture fails: DECODE is outside (loadRaster); the rest is here. */
export function diagnose(img: RasterImage, ym: YearMonth): Diagnosis {
  const reading = fitMonth(img, ym);
  const { grid } = reading;
  const geometry = grid.detected ? markerGeometry(img, grid) : null;
  const shifts = { A: 0, B: 0, C: 0, OFF: 0, lowConfidence: 0, cells: 0 };
  if (grid.detected && geometry) {
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < 7; column++) {
        const cell = readCell(img, grid, row, column);
        shifts[cell.shift] += 1;
        shifts.cells += 1;
        if (cell.confidence < 0.5) shifts.lowConfidence += 1;
      }
    }
  }
  const bg = grid.detected ? gridBackground(img, grid) : null;
  const title = verifyTitle(img, ym);
  const result = analyzeMonth(img, ym);
  const stage = result.ok
    ? undefined
    : !grid.detected
      ? "GRID"
      : !geometry
        ? "MARKER"
        : result.kind === "cropped"
          ? "CROP"
          : result.kind === "month-mismatch"
            ? title.kind === "unknown" ? "MONTH(layout)" : "TITLE/MONTH"
            : "CONFIDENCE";
  return {
    image: { width: img.width, height: img.height },
    theme: bg ? { background: round(bg.luminance), polarity: bg.polarity } : null,
    grid: {
      horizontalLines: findHorizontalLines(img).length,
      detected: grid.detected,
      left: round(grid.left),
      right: round(grid.right),
      top: round(grid.top),
      bottom: round(grid.bottom),
      rows: grid.rows,
      columnWidth: round(grid.columnWidth),
      rowHeight: round(grid.rowHeight),
    },
    title: { glyphs: findTitleGlyphs(img).length, verdict: title.kind, text: title.text },
    markers: {
      geometry: geometry && { x: round(geometry.x), y: round(geometry.y), diameter: round(geometry.diameter) },
      ...shifts,
    },
    month: { fit: round(reading.fit * 100) / 100 },
    final: { ok: result.ok, kind: result.ok ? undefined : result.kind, stage },
  };
}
