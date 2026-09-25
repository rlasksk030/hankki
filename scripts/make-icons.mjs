// 앱 아이콘 생성: npm run icons
// 따뜻한 오프화이트 바탕에 A·B·C 근무와 휴무를 뜻하는 3×3 원 격자.
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });

function svg({ padding = 0 } = {}) {
  const s = 1024;
  const k = (s - padding * 2) / 1024;
  const t = (v) => padding + v * k;
  // 3×3 근무 달력: A·B·C와 휴무(옅은 회색)
  const grid = [
    ["#F4C542", "#F4C542", "#4B7BD6"],
    ["#4B7BD6", "#DDDDD8", "#3A3A3C"],
    ["#3A3A3C", "#DDDDD8", "#F4C542"],
  ];
  const circles = grid
    .flatMap((row, r) =>
      row.map((fill, c) => `<circle cx="${t(302 + c * 210)}" cy="${t(302 + r * 210)}" r="${80 * k}" fill="${fill}"/>`),
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#F7F7F5"/>${circles}
</svg>`;
}

const targets = [
  ["apple-touch-icon.png", 180, 0],
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 150],
  ["favicon-32.png", 32, 0],
];

for (const [name, size, padding] of targets) {
  await sharp(Buffer.from(svg({ padding }))).resize(size, size).png().toFile(new URL(name, out).pathname);
  console.log("wrote", name);
}
