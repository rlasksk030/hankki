import type { RasterImage } from "./pixels";

/** Longest analysis width and pixel budget for one decoded screenshot (RGBA ≈ 16 MB at the budget). */
const MAX_ANALYSIS_WIDTH = 1440;
const MAX_ANALYSIS_PIXELS = 4_000_000;

/**
 * Size of the analysis raster. Aspect ratio is kept; ordinary phone screenshots
 * (e.g. 1179×2556, 1320×2868) stay at their original resolution, larger or scrolling
 * captures are reduced so mobile browsers never hold several huge RGBA buffers.
 */
export function analysisSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_ANALYSIS_WIDTH / width, Math.sqrt(MAX_ANALYSIS_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

/**
 * 선택한 사진을 기기 안에서 Canvas로 그려 픽셀을 읽는다.
 * 사진은 어디에도 업로드되지 않고, 분석이 끝나면 메모리에서 사라진다.
 */
export async function loadRaster(file: Blob): Promise<RasterImage> {
  const { source, width, height, release } = await decode(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (!width || !height) throw new Error("empty image");
    const { width: targetWidth, height: targetHeight } = analysisSize(width, height);
    canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);
    return { width: targetWidth, height: targetHeight, data };
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    release();
  }
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* 아래 <img> 방식으로 재시도 */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}
