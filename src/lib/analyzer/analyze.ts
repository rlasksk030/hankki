import {
  type YearMonth,
  addMonths,
  calendarRows,
  daysInMonth,
  firstWeekday,
  toISODate,
} from "../dates";
import type { Shift, ShiftDay } from "../settlement";
import { type CalendarGrid, detectGrid } from "./grid";
import { DEFAULT_DATE_INK_CONTRAST, type RasterImage, colour, countClasses, inkRatio, isNeutral } from "./pixels";
import { type Background, cellSurface, contrast, gridBackground } from "./theme";
import { markerGeometry } from "./markers";
import { verifyTitle } from "./title";

/** 원이 있다고 볼 최소 면적 비율(원 면적 대비), 확신 구간 */
const DETECT_THRESHOLD = 0.35;
const STRONG_THRESHOLD = 0.55;
const WEAK_THRESHOLD = 0.2;
/** '휴' 빨간 글자가 있다고 볼 최소 비율 */
const RED_THRESHOLD = 0.02;
/** 날짜 숫자 영역 잉크 비율: 이번 달 ≥ 0.03, 앞뒤 달(흐린 숫자) ≈ 0 */
const INK_THRESHOLD = 0.012;
/** 원 자리에 배경과 다른 무언가(흐린 원·번짐)가 이만큼 있는데 A/B/C로도 휴로도 확정되지 않으면 '확인 필요' */
const UNCLASSIFIED_DISC_RATIO = DETECT_THRESHOLD;
/** 확인이 필요한 칸의 확신도 (Review 화면에서 점선으로 표시되는 0.7 미만, 자동 판독 실패 기준 0.5 미만) */
const UNSURE_CONFIDENCE = 0.3;

export interface CellBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function cellBox(grid: CalendarGrid, row: number, column: number): CellBox {
  return {
    left: grid.left + column * grid.columnWidth,
    top: grid.top + row * grid.rowHeight,
    width: grid.columnWidth,
    height: grid.rowHeight,
  };
}

