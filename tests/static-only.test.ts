// 배포 제한 검증: GitHub Pages 정적 파일만으로 동작해야 한다.
// 서버 코드, 서버 API, 외부 호스팅/유료 서비스 설정이나 네트워크 전송 코드가 생기면 실패한다.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : [full];
  });
}

describe("무료 정적 호스팅 전용", () => {
  it("서버·다른 호스팅 설정 파일이 없다 (GitHub Pages 정적 파일 전용)", () => {
    for (const path of [
      "functions",
      "api",
      "server",
      "vercel.json",
      "netlify.toml",
      "wrangler.toml",
      "wrangler.json",
      "_worker.js",
      "public/_headers",
      "public/_redirects",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
  });

  it("앱 코드가 서버·외부로 요청을 보내지 않는다 (계산·분석·저장은 모두 브라우저 안)", () => {
    const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /\bWebSocket\b/, /EventSource/, /["'`]\/api\//];
    for (const file of sourceFiles(join(root, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) expect(pattern.test(text), `${file}: ${pattern}`).toBe(false);
    }
  });

  it("서버·유료 서비스 의존성이 없다", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const name of deps) {
      expect(name, name).not.toMatch(/wrangler|@cloudflare\/|miniflare|vercel|netlify|firebase|supabase|express|hono|fastify/);
    }
    // 실행 시점 의존성은 React뿐
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["react", "react-dom"]);
  });
});

describe("GitHub Pages 배포 설정", () => {
  it("배포 빌드는 /hankki/ 하위 경로, 루트(/)를 하드코딩하지 않는다", () => {
    const config = readFileSync(join(root, "vite.config.ts"), "utf8");
    expect(config).toContain('PAGES_BASE = "/hankki/"');
    expect(config).toMatch(/command === "build" \? \(process\.env\.BASE_PATH \?\? PAGES_BASE\) : "\/"/);
    const main = readFileSync(join(root, "src/main.tsx"), "utf8");
    expect(main).toContain("import.meta.env.BASE_URL");
    const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    for (const icon of manifest.icons) expect(icon.src.startsWith("/"), icon.src).toBe(false);
    const html = readFileSync(join(root, "index.html"), "utf8");
    expect(html).not.toMatch(/(href|src)="\/(?!\/)/);
  });

  it("공식 GitHub Pages 배포 workflow가 main push로 동작한다", () => {
    const wf = readFileSync(join(root, ".github/workflows/deploy-pages.yml"), "utf8");
    expect(wf).toMatch(/branches:\s*\[\s*main\s*\]/);
    expect(wf).toContain("actions/configure-pages");
    expect(wf).toContain("actions/upload-pages-artifact");
    expect(wf).toContain("actions/deploy-pages");
    expect(wf).toContain("path: dist");
  });

  it("원본 스크린샷은 gitignore되어 공개 저장소에 올라가지 않는다", () => {
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    expect(ignore).toContain("tests/fixtures/private/");
  });

  it("사진 fixture 등 테스트 파일은 배포물(public/)에 들어가지 않는다", () => {
    const publicFiles = sourceFiles(join(root, "public")).map((f) => f.slice(root.length));
    for (const f of publicFiles) expect(f, f).not.toMatch(/\.(webp|jpe?g|json)$|fixtures/);
  });
});
