// GitHub Pages Project Site 흉내 서버 (테스트용).
// dist/를 http://localhost:<port>/<저장소>/ 아래에서 제공하고, 없는 주소는 GitHub처럼 404.html을 404 상태로 돌려준다.
// 사용법: node scripts/serve-pages.mjs [port] [repo]
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? 4173);
const repo = process.argv[3] ?? "hankki";
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function send(res, status, file) {
  res.writeHead(status, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const prefix = `/${repo}`;
  if (url.pathname === prefix) {
    res.writeHead(301, { Location: `${prefix}/${url.search}` });
    return res.end();
  }
  if (url.pathname.startsWith(`${prefix}/`)) {
    let rel = decodeURIComponent(url.pathname.slice(prefix.length + 1));
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    const file = normalize(join(dist, rel));
    if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) return send(res, 200, file);
  }
  send(res, 404, join(dist, "404.html"));
}).listen(port, () => console.log(`GitHub Pages 흉내 서버: http://localhost:${port}/${repo}/`));
