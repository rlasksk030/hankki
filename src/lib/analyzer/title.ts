// 오늘근무 월간 화면 상단의 연/월 제목("2026.09")만 읽는 가벼운 숫자 판독.
// 범용 OCR이 아니다: 제목 줄의 글자 7개(숫자 4 · 점 · 숫자 2)를 잘라
// 5×7 칸 잉크 밀도로 숫자 기준표(digitTemplates)와 비교하고, 선택한 연/월과 맞는지만 확인한다.
// 모든 처리는 브라우저 안에서 이미지 픽셀로만 한다.
import type { YearMonth } from "../dates";
import { DIGIT_TEMPLATES } from "./digitTemplates";
import type { RasterImage } from "./pixels";

export const FEATURE_COLS = 5;
export const FEATURE_ROWS = 7;

/** 이미지 비율 기준 제목 영역 (상태 표시줄 아래 ~ 요일 줄 위, 왼쪽 메뉴 아이콘 오른쪽) */
const TITLE_TOP = 0.05;
const TITLE_BOTTOM = 0.115;
const TITLE_LEFT = 0.1;
const TITLE_RIGHT = 0.6;
const DARK = 110;

export interface Glyph {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function lum(img: RasterImage, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
}

/**
 * 제목 줄의 글자 상자들 (왼쪽부터).
 * 세로줄로 자르면 '7'의 윗부분과 뒤의 점처럼 겹치는 글자가 붙으므로, 연결된 잉크 덩어리(글자) 단위로 나눈다.
 * 제목 뒤의 '오늘' 버튼 등은 큰 간격으로 끊는다.
 */
export function findTitleGlyphs(img: RasterImage): Glyph[] {
  const { width, height } = img;
  const y0 = Math.floor(height * TITLE_TOP);
  const y1 = Math.ceil(height * TITLE_BOTTOM);
  const x0 = Math.floor(width * TITLE_LEFT);
  const x1 = Math.ceil(width * TITLE_RIGHT);
  const bw = x1 - x0;
  const bh = y1 - y0;

  const dark = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (lum(img, x0 + x, y0 + y) < DARK) dark[y * bw + x] = 1;

  // 연결 요소(8방향)
  const seen = new Uint8Array(bw * bh);
  const stack: number[] = [];
  const minArea = Math.max(4, Math.round((width / 923) ** 2 * 6));
  const glyphs: Glyph[] = [];
  for (let start = 0; start < dark.length; start++) {
    if (!dark[start] || seen[start]) continue;
    let gx0 = bw;
    let gx1 = -1;
    let gy0 = bh;
    let gy1 = -1;
    let area = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % bw;
      const y = (i - x) / bw;
      area += 1;
      if (x < gx0) gx0 = x;
      if (x > gx1) gx1 = x;
      if (y < gy0) gy0 = y;
      if (y > gy1) gy1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const j = ny * bw + nx;
          if (dark[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (area >= minArea) glyphs.push({ x0: x0 + gx0, x1: x0 + gx1, y0: y0 + gy0, y1: y0 + gy1 });
  }
  if (glyphs.length === 0) return [];
  glyphs.sort((a, b) => a.x0 - b.x0);

  // 제목은 글자 사이 간격이 좁다. 글자 높이의 60%보다 큰 간격이 나오면 거기서 끊는다.
  const heights = glyphs.map((g) => g.y1 - g.y0 + 1).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)];
  const title: Glyph[] = [glyphs[0]];
  let right = glyphs[0].x1;
  for (let i = 1; i < glyphs.length; i++) {
    if (glyphs[i].x0 - right - 1 > typical * 0.6) break;
    title.push(glyphs[i]);
    right = Math.max(right, glyphs[i].x1);
  }
  return title;
}

/** 글자 상자를 5×7 칸으로 나눠 칸마다 잉크 밀도(0~1) + 가로세로 비율 */
export function glyphFeatures(img: RasterImage, g: Glyph): number[] {
  const w = g.x1 - g.x0 + 1;
  const h = g.y1 - g.y0 + 1;
  const out: number[] = [];
  for (let r = 0; r < FEATURE_ROWS; r++) {
    for (let c = 0; c < FEATURE_COLS; c++) {
      const cx0 = g.x0 + (c * w) / FEATURE_COLS;
      const cx1 = g.x0 + ((c + 1) * w) / FEATURE_COLS;
      const cy0 = g.y0 + (r * h) / FEATURE_ROWS;
      const cy1 = g.y0 + ((r + 1) * h) / FEATURE_ROWS;
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(cy0); y < Math.max(Math.floor(cy0) + 1, Math.ceil(cy1)); y++) {
        for (let x = Math.floor(cx0); x < Math.max(Math.floor(cx0) + 1, Math.ceil(cx1)); x++) {
          sum += Math.max(0, Math.min(1, (200 - lum(img, x, y)) / 160));
          n += 1;
        }
      }
      out.push(n ? sum / n : 0);
    }
  }
  out.push(Math.min(1.5, w / h));
  return out;
}

