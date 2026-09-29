import type { CalendarGrid } from "./grid";
import { classifyPixel, type RasterImage } from "./pixels";

export interface MarkerGeometry { x: number; y: number; diameter: number }
const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const cache = new WeakMap<object, Map<string, MarkerGeometry | null>>();
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Infer the shift-circle location and size from repeated round components inside cells. */
export function markerGeometry(img: RasterImage, grid: CalendarGrid): MarkerGeometry | null {
  let entries = cache.get(img.data);
  if (!entries) { entries = new Map(); cache.set(img.data, entries); }
  const key = [grid.left, grid.right, grid.top, grid.bottom, grid.rows].join(",");
  if (entries.has(key)) return entries.get(key)!;
  const cw = grid.columnWidth, rh = grid.rowHeight;
  const offLabels: MarkerGeometry[] = [];
  const candidates: Array<MarkerGeometry & { colored: boolean }> = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < 7; col++) {
      const cellLeft = grid.left + col * cw, cellTop = grid.top + row * rh;
      // Exclude edges (grid, date labels); keep the full usable cell height.
      const x0 = Math.ceil(cellLeft + cw * 0.18), x1 = Math.floor(cellLeft + cw * 0.82);
      const y0 = Math.ceil(cellTop + 2), y1 = Math.floor(cellTop + rh - 2);
      const width = x1 - x0, height = y1 - y0;
      if (width <= 0 || height <= 0) continue;
      const mask = new Uint8Array(width * height);
      let redLeft = width, redRight = -1, redTop = height, redBottom = -1, redCount = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = ((y + y0) * img.width + x + x0) * 4;
        const kind = classifyPixel(img.data[i], img.data[i + 1], img.data[i + 2]);
        if (kind === "red") {
          redLeft = Math.min(redLeft, x); redRight = Math.max(redRight, x);
          redTop = Math.min(redTop, y); redBottom = Math.max(redBottom, y); redCount++;
        }
        mask[y * width + x] = kind === "yellow" ? 1 : kind === "blue" ? 2 : kind === "dark" ? 3 : 0;
      }
      if (redCount >= 12 && redRight - redLeft >= 5 && redBottom - redTop >= 5) {
        offLabels.push({ x: x0 + (redLeft + redRight + 1) / 2 - cellLeft,
          y: y0 + (redTop + redBottom + 1) / 2 - cellTop,
          diameter: Math.max(redRight - redLeft + 1, redBottom - redTop + 1) * 2 });
      }
      let largest: (MarkerGeometry & { colored: boolean; area: number }) | undefined;
      for (let start = 0; start < mask.length; start++) {
        const kind = mask[start];
        if (!kind) continue;
        const stack = [start]; mask[start] = 0;
        let minX = width, maxX = 0, minY = height, maxY = 0, area = 0;
        while (stack.length) {
          const i = stack.pop()!, x = i % width, y = Math.floor(i / width);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y); area++;
          for (const [dx, dy] of NEIGHBORS) {
            const nx = x + dx, ny = y + dy, j = ny * width + nx;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[j] === kind) { mask[j] = 0; stack.push(j); }
          }
        }
        const w = maxX - minX + 1, h = maxY - minY + 1;
        if (w < Math.max(7, cw * 0.09) || h < 7 || w / h < 0.75 || w / h > 1.3 || area / (w * h) < 0.5) continue;
        if (!largest || area > largest.area) largest = {
          x: x0 + (minX + maxX + 1) / 2 - cellLeft,
          y: y0 + (minY + maxY + 1) / 2 - cellTop,
          diameter: (w + h) / 2, colored: kind !== 3, area,
        };
      }
      if (largest) candidates.push(largest);
    }
  }
  const colored = candidates.filter(c => c.colored);
  const pool = colored.length >= 3 ? colored : candidates;
  let result: MarkerGeometry | null = null;
  if (pool.length >= 3) {
    const diameter = median(pool.map(c => c.diameter));
    const similar = pool.filter(c => Math.abs(c.diameter - diameter) < diameter * 0.25);
    if (similar.length >= 3) {
      const x = median(similar.map(c => c.x)), y = median(similar.map(c => c.y));
      if (similar.filter(c => Math.abs(c.x - x) < diameter * 0.3 && Math.abs(c.y - y) < diameter * 0.3).length >= similar.length * 0.75) {
        result = { x, y, diameter };
      }
    }
  }
  // A month can be entirely OFF. Locate repeated red labels rather than inventing
  // an iPhone-sized circle; too little evidence remains explicitly uncertain.
  if (!result && offLabels.length >= 3) {
    const x = median(offLabels.map(c => c.x)), y = median(offLabels.map(c => c.y));
    const diameter = median(offLabels.map(c => c.diameter));
    if (offLabels.filter(c => Math.abs(c.x - x) < diameter * 0.3 && Math.abs(c.y - y) < diameter * 0.3).length >= offLabels.length * 0.75) {
      result = { x, y, diameter };
    }
  }
  entries.set(key, result);
  return result;
}
