// Derived only from public, deidentified fixtures. Device emulation is not hardware testing.
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { test, expect, devices } from '@playwright/test';
import { BASE } from './target';

const fixture = (month: string) => fileURLToPath(new URL(`../tests/fixtures/deid-2026-${month}.png`, import.meta.url));
test.use({ viewport: devices['Pixel 7'].viewport, userAgent: devices['Pixel 7'].userAgent });

const cases = [
  { name: 'PNG high resolution', format: 'png', width: 2880, mime: 'image/png', extension: 'png' },
  { name: 'JPEG', format: 'jpeg', width: 1080, mime: 'image/jpeg', extension: 'jpg' },
  { name: 'WebP', format: 'webp', width: 1440, mime: 'image/webp', extension: 'webp' },
  { name: 'empty MIME and no extension', format: 'png', width: 1080, mime: '', extension: '' },
  { name: 'incorrect MIME and extension', format: 'png', width: 1080, mime: 'application/octet-stream', extension: 'jpg' },
  { name: 'EXIF orientation 6', format: 'jpeg', width: 1080, mime: 'image/jpeg', extension: 'jpg', rotate: true },
] as const;
for (const fallback of [false, true]) {
  for (const scenario of cases) {
    test(`${fallback ? 'Image fallback' : 'bitmap'}: ${scenario.name}`, async ({ page }) => {
      if (fallback) await page.addInitScript(() => {
        window.createImageBitmap = async () => { throw new Error('simulated unsupported decoder'); };
      });
      await page.clock.setFixedTime(new Date('2026-09-25T10:00:00+09:00'));
      await page.goto(BASE);
      await page.getByRole('button', { name: '근무표 등록하기' }).click();
      await page.getByRole('button', { name: '계속' }).click();
      for (const [index, month] of ['09', '10'].entries()) {
        let buffer = await sharp(fixture(month)).resize({ width: scenario.width }).png().toBuffer();
        let pipeline = sharp(buffer);
        if ('rotate' in scenario) pipeline = pipeline.rotate(270).withMetadata({ orientation: 6 });
        buffer = await pipeline.toFormat(scenario.format).toBuffer();
        await page.getByLabel(new RegExp(`${index + 1}번째 사진 선택`)).setInputFiles({
          name: `screenshot-${month}${scenario.extension ? '.' + scenario.extension : ''}`,
          mimeType: scenario.mime, buffer,
        });
      }
      await page.getByRole('button', { name: '근무표 분석하기' }).click();
      await expect(page.getByTestId('result-allowance')).toHaveText('7', { timeout: 20000 });
    });
  }
}