function distance(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length - 1; i++) d += (a[i] - b[i]) ** 2;
  d += 4 * (a[a.length - 1] - b[b.length - 1]) ** 2; // 가로세로 비율 ('1'처럼 좁은 숫자 구분)
  return Math.sqrt(d);
}

export interface DigitMatch {
  /** 가장 가까운 숫자 */
  digit: number;
  /** 숫자별 거리 (작을수록 비슷) */
  distances: number[];
}

export function matchDigit(features: number[]): DigitMatch {
  const distances = DIGIT_TEMPLATES.map((t) => distance(features, t));
  let digit = 0;
  for (let d = 1; d < 10; d++) if (distances[d] < distances[digit]) digit = d;
  return { digit, distances };
}

export type TitleVerdict =
  /** 제목이 선택한 연/월과 일치 */
  | { kind: "match"; text: string }
  /** 제목이 분명히 다른 연/월 */
  | { kind: "mismatch"; text: string }
  /** 제목을 찾지 못했거나 확신할 수 없음 */
  | { kind: "unknown"; text?: string };

/** 비슷한지 판단하는 여유: 기대 숫자와의 거리가 가장 가까운 숫자 거리의 이 배수 안이면 일치로 본다 */
const CONSISTENT = 1.2;
/** 분명히 다르다고 보는 기준: 기대 숫자 거리가 가장 가까운 숫자 거리보다 이 배수 이상 멀 때 */
const CONTRADICT = 1.6;

/** 제목 "YYYY.MM"을 읽어 선택한 연/월과 비교한다 */
export function verifyTitle(img: RasterImage, ym: YearMonth): TitleVerdict {
  const glyphs = findTitleGlyphs(img);
  if (glyphs.length !== 7) return { kind: "unknown" };
  const heights = glyphs.map((g) => g.y1 - g.y0 + 1);
  const digitHeight = Math.max(...heights);
  const dot = glyphs[4];
  // 모양 확인: 4번째 뒤의 점은 작고, 숫자들은 비슷한 높이
  if (dot.y1 - dot.y0 + 1 > digitHeight * 0.35) return { kind: "unknown" };
  const digits = [0, 1, 2, 3, 5, 6].map((i) => glyphs[i]);
  if (digits.some((g) => g.y1 - g.y0 + 1 < digitHeight * 0.8)) return { kind: "unknown" };

  const expected = `${ym.year}${String(ym.month).padStart(2, "0")}`.split("").map(Number);
  const matches = digits.map((g) => matchDigit(glyphFeatures(img, g)));
  const read = matches.map((m) => m.digit).join("");
  const text = `${read.slice(0, 4)}.${read.slice(4)}`;

  const consistent = matches.every((m, i) => m.distances[expected[i]] <= m.distances[m.digit] * CONSISTENT);
  if (consistent) return { kind: "match", text };
  const contradicts = matches.some(
    (m, i) => m.digit !== expected[i] && m.distances[expected[i]] >= m.distances[m.digit] * CONTRADICT,
  );
  return contradicts ? { kind: "mismatch", text } : { kind: "unknown", text };
}
