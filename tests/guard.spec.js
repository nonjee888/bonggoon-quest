// @ts-check
// 지킴이 테스트: 문구·링크·오류·이미지·용량·점수 규칙·접근성 + 개인정보·보안
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ADOPT = "https://docs.google.com/forms/d/e/1FAIpQLSdcckkiHbTn-x0gjlqb-BRrDe7F87Wl344HkJy17aFVPztpWA/viewform";
const INSTA = "https://www.instagram.com/im.bonggoon/";
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

async function play(page, picks) {
  await page.getByRole("button", { name: "▶ 산책 궁합 알아보기" }).click();
  for (const k of picks) await page.locator("#opts .opt").nth(k).click();
  await expect(page.locator("#result")).toBeVisible();
}

// ── 문구 ─────────────────────────────────────────────
test("빼기로 한 말이 페이지에 다시 들어오지 않았다", () => {
  for (const word of ["어르신", "노즈워크", "임보 신청서", "임보신청서", "식당에서도 얌전히"]) {
    expect(html, `'${word}'가 다시 들어왔어요`).not.toContain(word);
  }
});

// ── 링크 ─────────────────────────────────────────────
test("입양 신청서·인스타 링크가 정확하고, 추적용 꼬리표가 없다", async ({ page }) => {
  await page.goto("./");
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const forms = hrefs.filter((h) => h.includes("docs.google.com"));
  expect(forms.length).toBeGreaterThan(0);
  for (const h of forms) expect(h).toBe(ADOPT);
  expect(hrefs).toContain(INSTA);
  for (const h of hrefs) expect(h, h).not.toMatch(/fbclid|utm_|igsh/);
});

test("외부로 나가는 링크는 새 탭 + rel=noopener", async ({ page }) => {
  await page.goto("./");
  const bad = await page.locator('a[href^="http"]').evaluateAll((as) =>
    as.filter((a) => a.target !== "_blank" || !/noopener/.test(a.rel)).map((a) => a.href));
  expect(bad).toEqual([]);
});

// ── 오류·이미지·용량 ─────────────────────────────────
test("처음부터 결과까지 자바스크립트 오류가 0개", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("./");
  await play(page, [0, 1, 2, 3, 0, 1]);
  await page.locator("#gNext").click();
  expect(errors).toEqual([]);
});

test("페이지의 모든 이미지(사진·아이콘·도장·면허증 사진)가 열린다", async ({ page }) => {
  await page.goto("./");
  const srcs = new Set(await page.locator("img[src]").evaluateAll((is) => is.map((i) => i.getAttribute("src"))));
  for (const m of html.matchAll(/img:"(img\/[^"]+)"/g)) srcs.add(m[1]);
  for (const m of html.matchAll(/href="(img\/[^"]+\.png)"/g)) srcs.add(m[1]);
  for (const src of srcs) {
    const res = await page.request.get(src);
    expect(res.status(), src).toBe(200);
    expect(res.headers()["content-type"], src).toMatch(/^image\//);
  }
});

test("사진 용량: 장당 400KB 이하", () => {
  for (const f of fs.readdirSync(path.join(ROOT, "img"))) {
    const kb = fs.statSync(path.join(ROOT, "img", f)).size / 1024;
    expect(kb, `${f}가 ${Math.round(kb)}KB예요`).toBeLessThanOrEqual(400);
  }
});

// ── 점수 규칙·질문 품질 ──────────────────────────────
for (const [picks, type, pct] of [
  [[0, 0, 0, 1, 1, 2], "산책 메이트형", "91%"],     // A 3개 → 82 + 3×3
  [[1, 1, 1, 1, 2, 3], "동네 마실 단짝형", "94%"],  // B 4개
  [[0, 0, 1, 1, 2, 3], "산책 메이트형", "88%"],     // A·B 동점 → 앞 순서(A)
  [[2, 2, 3, 3, 3, 0], "든든한 보디가드형", "91%"],  // D 3개
]) {
  test(`점수 규칙: ${picks.join("")} → ${type} ${pct}`, async ({ page }) => {
    await page.goto("./");
    await play(page, picks);
    await expect(page.locator("#rType")).toHaveText(type);
    await expect(page.locator("#rPct")).toHaveText(pct);
  });
}

test("질문 6개, 질문마다 보기 4개, 같은 보기 중복 없음", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "▶ 산책 궁합 알아보기" }).click();
  const seen = new Set();
  for (let q = 0; q < 6; q++) {
    const opts = await page.locator("#opts .opt span").allTextContents();
    expect(opts).toHaveLength(4);
    expect(new Set(opts).size).toBe(4);
    for (const o of opts) { expect(seen.has(o), `중복 보기: ${o}`).toBe(false); seen.add(o); }
    await page.locator("#opts .opt").first().click();
  }
});

