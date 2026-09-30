// RGBA 래스터와 픽셀 색상 분류. 브라우저(Canvas ImageData)와 테스트(Node) 양쪽에서 쓴다.
import { type Background, backgroundOf } from "./theme";

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 길이 = width * height * 4 */
  data: Uint8ClampedArray | Uint8Array;
}

export interface Colour {
  /** max − min of RGB (0~255): colourfulness independent of brightness */
  chroma: number;
  /** hue in degrees, NaN for neutral pixels */
  hue: number;
  luminance: number;
  max: number;
}

export function colour(r: number, g: number, b: number): Colour {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = Number.NaN;
  if (d > 0) {
    if (max === r) hue = (((g - b) / d) % 6) * 60;
    else if (max === g) hue = ((b - r) / d + 2) * 60;
    else hue = ((r - g) / d + 4) * 60;
    if (hue < 0) hue += 360;
  }
  return { chroma: d, hue, luminance: (r + g + b) / 3, max };
}

/** A pixel is neutral (grey scale: text, grid, C circle) when its colour is weak relative to its brightness. */
export function isNeutral(c: Colour): boolean {
  return c.chroma <= Math.max(NEUTRAL_MIN_CHROMA_ALLOWANCE, c.max * NEUTRAL_CHROMA_RATIO);
}
/** 무채색 허용 채도: 어두운 픽셀에서도 최소 이만큼 */
const NEUTRAL_MIN_CHROMA_ALLOWANCE = 24;
/** 무채색 허용 채도: 밝기(최댓값)의 25% 이하 */
const NEUTRAL_CHROMA_RATIO = 0.25;

/**
 * yellow/blue/red: 색이 있는 표시 (A 원, B 원, 빨간 '휴')
 * dark: 배경과 뚜렷이 다른 무채색 (C 원, 글자). 라이트 테마에서는 어두운 색, 다크 테마에서는 밝은 색이다.
 * faint: 배경과 약간 다른 무채색 (흐린 표시·경계 번짐). 근무로 읽지 않고 '불확실' 판단에만 쓴다.
 */
export type PixelClass = "yellow" | "blue" | "dark" | "faint" | "red" | "none";

/** 흰 배경 (테마를 모를 때의 기본값: 기존 라이트 화면과 같은 기준) */
export const LIGHT_BACKGROUND: Background = backgroundOf(255);

/**
 * 오늘근무 색상(실제 스크린샷에서 측정, 라이트 테마):
 *   A 노랑 ≈ rgb(252,217,1)   B 파랑 ≈ rgb(84,133,237)   C 차콜 ≈ rgb(66,66,66) (흰 배경 대비 0.74)
 *   다른 달(흐린) 원 ≈ rgb(221,230,250) / rgb(217,217,217) (배경 대비 ≈ 0.15) → 근무로 읽지 않는다.
 * 절대 밝기 대신 '배경과의 대비'와 채도·색상각으로 판별하므로 다크 테마(밝은 C 원·글자)도 같은 기준으로 읽는다.
 */
export function classifyPixel(
  r: number,
  g: number,
  b: number,
  bg: Background = LIGHT_BACKGROUND,
  surface?: Background,
): PixelClass {
  // The cell's own surface colour (e.g. a tinted "today" fill) is background, whatever its hue.
  if (
    surface &&
    Math.abs(r - surface.rgb[0]) <= SURFACE_TOLERANCE &&
    Math.abs(g - surface.rgb[1]) <= SURFACE_TOLERANCE &&
    Math.abs(b - surface.rgb[2]) <= SURFACE_TOLERANCE
  ) {
    return "none";
  }
  // Hot path (every cell pixel): same rules as colour()/isNeutral()/contrast(), without allocations.
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  const chroma = max - min;
  if (chroma <= Math.max(NEUTRAL_MIN_CHROMA_ALLOWANCE, max * NEUTRAL_CHROMA_RATIO)) {
    const k = Math.abs((r + g + b) / 3 - bg.luminance) / bg.range;
    if (k >= MARKER_INK_CONTRAST) return "dark";
    return k >= FAINT_INK_CONTRAST ? "faint" : "none";
  }
  if (chroma < COLOUR_MIN_CHROMA) return "none";
  let hue: number;
  if (max === r) hue = (((g - b) / chroma) % 6) * 60;
  else if (max === g) hue = ((b - r) / chroma + 2) * 60;
  else hue = ((r - g) / chroma + 4) * 60;
  if (hue < 0) hue += 360;
  if (hue >= 35 && hue <= 70) return chroma >= YELLOW_MIN_CHROMA ? "yellow" : "none";
  if (hue >= 200 && hue <= 240) return "blue";
  if (hue <= 20 || hue >= 330) return "red";
  return "none";
}