export interface CellReading {
  shift: Shift;
  confidence: number;
  ratios: { yellow: number; blue: number; dark: number; faint: number; red: number };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 한 칸의 근무 원 영역을 통째로 보고 A/B/C/휴를 판별한다. */
export function readCell(img: RasterImage, grid: CalendarGrid, row: number, column: number): CellReading {
  const cell = cellBox(grid, row, column);
  const geometry = markerGeometry(img, grid);
  if (!geometry) return { shift: "OFF", confidence: 0, ratios: { yellow: 0, blue: 0, dark: 0, faint: 0, red: 0 } };
  const bg = gridBackground(img, grid);
  const cx = cell.left + geometry.x;
  const cy = cell.top + geometry.y;
  const radius = geometry.diameter / 2;
  const counts = countClasses(
    img,
    cx - radius * 1.25,
    Math.max(cell.top + 2, cy - radius * 1.25),
    cx + radius * 1.25,
    Math.min(cell.top + cell.height - 2, cy + radius * 1.25),
    bg,
    cellSurface(img, cell.left, cell.top, cell.width, cell.height),
  );
  const circleArea = Math.PI * radius ** 2;
  const ratios = {
    yellow: counts.yellow / circleArea,
    blue: counts.blue / circleArea,
    dark: counts.dark / circleArea,
    faint: counts.faint / circleArea,
    red: counts.red / circleArea,
  };

  const ranked: Array<[Shift, number]> = (
    [
      ["A", ratios.yellow],
      ["B", ratios.blue],
      ["C", ratios.dark],
    ] as Array<[Shift, number]>
  ).sort((a, b) => b[1] - a[1]);
  const [bestShift, best] = ranked[0];
  const second = ranked[1][1];

  if (best >= DETECT_THRESHOLD) {
    const strength = clamp01((best - WEAK_THRESHOLD) / (STRONG_THRESHOLD - WEAK_THRESHOLD));
    const separation = clamp01(1 - second / best);
    return { shift: bestShift, confidence: round2(strength * (0.5 + 0.5 * separation)), ratios };
  }

  // 원이 없으면 휴. 경계값에 가까울수록 확신도를 낮춘다.
  let confidence = clamp01(1 - best / DETECT_THRESHOLD);
  // 원도 없고 빨간 '휴'도 없으면(빈 칸) 확인이 필요하다.
  if (ratios.red < RED_THRESHOLD) confidence = Math.min(confidence, 0.6);
  // 원 크기의 흐린/애매한 표시가 있는데 A/B/C도 휴도 아니면 휴로 단정하지 않는다
  // (예: 배경과 대비가 약한 원). 사용자가 Review 화면에서 확인하도록 확신도를 낮춘다.
  if (ratios.red < RED_THRESHOLD && ratios.faint + best >= UNCLASSIFIED_DISC_RATIO) {
    confidence = Math.min(confidence, UNSURE_CONFIDENCE);
  }
  return { shift: "OFF", confidence: round2(confidence), ratios };
}

/** 칸 왼쪽 위 날짜 숫자 영역 (표시 크기에 비례) */
function dateArea(grid: CalendarGrid, row: number, column: number, unit: number) {
  const cell = cellBox(grid, row, column);
  return {
    x0: cell.left + unit * 0.03,
    y0: cell.top + unit * 0.03,
    x1: cell.left + unit * 0.35,
    y1: cell.top + Math.min(unit * 0.22, cell.height * 0.3),
  };
}

/** 이번 달 날짜 글자의 대비 중 이 비율 이상이면 '진한 잉크' (앞뒤 달 흐린 날짜는 이보다 훨씬 약하다) */
const DATE_INK_SHARE = 0.55;
/** 칸의 대부분은 이번 달이다: 칸별 최대 대비의 상위 25% 지점을 이번 달 글자 대비로 본다 */
const IN_MONTH_PERCENTILE = 0.75;
const dateInkCache = new WeakMap<object, Map<string, number>>();

/**
 * 날짜 '진한 잉크' 기준을 이 사진 스스로의 글자 대비로 정한다.
 * 라이트(검은 글자)·다크(흰 글자)·축소로 흐려진 글자 모두 같은 규칙: 이번 달 글자 대비의 55%.
 * 기존 흰 배경 기준(0.45)보다 엄격해지지 않도록 그 값을 상한으로 둔다.
 */
function dateInkContrast(img: RasterImage, grid: CalendarGrid, unit: number, bg: Background): number {
  let entries = dateInkCache.get(img.data);
  if (!entries) {
    entries = new Map();
    dateInkCache.set(img.data, entries);
  }
  const key = [grid.left, grid.right, grid.top, grid.bottom, grid.rows, unit].join(",");
  const cached = entries.get(key);
  if (cached !== undefined) return cached;
  const peaks: number[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < 7; column++) {
      const a = dateArea(grid, row, column, unit);
      let peak = 0;
      for (let y = Math.max(0, Math.floor(a.y0)); y < Math.min(img.height, Math.ceil(a.y1)); y++) {
        for (let x = Math.max(0, Math.floor(a.x0)); x < Math.min(img.width, Math.ceil(a.x1)); x++) {
          const i = (y * img.width + x) * 4;
          const c = colour(img.data[i], img.data[i + 1], img.data[i + 2]);
          if (isNeutral(c)) peak = Math.max(peak, contrast(c.luminance, bg));
        }
      }
      peaks.push(peak);
    }
  }
  peaks.sort((a, b) => a - b);
  const text = peaks[Math.floor((peaks.length - 1) * IN_MONTH_PERCENTILE)] ?? 1;
  const threshold = Math.min(DEFAULT_DATE_INK_CONTRAST, text * DATE_INK_SHARE);
  entries.set(key, threshold);
  return threshold;
}

/**
 * 이 이미지가 주어진 달의 달력 배치와 얼마나 맞는지(0~1).
 * 이번 달 날짜 칸에는 진한 숫자가, 앞뒤 달 칸에는 흐린 숫자만 있어야 한다.
 */
export function layoutFit(img: RasterImage, grid: CalendarGrid, ym: YearMonth): number {
  const offset = firstWeekday(ym.year, ym.month);
  const days = daysInMonth(ym.year, ym.month);
  const needed = calendarRows(ym.year, ym.month);
  const cw = grid.columnWidth;
  // Date glyph scale follows the observed content, not the width of a stretched cell.
  const marker = markerGeometry(img, grid);
  const unit = marker ? Math.min(cw, marker.diameter / 0.4) : cw;
  const bg = gridBackground(img, grid);
  const threshold = dateInkContrast(img, grid, unit, bg);
  const totalRows = Math.max(grid.rows, needed);
  // 달마다 다른 곳은 첫 주와 마지막 주(앞뒤 달 날짜가 섞이는 행)뿐이므로 그 두 행만 비교한다.
  // 격자에 보이지 않는 행은 전부 불일치로 센다.
  const rowsToCheck = new Set([0, totalRows - 1]);
  for (let row = grid.rows; row < totalRows; row++) rowsToCheck.add(row);
  let considered = 0;
  let matched = 0;
  for (const row of rowsToCheck) {
    for (let column = 0; column < 7; column++) {
      const index = row * 7 + column;
      const inMonth = index >= offset && index < offset + days;
      considered += 1;
      if (row >= grid.rows) continue;
      const area = dateArea(grid, row, column, unit);
      const ink = inkRatio(img, area.x0, area.y0, area.x1, area.y1, bg, threshold);
      if (ink > INK_THRESHOLD === inMonth) matched += 1;
    }
  }
  return considered === 0 ? 0 : matched / considered;
}

