import type { RasterImage } from "./pixels";

/**
 * 선택한 사진을 기기 안에서 Canvas로 그려 픽셀을 읽는다.
 * 사진은 어디에도 업로드되지 않고, 분석이 끝나면 메모리에서 사라진다.
 */
export async function loadRaster(file: Blob): Promise<RasterImage> {
  const { source, width, height, release } = await decode(file);
  try {
    if (!width || !height) throw new Error("empty image");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(source, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    // iOS Safari의 Canvas 메모리를 빨리 돌려준다
    canvas.width = 0;
    canvas.height = 0;
    return { width, height, data };
  } finally {
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
