/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";

/**
 * 빌드 결과물 목록으로 서비스 워커(sw.js)를 만든다.
 * 앱 셸(HTML/JS/CSS/아이콘)을 전부 미리 캐시해서 오프라인에서도 기록 확인·수령 기록·사진 분석이 가능하다.
 * 외부 라이브러리(workbox 등) 없이 동작한다.
 */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "hankki-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async writeBundle() {
      const { writeFileSync } = await import("node:fs");
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split("\\").join("/"));
        }
      };
      walk(outDir);
      // GitHub Pages 전용 파일(404 안내, .nojekyll)은 앱 셸이 아니므로 캐시 목록에서 뺀다
      const hostingConfig = new Set(["sw.js", "404.html", ".nojekyll"]);
      const assets = files.filter((f) => !hostingConfig.has(f) && !f.endsWith(".map")).sort();
      const version = createHash("sha256").update(assets.join("|")).digest("hex").slice(0, 12);
      const precache = ["./", ...assets.map((f) => `./${f}`)];
      writeFileSync(join(outDir, "sw.js"), swSource(version, precache));
    },
  };
}

function swSource(version: string, precache: string[]): string {
  return `// 자동 생성 파일 (vite.config.ts). 직접 수정하지 마세요.
const CACHE = "hankki-${version}";
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hankki-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // 페이지 요청: 네트워크 우선, 실패하면 캐시된 앱 셸
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("./", copy));
          return response;
        })
        .catch(() => caches.match("./", { ignoreSearch: true })),
    );
    return;
  }

  // 정적 파일: 캐시 우선
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
`;
}

/**
 * GitHub Pages는 응답 헤더를 바꿀 수 없으므로, 빌드한 index.html에 CSP 메타 태그를 넣는다.
 * connect-src 'self' → 앱이 외부 서버로 근무표·수령 기록·사진을 보내는 것을 브라우저가 차단한다.
 * (개발 서버에서는 Vite HMR 때문에 넣지 않는다)
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "hankki-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

/**
 * GitHub Pages Project Site 주소: https://rlasksk030.github.io/hankki/
 * 배포 빌드는 /hankki/ 하위 경로 기준, 로컬 개발 서버는 / 기준.
 * 저장소 이름이 바뀌면 BASE_PATH 환경 변수로 바꿀 수 있다 (예: BASE_PATH=/other/ npm run build).
 */
export const PAGES_BASE = "/hankki/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? (process.env.BASE_PATH ?? PAGES_BASE) : "/",
  plugins: [react(), serviceWorker(), contentSecurityPolicy()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
}));
