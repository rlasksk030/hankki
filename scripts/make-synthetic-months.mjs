// 11월·12월 오늘근무 화면 합성 fixture 생성 (사진 한 장으로 달을 추가하는 흐름 테스트용).
// 실제(비식별) 10월 화면(deid-2026-10.png)의 칸 조각을 그대로 옮겨 붙인다:
//   - 근무 표시(A/B/C 원, '휴')는 10월의 해당 근무 칸에서
//   - 날짜 숫자는 10월의 같은 날짜 칸에서
//   - 상단 제목("2026.11")은 10월 화면 제목("2026.10")의 실제 글자 조각을 이어 붙여 만든다
// 달력 격자·색·크기는 실제 화면 그대로이고, 근무 패턴은 tests/fixtures/synthetic-months.json 값을 쓴다.
// 추가로 제목을 지운 10월 화면(synthetic-2026-10-notitle.png)을 만든다 — 제목을 못 읽을 때의 월 검증 테스트용.
// 사용법: node scripts/make-synthetic-months.mjs
import { readFileSync } from "node:fs";
import sharp from "sharp";

const dir = new URL("../tests/fixtures/", import.meta.url);
const patterns = JSON.parse(readFileSync(new URL("synthetic-months.json", dir), "utf8"));
const src = await sharp(new URL("deid-2026-10.png", dir).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = src.info;
const px = src.data;

// 실제 스크린샷에서 찾은 달력 격자 (이미지 비율)
const TOP = H * 0.132;
const BOTTOM = H * 0.8765;
const ROWS = 5;
const cw = W / 7;
const rowH = (BOTTOM - TOP) / ROWS;
const SRC_OFFSET = 4; // 2026-10-01 = 목요일

const cellRect = (index) => {
  const r = Math.floor(index / 7);
  const c = index % 7;
  return {
    left: Math.round(c * cw) + 2,
    right: Math.round((c + 1) * cw) - 2,
    top: Math.round(TOP + r * rowH) + 2,
    bottom: Math.round(TOP + (r + 1) * rowH) - 2,
  };
};
const srcCell = (day) => cellRect(SRC_OFFSET + day - 1);
// 10월에서 근무별 대표 칸: A=10/6, B=10/14, C=10/1, 휴=10/13
const SHIFT_SOURCE = { A: 6, B: 14, C: 1, OFF: 13 };

function copy(out, from, to, dx0, dy0, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((from.top + dy0 + y) * W + (from.left + dx0 + x)) * 4;
      const di = ((to.top + dy0 + y) * W + (to.left + dx0 + x)) * 4;
      out[di] = px[si];
      out[di + 1] = px[si + 1];
      out[di + 2] = px[si + 2];
      out[di + 3] = 255;
    }
  }
}

// 10월 화면 제목 "2026.10"의 글자별 가로 범위(px) — 실제 스크린샷에서 측정 (923px 폭 기준)
const TITLE_Y0 = Math.round(H * 0.06);
const TITLE_Y1 = Math.round(H * 0.115);
const GLYPH_X = { "2": [112, 138], "0": [143, 172], "6": [208, 236], ".": [242, 249], "1": [264, 279] };

function writeTitle(out, text) {
  let x = 112;
  for (const ch of text) {
    const [a, b] = GLYPH_X[ch];
    const w = b - a + 1;
    const pad = ch === "1" ? 5 : 0; // '1'은 좁아서 양옆 여백을 둔다 (실제 화면과 비슷하게)
    x += pad;
    for (let y = TITLE_Y0; y < TITLE_Y1; y++) {
      for (let dx = 0; dx < w; dx++) {
        const si = (y * W + a + dx) * 4;
        const di = (y * W + x + dx) * 4;
        out[di] = px[si];
        out[di + 1] = px[si + 1];
        out[di + 2] = px[si + 2];
        out[di + 3] = 255;
      }
    }
    x += w + pad + (ch === "." ? 15 : ch === "6" ? 6 : 5);
  }
}

function fillWhite(out, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.fill(255, (y * W + x) * 4, (y * W + x) * 4 + 4);
}

for (const [id, pattern] of Object.entries(patterns)) {
  if (id.startsWith("_")) continue;
  const [year, month] = id.split("-").map(Number);
  const offset = new Date(year, month - 1, 1).getDay();
  const out = Buffer.from(px);
  // 제목(2026.10)을 지우고 이 달 제목으로, 모든 칸 비우기(격자선은 남김)
  fillWhite(out, Math.round(W * 0.1), TITLE_Y0, Math.round(W * 0.5), TITLE_Y1);
  writeTitle(out, `${year}.${String(month).padStart(2, "0")}`);
  for (let i = 0; i < ROWS * 7; i++) {
    const r = cellRect(i);
    fillWhite(out, r.left, r.top, r.right, r.bottom);
  }
  const digitW = Math.round(cw * 0.28);
  const digitH = Math.round(cw * 0.24);
  pattern.forEach((shift, i) => {
    const day = i + 1;
    const to = cellRect(offset + day - 1);
    const w = to.right - to.left;
    const h = to.bottom - to.top;
    copy(out, srcCell(day), to, 0, 0, digitW, digitH); // 날짜 숫자
    copy(out, srcCell(SHIFT_SOURCE[shift]), to, 0, digitH, w, h - digitH); // 근무 표시
  });
  const file = `synthetic-${id}.png`;
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(new URL(file, dir).pathname);
  console.log(`만듦: ${file}`);
}

// 제목만 지운 10월 화면 (달력은 그대로)
{
  const out = Buffer.from(px);
  fillWhite(out, Math.round(W * 0.1), TITLE_Y0, Math.round(W * 0.5), TITLE_Y1);
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(new URL("synthetic-2026-10-notitle.png", dir).pathname);
  console.log("만듦: synthetic-2026-10-notitle.png");
}
