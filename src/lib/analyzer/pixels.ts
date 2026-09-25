// RGBA 래스터와 픽셀 색상 분류. 브라우저(Canvas ImageData)와 테스트(Node) 양쪽에서 쓴다.

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 길이 = width * height * 4 */
  data: Uint8ClampedArray | Uint8Array;
}

export type PixelClass = "yellow" | "blue" | "dark" | "red" | "none";

/**
 * 오늘근무 색상(실제 스크린샷에서 측정):
 *   A 노랑 ≈ rgb(255,216,2)   B 파랑 ≈ rgb(85,135,236)   C 차콜 ≈ rgb(66,66,66)
 *   다른 달(흐린) 원 ≈ rgb(221,230,250) / rgb(215,215,215) → 채도·명도 조건에서 제외된다.
 * RGB 대신 HSV 범위로 판별해 안티앨리어싱과 기기별 색 차이를 허용한다.
 */
export function classifyPixel(r: number, g: number, b: number): PixelClass {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;

  if (v < 0.4 && s < 0.25) return "dark";
  if (s < 0.4 || v < 0.5) return "none";

  const d = max - min;
  let h: number;
  if (max === r) h = (((g - b) / d) % 6) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h < 0) h += 360;

  if (s > 0.5 && v > 0.6 && h >= 35 && h <= 70) return "yellow";
  if (h >= 200 && h <= 240) return "blue";
  if (h <= 20 || h >= 330) return "red";
  return "none";
}

export function luminanceAt(img: RasterImage, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
}

export interface ClassCounts {
  yellow: number;
  blue: number;
  dark: number;
  red: number;
  total: number;
}

/** 사각 영역 안 픽셀을 색상 클래스별로 센다. */
export function countClasses(img: RasterImage, x0: number, y0: number, x1: number, y1: number): ClassCounts {
  const counts: ClassCounts = { yellow: 0, blue: 0, dark: 0, red: 0, total: 0 };
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(img.width, Math.ceil(x1));
  const bottom = Math.min(img.height, Math.ceil(y1));
  const { data, width } = img;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4;
      const c = classifyPixel(data[i], data[i + 1], data[i + 2]);
      if (c !== "none") counts[c] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/** 날짜 숫자 영역의 '진한 잉크' 비율. 이번 달 날짜는 진하고, 앞뒤 달 날짜는 흐리다. */
export function inkRatio(img: RasterImage, x0: number, y0: number, x1: number, y1: number): number {
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
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const v = max / 255;
      const s = max === 0 ? 0 : (max - min) / max;
      if (v < 0.55 || (s > 0.55 && v > 0.3)) ink += 1;
      total += 1;
    }
  }
  return total === 0 ? 0 : ink / total;
}

export function meanLuminance(img: RasterImage, y0: number, y1: number, step = 4): number {
  let sum = 0;
  let n = 0;
  const top = Math.max(0, Math.floor(y0));
  const bottom = Math.min(img.height, Math.ceil(y1));
  for (let y = top; y < bottom; y += step) {
    for (let x = 0; x < img.width; x += step) {
      sum += luminanceAt(img, x, y);
      n += 1;
    }
  }
  return n === 0 ? 255 : sum / n;
}