// ── 접근성·캐러셀 ────────────────────────────────────
test("모든 사진에 설명(대체 텍스트)이 있다", async ({ page }) => {
  await page.goto("./");
  const missing = await page.locator("img").evaluateAll((is) =>
    is.filter((i) => !i.closest(".seal") && !(i.getAttribute("alt") || "").trim()).map((i) => i.getAttribute("src") || i.id));
  expect(missing).toEqual([]);
});

test("키보드 → 키로 캐러셀을 넘길 수 있다", async ({ page }) => {
  await page.goto("./");
  await page.locator("#track").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#gCount")).toHaveText(/^2 \//);
});

test("다른 탭을 보고 있으면 캐러셀 자동 넘김이 멈춘다", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, "hidden", { get: () => true }));
  await page.goto("./");
  await page.waitForTimeout(3600);
  await expect(page.locator("#gCount")).toHaveText(/^1 \//);
});

// ── 개인정보 ─────────────────────────────────────────
function metaProblems(buf) {
  const s = buf.toString("latin1");
  const out = [];
  if (s.includes("GPS")) out.push("GPS 위치");
  if (/samsung|galaxy|iphone|apple|canon|nikon/i.test(s)) out.push("기기 정보");
  if (s.includes("<x:xmpmeta")) out.push("XMP 메타데이터");
  if (/DateTimeOriginal|\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(s)) out.push("촬영 날짜");
  return out;
}

test("사이트의 모든 사진에 위치·기기·촬영 날짜 정보가 없다", () => {
  for (const f of fs.readdirSync(path.join(ROOT, "img"))) {
    expect(metaProblems(fs.readFileSync(path.join(ROOT, "img", f))), f).toEqual([]);
  }
});

test("사용자가 저장하는 면허증 이미지에도 위치·기기 정보가 없다", async ({ page }) => {
  await page.goto("./");
  await play(page, [3, 3, 3, 3, 3, 3]);
  await page.getByRole("button", { name: "면허증 이미지 저장하기" }).click();
  const link = page.locator("#openExternal");
  await expect(link).toHaveText("사진 저장하기", { timeout: 15_000 });
  const [d] = await Promise.all([page.waitForEvent("download"), link.click()]);
  const buf = fs.readFileSync(await d.path());
  expect(metaProblems(buf)).toEqual([]);
  expect(buf.toString("latin1")).not.toContain("Exif");
});

// ── 보안 ─────────────────────────────────────────────
test("페이지가 허락된 곳 말고는 아무 데도 접속하지 않는다 (처음부터 결과까지)", async ({ page }) => {
  const self = new URL(test.info().project.use.baseURL || "http://127.0.0.1:4173/").host;
  const allowed = [self, "cdnjs.cloudflare.com", "t1.kakaocdn.net", "fonts.googleapis.com", "fonts.gstatic.com"];
  const hosts = new Set();
  page.on("request", (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) hosts.add(u.host); });
  await page.goto("./");
  await play(page, [0, 1, 2, 3, 0, 1]);
  expect([...hosts].filter((h) => !allowed.includes(h))).toEqual([]);
});