/**
 * 무채색 표시(C 원)로 볼 최소 배경 대비.
 * 오늘근무는 원 색을 테마와 관계없이 그대로 쓴다: C 원 rgb(66,66,66)은 흰 바탕에서 대비 0.74, 검은 바탕에서 0.26.
 * 앞뒤 달의 흐린 원은 흰 바탕 ≈0.15, 검은 바탕 ≈0.05(C)·0.19(B)이며 이번 달 칸에는 나오지 않는다.
 */
const MARKER_INK_CONTRAST = 0.2;
/** 배경과 '무언가 다르다'고 볼 최소 대비 (압축 잡음·번짐보다 크고 흐린 표시보다 작다) */
const FAINT_INK_CONTRAST = 0.1;
/** 칸 바탕색과 채널별 차이가 이 이하이면 바탕으로 본다 (압축 잡음·강조 배경의 얼룩 허용) */
const SURFACE_TOLERANCE = 24;
/** 색이 있는 표시로 볼 최소 채도(RGB 최대−최소). 흐린 파랑 원(≈29)은 제외 */
const COLOUR_MIN_CHROMA = 60;
/** 노랑 A 원은 채도가 매우 높다(≈250). 연한 노랑 강조·경계 번짐은 제외 */
const YELLOW_MIN_CHROMA = 100;

export function luminanceAt(img: RasterImage, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
}

export interface ClassCounts {
  yellow: number;
  blue: number;
  dark: number;
  faint: number;
  red: number;
  total: number;
}

/** 사각 영역 안 픽셀을 색상 클래스별로 센다. */
export function countClasses(
  img: RasterImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bg: Background = LIGHT_BACKGROUND,
  surface?: Background,
): ClassCounts {
  const counts: ClassCounts = { yellow: 0, blue: 0, dark: 0, faint: 0, red: 0, total: 0 };
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(img.width, Math.ceil(x1));
  const bottom = Math.min(img.height, Math.ceil(y1));
  const { data, width } = img;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4;
      const c = classifyPixel(data[i], data[i + 1], data[i + 2], bg, surface);
      if (c !== "none") counts[c] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/** 이 픽셀이 날짜 숫자의 '진한 잉크'인지: 배경 대비가 기준 이상인 무채색, 또는 충분히 진한 색 글자(주말 날짜) */
export function isDateInk(r: number, g: number, b: number, bg: Background, threshold: number): boolean {
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  const chroma = max - min;
  const k = Math.abs((r + g + b) / 3 - bg.luminance) / bg.range;
  if (chroma <= Math.max(NEUTRAL_MIN_CHROMA_ALLOWANCE, max * NEUTRAL_CHROMA_RATIO)) return k >= threshold;
  return chroma >= max * COLOURED_TEXT_SATURATION && k >= threshold * COLOURED_TEXT_CONTRAST_SHARE;
}
/** 주말 날짜처럼 색 있는 글자: 채도 55% 이상 (흐린 앞뒤 달 빨간 날짜 ≈ 12%) */
const COLOURED_TEXT_SATURATION = 0.55;
/** 색 글자는 밝기 대비가 무채색 글자보다 작으므로 기준의 절반만 요구한다 */
const COLOURED_TEXT_CONTRAST_SHARE = 0.5;

/** 날짜 숫자 영역의 '진한 잉크' 비율. 이번 달 날짜는 진하고, 앞뒤 달 날짜는 흐리다. */
export function inkRatio(
  img: RasterImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bg: Background = LIGHT_BACKGROUND,
  threshold = DEFAULT_DATE_INK_CONTRAST,
): number {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(img.width, Math.ceil(x1));
  const bottom = Math.min(img.height, Math.ceil(y1));
  const { data, width } = img;
  let ink = 0;
  let total = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4;
      if (isDateInk(data[i], data[i + 1], data[i + 2], bg, threshold)) ink += 1;
      total += 1;
    }
  }
  return total === 0 ? 0 : ink / total;
}
/** 흰 배경에서 밝기 ≈140 미만 (기존 기준과 같음) */
export const DEFAULT_DATE_INK_CONTRAST = 0.45;
