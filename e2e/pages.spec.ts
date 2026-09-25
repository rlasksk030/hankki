// GitHub Pages Project Site(https://<아이디>.github.io/hankki/) 하위 경로에서 배포 구조를 검증한다.
// (로컬 흉내 서버 또는 HANKKI_URL로 지정한 실제 공개 주소)
import { expect, test } from "@playwright/test";
import { BASE, BASE_PATH, ORIGIN } from "./target";

test("하위 경로에서 첫 페이지·CSS·아이콘·manifest가 404 없이 로드된다", async ({ page }) => {
  const failures: string[] = [];
  const cspErrors: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text());
  });

  await page.goto(BASE);
  await expect(page.getByText("근무표만 넣으면")).toBeVisible();

  // CSS 적용 확인 (배경색 #F7F7F5, 주요 버튼 차콜)
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(247, 247, 245)");
  const buttonBg = await page
    .getByRole("button", { name: "근무표 등록하기" })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(buttonBg).toBe("rgb(28, 28, 30)");

  // JS/CSS는 /hankki/assets/ 아래에서 로드
  const assetUrls = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel=stylesheet]")].map(
      (el) => ("src" in el && el.src) || (el as HTMLLinkElement).href,
    ),
  );
  expect(assetUrls.length).toBeGreaterThanOrEqual(2);
  for (const url of assetUrls) expect(url.startsWith(`${BASE}assets/`), url).toBe(true);

  // manifest와 아이콘
  const manifestHref = await page.evaluate(() => (document.querySelector("link[rel=manifest]") as HTMLLinkElement).href);
  expect(manifestHref).toBe(`${BASE}manifest.webmanifest`);
  const manifestRes = await page.request.get(manifestHref);
  expect(manifestRes.status()).toBe(200);
  const manifest = await manifestRes.json();
  expect(manifest.name).toBe("한끼");
  expect(manifest.display).toBe("standalone");
  expect(new URL(manifest.start_url, manifestHref).href).toBe(BASE);
  expect(new URL(manifest.scope, manifestHref).href).toBe(BASE);
  for (const icon of manifest.icons) {
    const res = await page.request.get(new URL(icon.src, manifestHref).href);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  const touchIcon = await page.evaluate(() => (document.querySelector("link[rel=apple-touch-icon]") as HTMLLinkElement).href);
  expect(touchIcon).toBe(`${BASE}icons/apple-touch-icon.png`);
  expect((await page.request.get(touchIcon)).status()).toBe(200);
  const favicon = await page.evaluate(() => (document.querySelector("link[rel=icon]") as HTMLLinkElement).href);
  expect((await page.request.get(favicon)).status()).toBe(200);

  // 외부 연결을 막는 CSP가 들어 있고, 위반은 없다
  const csp = await page.evaluate(
    () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "",
  );
  expect(csp).toContain("connect-src 'self'");
  expect(failures).toEqual([]);
  expect(cspErrors).toEqual([]);
});

test("서비스 워커가 /hankki/ 범위로 등록되고, 캐시한 파일이 모두 존재한다", async ({ page }) => {
  await page.goto(BASE);
  const info = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => k.startsWith("hankki-"))!);
    const cached = (await cache.keys()).map((r) => r.url);
    return { scope: reg.scope, script: reg.active?.scriptURL, cached };
  });
  expect(info.scope).toBe(BASE);
  expect(info.script).toBe(`${BASE}sw.js`);
  expect(info.cached).toContain(BASE);
  expect(info.cached).toContain(`${BASE}manifest.webmanifest`);
  expect(info.cached.some((u) => u.startsWith(`${BASE}assets/`) && u.endsWith(".js"))).toBe(true);
  for (const url of info.cached) expect(url.startsWith(BASE), url).toBe(true);
});

test("없는 주소로 들어오거나 새로고침해도 404 화면이 아니라 앱으로 돌아온다", async ({ page }) => {
  await page.goto(`${BASE}history/2026-09?x=1`);
  await expect(page).toHaveURL(`${BASE}?x=1`);
  await expect(page.getByText("근무표만 넣으면")).toBeVisible();

  await page.goto(`${ORIGIN}${BASE_PATH.replace(/\/$/, "")}`);
  await expect(page).toHaveURL(BASE);
  await page.reload();
  await expect(page.getByText("근무표만 넣으면")).toBeVisible();
});