export interface MonthReading {
  month: YearMonth;
  grid: CalendarGrid;
  fit: number;
}

export function fitMonth(img: RasterImage, ym: YearMonth): MonthReading {
  const grid = detectGrid(img, calendarRows(ym.year, ym.month));
  return { month: ym, grid, fit: grid.detected ? layoutFit(img, grid, ym) : 0 };
}

/** 한 달 달력 이미지에서 지정한 날짜들의 근무를 읽는다. */
export function readDays(img: RasterImage, reading: MonthReading, fromDay: number, toDay: number): ShiftDay[] {
  const { month, grid } = reading;
  if (!grid.detected) return [];
  const offset = firstWeekday(month.year, month.month);
  const result: ShiftDay[] = [];
  for (let day = fromDay; day <= toDay; day++) {
    const index = offset + day - 1;
    const cell = readCell(img, grid, Math.floor(index / 7), index % 7);
    const confidence = grid.detected ? cell.confidence : round2(cell.confidence * 0.8);
    result.push({ date: toISODate(month.year, month.month, day), shift: cell.shift, source: "image", confidence });
  }
  return result;
}

// ---- 두 장 분석 ----

export type AnalysisErrorKind =
  | "not-calendar"
  | "cropped"
  | "month-mismatch"
  | "low-confidence";

// ---------- 월 검증: 사진 속 근무표가 선택한 연/월이 맞는지 ----------

/** 달력 구조를 비교할 앞뒤 범위(개월) */
const MONTH_CHECK_RANGE = 12;

/** 검증 결과: 어떤 근거로 통과했는지, 또는 사용자 확인이 필요한지 */
export type MonthCheck =
  | { status: "ok"; by: "title" | "layout"; title?: string }
  | { status: "confirm"; reason: "ambiguous" | "title-differs"; title?: string }
  | { status: "reject"; title?: string };

/**
 * 1순위: 상단 제목 "YYYY.MM"을 읽어 선택한 연/월과 직접 비교
 * 2순위: 달력 구조(1일 위치 · 말일 · 앞뒤 달 흐린 날짜 · 주 수)가 앞뒤 12개월 중 선택한 달에만 가장 잘 맞는지
 * 둘 다 확신할 수 없으면 자동 통과시키지 않고 사용자 확인을 요청한다.
 */
export function checkMonth(img: RasterImage, reading: MonthReading, ym: YearMonth): MonthCheck {
  const title = verifyTitle(img, ym);
  let bestOther = 0;
  for (let k = -MONTH_CHECK_RANGE; k <= MONTH_CHECK_RANGE; k++) {
    if (k === 0) continue;
    bestOther = Math.max(bestOther, fitMonth(img, addMonths(ym, k)).fit);
  }
  const layoutUnique = reading.fit >= MIN_FIT && reading.fit > bestOther;
  const layoutWorse = reading.fit < MIN_FIT || bestOther > reading.fit;

  if (title.kind === "match") return { status: "ok", by: "title", title: title.text };
  if (title.kind === "mismatch") {
    // 제목과 구조가 모두 다른 달을 가리키면 거부, 구조만 맞으면 사용자 확인
    return layoutUnique
      ? { status: "confirm", reason: "title-differs", title: title.text }
      : { status: "reject", title: title.text };
  }
  if (layoutWorse) return { status: "reject" };
  if (layoutUnique) return { status: "ok", by: "layout" };
  return { status: "confirm", reason: "ambiguous" };
}

/** 달이 맞지 않을 때 안내용: 제목을 확실히 다른 연/월로 읽은 경우에만 그 제목 */
function mismatchTitle(img: RasterImage, ym: YearMonth): string | undefined {
  const v = verifyTitle(img, ym);
  return v.kind === "mismatch" ? v.text : undefined;
}