test("외부 스크립트는 버전 고정 + 무결성(SRI) 검사를 한다", () => {
  const tags = [...html.matchAll(/<script\s+src="(https:[^"]+)"([^>]*)>/g)];
  expect(tags.length).toBeGreaterThan(0);
  for (const [, src, attrs] of tags) {
    expect(src, src).toMatch(/\d+\.\d+\.\d+/);
    expect(attrs, `${src}에 integrity가 없어요`).toMatch(/integrity="sha384-/);
  }
});

test("주소창에 이상한 값을 넣어도 스크립트가 실행되지 않는다 (XSS)", async ({ page }) => {
  let dialog = false;
  page.on("dialog", (d) => { dialog = true; d.dismiss(); });
  for (const evil of ['?result=<img src=x onerror=alert(1)>', '#result-w-<script>alert(1)</script>', '#licenses"><img src=x onerror=alert(1)>']) {
    await page.goto("./" + evil);
    await page.waitForTimeout(300);
    expect(await page.locator("img[src='x']").count()).toBe(0);
  }
  expect(dialog).toBe(false);
});

test("저장소에 비밀 키나 토큰이 없다 (카카오 JavaScript 키는 도메인 제한이 걸린 공개용이라 예외)", () => {
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) {
    if (["node_modules", ".git", "test-results", "playwright-report", "img"].includes(f)) continue;
    const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(ROOT);
  const pats = [/github_pat_\w{20,}/, /gh[pousr]_\w{30,}/, /sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY/, /xox[baprs]-\w+/];
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    for (const p of pats) expect(s, `${path.relative(ROOT, f)}에 비밀 값 형식이 있어요`).not.toMatch(p);
  }
  for (const name of [".env", ".env.local", "credentials.json"]) expect(fs.existsSync(path.join(ROOT, name)), name).toBe(false);
  // 32자리 키는 카카오 JS 키 한 곳에만
  const keys = [...html.matchAll(/["'][0-9a-f]{32}["']/g)];
  expect(keys.length).toBeLessThanOrEqual(1);
  if (keys.length) expect(html).toMatch(/const KAKAO_JS_KEY = "[0-9a-f]{32}"/);
});

// ── 링크 미리보기 ────────────────────────────────────
test("링크 미리보기 이미지는 1200×630, 메타 태그가 맞다", async ({ page }) => {
  await page.goto("./");
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toMatch(/\/img\/og\.jpg$/);
  expect(await page.locator('meta[property="og:image:width"]').getAttribute("content")).toBe("1200");
  expect(await page.locator('meta[property="og:image:height"]').getAttribute("content")).toBe("630");
  const size = await page.evaluate(async () => { const i = new Image(); i.src = "img/og.jpg"; await i.decode(); return [i.naturalWidth, i.naturalHeight]; });
  expect(size).toEqual([1200, 630]);
});

// ── 방문 통계 ────────────────────────────────────────
test("자동 테스트 브라우저에서는 통계 서버에 아무것도 보내지 않는다 (테스트가 통계를 오염시키지 않게)", async ({ page }) => {
  const hits = [];
  page.on("request", (r) => { if (/goatcounter|gc\.zgo\.at/.test(r.url())) hits.push(r.url()); });
  await page.goto("./");
  await play(page, [0, 0, 0, 0, 0, 0]);
  expect(hits).toEqual([]);
});

test("통계를 켜면 시작·결과·공유·신청서 클릭이 이벤트로 기록된다 (개인정보 없이)", async ({ page }) => {
  // 사이트 코드를 넣은 상태를 흉내 내고, 실제 통계 서버 대신 가짜로 받아요
  await page.route(/\/(index\.html)?(\?.*)?$/, async (route) => {
    const res = await route.fetch(); let body = await res.text();
    body = body.replace(/const GC_CODE = "[a-z0-9-]*";/, 'const GC_CODE = "test";');
    await route.fulfill({ response: res, body });
  });
  await page.route("**/gc.zgo.at/**", (r) => r.abort());
  await page.addInitScript(() => { window.__trackTest = true; window.__events = [];
    window.goatcounter = { count: (o) => window.__events.push(o) }; });
  await page.goto("./");
  await play(page, [1, 1, 1, 1, 1, 1]);
  await page.getByRole("button", { name: "카카오톡으로 공유하기" }).click();
  await page.locator('#result a[href*="docs.google.com/forms"]').evaluate((a) => { a.addEventListener("click", (e) => e.preventDefault()); a.click(); });
  const ev = await page.evaluate(() => window.__events);
  const paths = ev.map((e) => e.path);
  expect(paths).toEqual(expect.arrayContaining(["event/테스트시작", "event/결과-동네마실단짝형", "event/카톡공유", "event/입양신청서"]));
  for (const e of ev) expect(Object.keys(e).sort()).toEqual(["event", "path", "title"]);
});
