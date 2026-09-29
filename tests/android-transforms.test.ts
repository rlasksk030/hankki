import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { analyzeMonth } from '../src/lib/analyzer/analyze';
import { EXPECTED_MONTHS } from './expected';

const fixture = fileURLToPath(new URL('./fixtures/deid-2026-09.png', import.meta.url));
for (const format of ['png', 'jpeg', 'webp'] as const) {
  for (const width of [720, 1080, 1440]) {
    it(`${format} ${width}px retains all shifts`, async () => {
      const encoded = await sharp(fixture).resize({ width }).toFormat(format).toBuffer();
      const { data, info } = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const result = analyzeMonth({ width: info.width, height: info.height, data }, { year: 2026, month: 9 });
      expect(result.ok, JSON.stringify(result.ok ? {} : {kind: result.kind, diagnostics: result.diagnostics})).toBe(true);
      if (result.ok) expect(result.days.map(d => d.shift)).toEqual(EXPECTED_MONTHS['2026-09']);
    });
  }
}
for (const top of [0, 150, 300]) {
  it(`extra system bars top=${top}`, async () => {
    const { data, info } = await sharp(fixture).extend({ top, bottom: 150, background: '#ffffff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = analyzeMonth({ width: info.width, height: info.height, data }, { year: 2026, month: 9 });
    expect(result.ok, JSON.stringify(result.ok ? {} : {kind: result.kind, diagnostics: result.diagnostics})).toBe(true);
    if (result.ok) expect(result.days.map(d => d.shift)).toEqual(EXPECTED_MONTHS['2026-09']);
  });
}
