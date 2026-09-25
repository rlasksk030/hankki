// E2E 대상 주소.
// 기본값: 로컬 GitHub Pages 흉내 서버(scripts/serve-pages.mjs)의 /hankki/
// HANKKI_URL을 주면 실제 공개 주소(예: https://rlasksk030.github.io/hankki/)를 그대로 검증한다.
const raw = process.env.HANKKI_URL ?? "http://localhost:4173/hankki/";

export const BASE = raw.endsWith("/") ? raw : `${raw}/`;
export const ORIGIN = new URL(BASE).origin;
/** 예: "/hankki/" */
export const BASE_PATH = new URL(BASE).pathname;
export const IS_LIVE = !!process.env.HANKKI_URL;
