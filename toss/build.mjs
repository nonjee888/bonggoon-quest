// 토스 미니앱용 dist/ 만들기: index.html·이미지 복사 + toss.js 끼워 넣기. 원본 파일은 건드리지 않아요.
import { cpSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
cpSync("img", "dist/img", { recursive: true });
cpSync("manifest.webmanifest", "dist/manifest.webmanifest");

const src = readFileSync("index.html", "utf8");
const out = src
  // 앱인토스 체크리스트: 핀치 줌 막기 (미니앱에서만. 웹 사이트는 확대 가능 그대로)
  .replace('content="width=device-width,initial-scale=1,viewport-fit=cover"',
           'content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no"')
  // 본문 스크립트보다 먼저 실행돼야 GoatCounter 꼬리표가 붙어요
  .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<script src="toss.js"></script>');
if (!out.includes("user-scalable=no") || !out.includes('src="toss.js"')) throw new Error("index.html 머리말이 바뀌었어요: toss/build.mjs 치환 문자열을 맞춰 주세요");
writeFileSync("dist/index.html", out);

await build({ entryPoints: ["toss/entry.js"], bundle: true, minify: true, format: "iife", target: "es2018", outfile: "dist/toss.js",
  // 상위 폴더에 Yarn PnP 파일(.pnp.cjs)이 있으면 esbuild가 node_modules를 못 찾아요 → Node 방식으로 직접 찾게 해요
  plugins: [{ name: "node-resolve", setup: (b) => b.onResolve({ filter: /^[^./]/ }, (a) => ({ path: createRequire(a.importer).resolve(a.path) })) }] });
console.log("dist/ 준비 완료");
