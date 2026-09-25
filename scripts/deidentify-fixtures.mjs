// 실제 오늘근무 스크린샷(로컬 전용, tests/fixtures/private/)에서 공개 저장소용 비식별 fixture를 만든다.
// 지우는 것: 상단 상태 표시줄(시각·배터리), 각 날짜 칸 오른쪽 위의 라벨(회사 연휴명, 음력 날짜, 공휴일명 등).
// 남기는 것: 달력 격자, 날짜 숫자, A/B/C 원과 '휴' 표시 (판독에 필요한 부분).
// 사용법: node scripts/deidentify-fixtures.mjs
import { existsSync } from "node:fs";
import sharp from "sharp";

const dir = new URL("../tests/fixtures/", import.meta.url);
const pairs = [
  ["private/oneulgeunmu-2026-09.webp", "deid-2026-09.png"],
  ["private/oneulgeunmu-2026-10.webp", "deid-2026-10.png"],
];

// 오늘근무 iPhone 세로 스크린샷의 달력 위치(이미지 비율)
const TOP = 0.132;
const BOTTOM = 0.8765;
const ROWS = 5;

for (const [src, out] of pairs) {
  const input = new URL(src, dir).pathname;
  if (!existsSync(input)) {
    console.log(`건너뜀: ${src} 없음`);
    continue;
  }
  const { width: w, height: h } = await sharp(input).metadata();
  const cw = w / 7;
  const top = h * TOP;
  const rowH = (h * BOTTOM - top) / ROWS;
  const rects = [`<rect x="0" y="0" width="${w}" height="${Math.round(h * 0.06)}" fill="#fff"/>`];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 7; c++) {
      const x = c * cw + cw * 0.28;
      const y = top + r * rowH + 3;
      rects.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cw * 0.72 - 3).toFixed(1)}" height="${(cw * 0.24 - 3).toFixed(1)}" fill="#fff"/>`);
    }
  }
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rects.join("")}</svg>`);
  await sharp(input).flatten({ background: "#fff" }).composite([{ input: mask }]).png().toFile(new URL(out, dir).pathname);
  console.log(`만듦: ${out}`);
}
