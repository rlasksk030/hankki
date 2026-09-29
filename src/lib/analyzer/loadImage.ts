import type { RasterImage } from "./pixels";

/**
 * 선택한 사진을 기기 안에서 Canvas로 그려 픽셀을 읽는다.
 * 사진은 어디에도 업로드되지 않고, 분석이 끝나면 메모리에서 사라진다.
 */
export async function loadRaster(file: Blob): Promise<RasterImage> {
  const { source, width, height, release } = await decode(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (!width || !height) throw new Error("empty image");
    // Keep analysis buffers bounded for high-resolution/scrolling screenshots.
    // Ordinary iPhone images remain at their original resolution.
    const scale = Math.min(1, 1440 / width, Math.sqrt(4_000_000 / (width * height)));
    const targetWidth = Math.max(1, Math.floor(width * scale));
    const targetHeight = Math.max(1, Math.floor(height * scale));
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