/** 같은 사진을 두 달에 등록하는 것을 알아채기 위한 사진 지문 (달력 영역 16×16 평균 해시, 원본은 저장하지 않음) */
export function photoFingerprint(img: RasterImage, grid: CalendarGrid): string {
  const size = 16;
  const values: number[] = [];
  const h = grid.bottom - grid.top;
  // 다크 테마는 밝기를 뒤집어 라이트 테마와 같은 모양의 지문을 만든다 (라이트 사진의 지문 값은 기존과 같다)
  const dark = gridBackground(img, grid).polarity === "dark";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let sum = 0;
      let n = 0;
      const x0 = Math.floor(grid.left + (c * (grid.right - grid.left)) / size);
      const x1 = Math.floor(grid.left + ((c + 1) * (grid.right - grid.left)) / size);
      const y0 = Math.floor(grid.top + (r * h) / size);
      const y1 = Math.floor(grid.top + ((r + 1) * h) / size);
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * img.width + x) * 4;
          sum += (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
          n += 1;
        }
      }
      const mean = n ? sum / n : 255;
      values.push(dark ? 255 - mean : mean);
    }
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let hex = "";
  for (let i = 0; i < values.length; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (values[i + b] < mean ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

/** 두 사진 지문이 같은 사진으로 보이는지 (다시 저장·크기 변경 정도의 차이는 허용) */
export function samePhoto(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return diff <= 12;
}

export interface MonthWarning {
  /** 경고 대상 사진 (pair: 1·2, single: 1) */
  photo: 1 | 2;
  month: YearMonth;
  reason: "ambiguous" | "title-differs";
  title?: string;
}

export interface AnalysisSuccess {
  ok: true;
  /** 정산기간(기준월 21일 ~ 다음 달 20일) 근무표 */
  shifts: ShiftDay[];
  /** 두 달 각각의 전체(1일~말일) 근무표 — 월별 근무표로 저장한다 */
  months: [ShiftDay[], ShiftDay[]];
  /** 사진 순서가 반대여서 바로잡았는지 */
  swapped: boolean;
  /** 두 달 각각의 월 검증 결과 */
  checks: [MonthCheck, MonthCheck];
  /** 자동 통과시키지 않고 사용자 확인이 필요한 사진 */
  warnings: MonthWarning[];
  /** 두 사진의 지문 (같은 사진 중복 등록 확인용) */
  fingerprints: [string, string];
  diagnostics: MonthReading[];
}

export interface AnalysisFailure {
  ok: false;
  kind: AnalysisErrorKind;
  /** 문제가 된 사진 (1 = 기준월, 2 = 다음 달) */
  photo?: 1 | 2;
  /** 월이 다를 때 사진 제목에서 읽은 연/월 (예: "2026.09") */
  title?: string;
  /** 읽은 만큼의 근무표. 사용자가 직접 수정해서 쓸 수 있다. */
  shifts?: ShiftDay[];
  months?: [ShiftDay[], ShiftDay[]];
  diagnostics?: MonthReading[];
}

export type AnalysisResult = AnalysisSuccess | AnalysisFailure;

const SWAP_MARGIN = 0.15;
const MIN_FIT = 0.8;

function checkImage(img: RasterImage, reading: MonthReading, photo: 1 | 2): AnalysisFailure | null {
  const { grid, fit, month } = reading;
  if (!grid.detected) return { ok: false, kind: "not-calendar", photo };
  if (grid.detected && grid.rows < calendarRows(month.year, month.month) && fit < MIN_FIT) {
    return { ok: false, kind: "cropped", photo };
  }
  if (fit < MIN_FIT) return { ok: false, kind: "month-mismatch", photo };
  void img;
  return null;
}

/**
 * 첫 번째 사진 = 기준월, 두 번째 사진 = 다음 달.
 * 기준월 21일~말일, 다음 달 1일~20일을 읽어 정산기간 근무표를 만든다.
 */
export function analyzePair(first: RasterImage, second: RasterImage, base: YearMonth): AnalysisResult {
  // 라이트/다크 테마는 사진마다 따로 추정한다 (두 장이 서로 다른 테마여도 된다).
  const next = addMonths(base, 1);
  const straight = [fitMonth(first, base), fitMonth(second, next)] as const;
  const crossed = [fitMonth(second, base), fitMonth(first, next)] as const;
  const swapped = crossed[0].fit + crossed[1].fit > straight[0].fit + straight[1].fit + SWAP_MARGIN;

  const [baseImg, nextImg] = swapped ? [second, first] : [first, second];
  const [baseReading, nextReading] = swapped ? crossed : straight;
  const diagnostics = [baseReading, nextReading];

  // 두 달 모두 1일~말일 전체를 읽는다 (다음 정산에도 쓰도록 월별 근무표로 저장)
  const months: [ShiftDay[], ShiftDay[]] = [
    readDays(baseImg, baseReading, 1, daysInMonth(base.year, base.month)),
    readDays(nextImg, nextReading, 1, daysInMonth(next.year, next.month)),
  ];
  const shifts = [...months[0].filter((d) => d.date >= toISODate(base.year, base.month, 21)), ...months[1].slice(0, 20)];

  const basePhoto: 1 | 2 = swapped ? 2 : 1;
  const nextPhoto: 1 | 2 = swapped ? 1 : 2;
  const problem = checkImage(baseImg, baseReading, basePhoto) ?? checkImage(nextImg, nextReading, nextPhoto);
  if (problem) {
    const title =
      problem.kind === "month-mismatch"
        ? mismatchTitle(problem.photo === basePhoto ? baseImg : nextImg, problem.photo === basePhoto ? base : next)
        : undefined;
    return { ...problem, title, shifts, months, diagnostics };
  }

  // 선택한 연/월과 사진 속 근무표의 연/월이 맞는지 (제목 → 달력 구조)
  const checks: [MonthCheck, MonthCheck] = [checkMonth(baseImg, baseReading, base), checkMonth(nextImg, nextReading, next)];
  for (const [check, photo] of [
    [checks[0], basePhoto],
    [checks[1], nextPhoto],
  ] as const) {
    if (check.status === "reject") return { ok: false, kind: "month-mismatch", photo, title: check.title, shifts, months, diagnostics };
  }

  const unsure = shifts.filter((s) => s.confidence < 0.5).length;
  if (unsure > shifts.length * 0.25) {
    // 어느 사진이 흐린지 알려 준다 (정산기간 안에서 확신 없는 날이 더 많은 쪽)
    const share = (days: ShiftDay[]) => days.filter((d) => d.confidence < 0.5).length / Math.max(1, days.length);
    const baseStart = toISODate(base.year, base.month, 21);
    const photo = share(months[0].filter((d) => d.date >= baseStart)) >= share(months[1].slice(0, 20)) ? basePhoto : nextPhoto;
    return { ok: false, kind: "low-confidence", photo, shifts, months, diagnostics };
  }

  const warnings: MonthWarning[] = [];
  checks.forEach((check, i) => {
    if (check.status === "confirm") {
      warnings.push({ photo: i === 0 ? basePhoto : nextPhoto, month: i === 0 ? base : next, reason: check.reason, title: check.title });
    }
  });
  const fingerprints: [string, string] = [photoFingerprint(baseImg, baseReading.grid), photoFingerprint(nextImg, nextReading.grid)];
  return { ok: true, shifts, months, swapped, checks, warnings, fingerprints, diagnostics };
}

// ---------- 한 달 추가 ----------

export type MonthAnalysis =
  | {
      ok: true;
      days: ShiftDay[];
      check: MonthCheck;
      /** 사용자 확인이 필요하면 경고 (자동 통과 아님) */
      warning?: MonthWarning;
      fingerprint: string;
      diagnostics: MonthReading;
    }
  | { ok: false; kind: AnalysisErrorKind; title?: string; days?: ShiftDay[]; diagnostics?: MonthReading };

/** 사진 한 장으로 한 달(1일~말일) 근무표를 읽는다. [다음 달 근무표 추가]·[다시 등록]에 쓴다. */
export function analyzeMonth(img: RasterImage, ym: YearMonth): MonthAnalysis {
  const reading = fitMonth(img, ym);
  const days = readDays(img, reading, 1, daysInMonth(ym.year, ym.month));
  const problem = checkImage(img, reading, 1);
  if (problem) {
    const title = problem.kind === "month-mismatch" ? mismatchTitle(img, ym) : undefined;
    return { ok: false, kind: problem.kind, title, days, diagnostics: reading };
  }
  const check = checkMonth(img, reading, ym);
  if (check.status === "reject") return { ok: false, kind: "month-mismatch", title: check.title, days, diagnostics: reading };
  const unsure = days.filter((d) => d.confidence < 0.5).length;
  if (unsure > days.length * 0.25) return { ok: false, kind: "low-confidence", days, diagnostics: reading };
  const warning: MonthWarning | undefined =
    check.status === "confirm" ? { photo: 1, month: ym, reason: check.reason, title: check.title } : undefined;
  return { ok: true, days, check, warning, fingerprint: photoFingerprint(img, reading.grid), diagnostics: reading };
}
