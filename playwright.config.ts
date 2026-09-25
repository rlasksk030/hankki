import { defineConfig } from "@playwright/test";
import { BASE, IS_LIVE } from "./e2e/target";

// iPhone 세로 화면(390×844, 3x)으로 빌드 결과물을 실제 브라우저에서 검증한다.
// 기본은 GitHub Pages Project Site와 같은 하위 경로(/hankki/)의 로컬 흉내 서버, HANKKI_URL이 있으면 실제 공개 주소.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    browserName: "chromium",
  },
  // HANKKI_URL(실제 공개 주소)이 있으면 로컬 서버 없이 그 주소를 검증한다
  webServer: IS_LIVE
    ? undefined
    : {
        command: "npm run build && node scripts/serve-pages.mjs 4173 hankki",
        url: BASE,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
