import { type RasterImage, luminanceAt } from "./pixels";

export interface CalendarGrid {
  /** 달력 첫 행 위쪽 경계선 y(px) */
  top: number;
  /** 달력 마지막 행 아래쪽 경계선 y(px) */
  bottom: number;
  rows: number;
  rowHeight: number;
  columnWidth: number;
  /** 가로 격자선을 실제로 찾았는지 (false면 비율 기반 추정값) */
  detected: boolean;
}

/**
 * 오늘근무 iPhone 세로 스크린샷의 일반적인 달력 영역(이미지 높이 대비 비율).
 * 격자선 탐지가 실패했을 때만 쓰는 추정값.
 */
export const FALLBACK_TOP = 0.132;
export const FALLBACK_BOTTOM = 0.8765;

// 같은 이미지를 여러 달과 비교할 때(월 검증) 격자선 탐지를 한 번만 하도록 기억해 둔다
const lineCache = new WeakMap<object, number[]>();

/** 가로 방향으로 거의 끝까지 이어지는 옅은 회색 선(달력 행 구분선)의 y 좌표 목록 */
export function findHorizontalLines(img: RasterImage): number[] {
  const cached = lineCache.get(img.data);
  if (cached) return cached;
  const lines = scanHorizontalLines(img);
  lineCache.set(img.data, lines);
  return lines;
}

function scanHorizontalLines(img: RasterImage): number[] {
  const { width, height } = img;
  const x0 = Math.floor(width * 0.02);
  const x1 = Math.ceil(width * 0.98);
  const step = Math.max(1, Math.floor(width / 400));
  const candidates: number[] = [];

  for (let y = Math.floor(height * 0.04); y < Math.floor(height * 0.98); y++) {
    let hits = 0;
    let n = 0;
    for (let x = x0; x < x1; x += step) {
      const lum = luminanceAt(img, x, y);
      // 흰 배경(≈255)보다 살짝 어둡고, 글자/원(진한 색)보다는 밝은 픽셀
      if (lum < 252 && lum > 120) hits += 1;
      n += 1;
    }
    if (hits / n >= 0.6) candidates.push(y);
  }

  // 붙어 있는 y(두께 2~3px 선)를 하나로 묶는다
  const lines: number[] = [];
  let group: number[] = [];
  for (const y of candidates) {
    if (group.length && y - group[group.length - 1] > 2) {
      lines.push(group.reduce((a, b) => a + b, 0) / group.length);
      group = [];
    }
    group.push(y);
  }
  if (group.length) lines.push(group.reduce((a, b) => a + b, 0) / group.length);
  return lines;
}

/**
 * 같은 간격으로 반복되는 가로선 묶음을 달력으로 본다.
 * 한 줄 정도는 가려져도(오늘 표시 테두리 등) 찾을 수 있게 1개 누락까지 허용한다.
 */
export function detectGrid(img: RasterImage, expectedRows: number): CalendarGrid {
  const { width, height } = img;
  const columnWidth = width / 7;
  const lines = findHorizontalLines(img);

  let best: { top: number; bottom: number; rows: number; score: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const top = lines[i];
      const bottom = lines[j];
      if (top > height * 0.45 || bottom < height * 0.5) continue;
      for (let rows = 4; rows <= 6; rows++) {
        const rowHeight = (bottom - top) / rows;
        if (rowHeight < height * 0.05 || rowHeight > height * 0.25) continue;
        // 셀은 세로로 긴 직사각형이어야 한다 (오늘근무: 높이 ≈ 폭의 2.3배)
        if (rowHeight < columnWidth * 1.1 || rowHeight > columnWidth * 4) continue;
        const tolerance = Math.max(2, rowHeight * 0.02);
        let matched = 0;
        for (let k = 1; k < rows; k++) {
          const expected = top + rowHeight * k;
          if (lines.some((y) => Math.abs(y - expected) <= tolerance)) matched += 1;
        }
        const missing = rows - 1 - matched;
        if (missing > 1) continue;
        const score = (matched + 2) * 10 - missing * 5 + (rows === expectedRows ? 3 : 0);
        if (!best || score > best.score) best = { top, bottom, rows, score };
      }
    }
  }

  if (best) {
    return {
      top: best.top,
      bottom: best.bottom,
      rows: best.rows,
      rowHeight: (best.bottom - best.top) / best.rows,
      columnWidth,
      detected: true,
    };
  }

  const top = height * FALLBACK_TOP;
  const bottom = height * FALLBACK_BOTTOM;
  return {
    top,
    bottom,
    rows: expectedRows,
    rowHeight: (bottom - top) / expectedRows,
    columnWidth,
    detected: false,
  };
}
