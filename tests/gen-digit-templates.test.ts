// 숫자 기준표(src/lib/analyzer/digitTemplates.ts) 생성기. 평소 테스트에서는 건너뛴다.
// 실행: HANKKI_GEN_TEMPLATES=1 npx vitest run tests/gen-digit-templates.test.ts
//
// - 0~9 모두: 실제 오늘근무 스크린샷 제목("2026.09" ~ "2027.08")의 글자에서 직접 추출
// - 실제 화면에 없는 숫자가 생기면, 실제 글자와 가장 잘 맞는 산세리프 굵은 글꼴로 그린 숫자로 보충한다
//   (글꼴 후보 평가 결과는 생성 파일 머리말에 남긴다)
//   (글꼴 후보를 실제 글자 판독 정확도로 비교해 가장 잘 맞는 글꼴을 고른다)
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { it } from "vitest";
import type { RasterImage } from "../src/lib/analyzer/pixels";
import { type Glyph, findTitleGlyphs, glyphFeatures } from "../src/lib/analyzer/title";

const fixture = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const run = process.env.HANKKI_GEN_TEMPLATES ? it : it.skip;

async function decode(input: string | Buffer): Promise<RasterImage> {
  const { data, info } = await sharp(input).flatten({ background: "#fff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

function inkBox(img: RasterImage): Glyph {
  let x0 = img.width, x1 = -1, y0 = img.height, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if ((img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3 < 110) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  return { x0, x1, y0, y1 };
}

async function rendered(font: string, weight: number, digit: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="90"><rect width="80" height="90" fill="#fff"/><text x="12" y="70" font-family="${font}" font-weight="${weight}" font-size="64" fill="#1c1c1e">${digit}</text></svg>`;
  const img = await decode(Buffer.from(svg));
  return glyphFeatures(img, inkBox(img));
}

const dist = (a: number[], b: number[]) => {
  let d = 0;
  for (let i = 0; i < a.length - 1; i++) d += (a[i] - b[i]) ** 2;
  d += 4 * (a[a.length - 1] - b[b.length - 1]) ** 2;
  return Math.sqrt(d);
};

run("숫자 기준표 생성", async () => {
  // 1) 실제 제목 글자
  const real: Record<number, number[][]> = {};
  const sources: Array<[string, string]> = [
    ["deid-2026-09.png", "202609"],
    ["deid-2026-10.png", "202610"],
    ["private/oneulgeunmu-2026-09.webp", "202609"],
    ["private/oneulgeunmu-2026-10.webp", "202610"],
    ["deid-2026-11.png", "202611"],
    ["deid-2026-12.png", "202612"],
    ["deid-2027-01.png", "202701"],
    ["deid-2027-02.png", "202702"],
    ["deid-2027-03.png", "202703"],
    ["deid-2027-04.png", "202704"],
    ["private/oneulgeunmu-2026-11.webp", "202611"],
    ["private/oneulgeunmu-2026-12.webp", "202612"],
    ["private/oneulgeunmu-2027-01.webp", "202701"],
    ["private/oneulgeunmu-2027-02.webp", "202702"],
    ["private/oneulgeunmu-2027-03.webp", "202703"],
    ["private/oneulgeunmu-2027-04.webp", "202704"],
    ["private/oneulgeunmu-2026-09-b.webp", "202609"],
    ["deid-2027-05.png", "202705"],
    ["deid-2027-08.png", "202708"],
    ["private/oneulgeunmu-2027-05.webp", "202705"],
    ["private/oneulgeunmu-2027-08.webp", "202708"],
  ];
  for (const [file, digits] of sources) {
    if (!existsSync(fixture(file))) continue;
    for (const width of [0, 1179, 600]) {
      let img = await decode(fixture(file));
      if (width) {
        const { data, info } = await sharp(fixture(file)).resize({ width }).flatten({ background: "#fff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        img = { width: info.width, height: info.height, data: new Uint8Array(data) };
      }
      const glyphs = findTitleGlyphs(img);
      if (glyphs.length !== 7) throw new Error(`${file}@${width}: 제목 글자 ${glyphs.length}개`);
      [0, 1, 2, 3, 5, 6].forEach((gi, k) => {
        const d = Number(digits[k]);
        (real[d] ??= []).push(glyphFeatures(img, glyphs[gi]));
      });
    }
  }
  const mean = (list: number[][]) => list[0].map((_, i) => list.reduce((s, v) => s + v[i], 0) / list.length);

  // 2) 글꼴 후보 평가: 그린 숫자만으로 실제 글자를 얼마나 잘 맞히는지
  const fonts = ["Liberation Sans", "Noto Sans CJK KR", "DejaVu Sans", "FreeSans"];
  const report: string[] = [];
  let best: { font: string; weight: number; score: number; templates: number[][] } | null = null;
  for (const font of fonts) {
    for (const weight of [600, 700]) {
      const templates = await Promise.all(Array.from({ length: 10 }, (_, d) => rendered(font, weight, d)));
      let correct = 0;
      let total = 0;
      let minMargin = Infinity;
      for (const [d, list] of Object.entries(real)) {
        for (const f of list) {
          const ds = templates.map((t) => dist(f, t));
          const order = ds.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
          total += 1;
          if (order[0][1] === Number(d)) correct += 1;
          minMargin = Math.min(minMargin, order[1][0] / order[0][0]);
        }
      }
      const score = correct / total + Math.min(minMargin, 3) / 100;
      report.push(`${font} ${weight}: ${correct}/${total} 정확, 최소 여유 ${minMargin.toFixed(2)}배`);
      if (!best || score > best.score) best = { font, weight, score, templates };
    }
  }

  // 3) 최종 기준표: 실제 글자가 있는 숫자는 실제 평균, 나머지는 가장 잘 맞는 글꼴
  const final = Array.from({ length: 10 }, (_, d) => (real[d] ? mean(real[d]) : best!.templates[d]));
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const body = final.map((t, d) => `  // ${d}: ${real[d] ? `실제 제목 글자 ${real[d].length}개 평균` : `${best!.font} ${best!.weight}`}\n  [${t.map(round).join(", ")}],`).join("\n");
  writeFileSync(
    fileURLToPath(new URL("../src/lib/analyzer/digitTemplates.ts", import.meta.url)),
    `// 자동 생성 파일: HANKKI_GEN_TEMPLATES=1 npx vitest run tests/gen-digit-templates.test.ts\n// 숫자별 5×7 칸 잉크 밀도 + 가로세로 비율 (src/lib/analyzer/title.ts의 glyphFeatures)\n// 글꼴 후보 평가:\n${report.map((r) => `//   ${r}`).join("\n")}\nexport const DIGIT_TEMPLATES: number[][] = [\n${body}\n];\n`,
  );
  console.log(report.join("\n"));
}, 180_000);
