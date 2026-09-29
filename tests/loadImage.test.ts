import { afterEach, expect, it, vi } from 'vitest';
import { loadRaster } from '../src/lib/analyzer/loadImage';

afterEach(() => vi.unstubAllGlobals());

function setup(width: number, height: number, fail = false) {
  const close = vi.fn();
  const canvas = { width: 0, height: 0, getContext: vi.fn() };
  const drawImage = vi.fn();
  canvas.getContext.mockReturnValue({ drawImage, getImageData: () => {
    if (fail || canvas.width * canvas.height > 4_000_000) throw new Error('canvas allocation failed');
    return { data: new Uint8ClampedArray(canvas.width * canvas.height * 4) };
  } });
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
  return { canvas, close, drawImage };
}

it('bounds high-resolution screenshot allocation before reading pixels', async () => {
  const { canvas, close } = setup(2880, 6400);
  const image = await loadRaster(new Blob());
  expect(image.width).toBeLessThanOrEqual(1440);
  expect(image.width * image.height).toBeLessThanOrEqual(4_000_000);
  expect(image.width / image.height).toBeCloseTo(2880 / 6400, 2);
  expect(canvas.width).toBe(0);
  expect(close).toHaveBeenCalledOnce();
});
it('preserves ordinary iPhone screenshot dimensions', async () => {
  setup(1179, 2556);
  const image = await loadRaster(new Blob());
  expect([image.width, image.height]).toEqual([1179, 2556]);
});
it('releases canvas and bitmap even if pixel read fails', async () => {
  const { canvas, close } = setup(100, 200, true);
  await expect(loadRaster(new Blob())).rejects.toThrow();
  expect(canvas.width).toBe(0);
  expect(canvas.height).toBe(0);
  expect(close).toHaveBeenCalledOnce();
});
