import { defineConfig } from "@playwright/test";

// iPhone 세로 화면(390×844, 3x)으로 빌드 결과물을 실제 브라우저에서 검증한다.
// GitHub Pages Project Site와 같은 하위 경로(/hankki/)에서 제공한다.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/hankki/",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    browserName: "chromium",
  },
  webServer: {
    command: "npm run build && node scripts/serve-pages.mjs 4173 hankki",
    url: "http://localhost:4173/hankki/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
