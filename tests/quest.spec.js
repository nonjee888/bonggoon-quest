// @ts-check
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

// Answer index per question: 0=A 산책, 1=B 마실, 2=C 소파, 3=D 보디가드
const TYPES = [
  { pick: 0, key: "w", name: "산책 메이트형" },
  { pick: 1, key: "n", name: "동네 마실 단짝형" },
  { pick: 2, key: "s", name: "소파 동지형" },
  { pick: 3, key: "g", name: "든든한 보디가드형" },
];

async function playQuiz(page, pick) {
  await page.getByRole("button", { name: "▶ 산책 궁합 알아보기" }).click();
  for (let q = 0; q < 6; q++) {
    await expect(page.locator("#count")).toHaveText(`LV.${q + 1}`);
    await page.locator("#opts .opt").nth(pick).click();
  }
  await expect(page.locator("#result")).toBeVisible();
}

for (const t of TYPES) {
  test(`퀴즈를 끝까지 하면 '${t.name}' 면허증이 나온다`, async ({ page }) => {
    await page.goto("./");
    await playQuiz(page, t.pick);
    await expect(page.locator("#rType")).toHaveText(t.name);
    await expect(page.locator("#rPct")).toHaveText("100%");
    await expect(page.locator("#rDesc")).not.toBeEmpty();

    // 면허증 사진이 실제로 열리는지
    const bg = await page.locator("#rImg").evaluate((el) => el.style.backgroundImage);
    const src = bg.match(/url\("?(.*?)"?\)/)[1];
    const res = await page.request.get(src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/jpeg");
  });
}

test("결과가 나오면 프로필 버튼은 숨고 결과 화면에 입양·인스타 버튼이 보인다", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#profileCta")).toBeVisible();
  await playQuiz(page, 0);
  await expect(page.locator("#profileCta")).toBeHidden();
  const result = page.locator("#result");
  await expect(result.getByRole("link", { name: "입양 신청서", exact: true })).toBeVisible();
  await expect(result.getByRole("link", { name: "봉군이 인스타 @im.bonggoon" })).toBeVisible();
  await expect(result.getByRole("button", { name: "면허증 이미지 저장하기" })).toBeVisible();
  await expect(result.getByRole("button", { name: /인스타 스토리/ })).toBeVisible();
  await expect(result.getByRole("button", { name: "카카오톡으로 공유하기" })).toBeVisible();

  await page.getByRole("button", { name: "↺ 테스트 다시 하기" }).click();
  await expect(page.locator("#quiz")).toBeVisible();
  await expect(page.locator("#profileCta")).toBeVisible();
});

test("면허증 이미지 저장: 다람쥐 로딩 후 [사진 저장하기]로 1080×1920 JPEG가 저장된다", async ({ page }) => {
  await page.goto("./");
  await playQuiz(page, 2);
  await page.getByRole("button", { name: "면허증 이미지 저장하기" }).click();
  await expect(page.locator("#loader")).toBeVisible();
  await expect(page.locator("#loaderMsg")).toHaveText("면허증을 만드는 중이에요...");

  const link = page.locator("#openExternal");
  await expect(link).toHaveText("사진 저장하기", { timeout: 15_000 });
  await expect(page.locator("#acorns")).toHaveText(""); // 완성 후 도토리 문구는 사라진다

  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("bonggoon-license.jpg");
  const file = await download.path();
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 2).toString("hex")).toBe("ffd8"); // JPEG
  const size = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/jpeg;base64," + b64; await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, buf.toString("base64"));
  expect(size).toEqual([1080, 1920]);
});

test.describe("카카오톡 앱 안에서 열었을 때", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 KAKAOTALK 10.9.0" });

  test("저장하면 꾹 눌러 저장 화면과 [다른 브라우저로 열기]가 나온다", async ({ page }) => {
    // 처음 열 때 자동으로 다른 브라우저로 넘기는 동작은 테스트 브라우저에서 멈추므로, 이미 한 번 넘긴 상태로 시작해요
    await page.addInitScript(() => sessionStorage.setItem("ext", "1"));
    await page.goto("./");
    await playQuiz(page, 3);
    await page.getByRole("button", { name: "면허증 이미지 저장하기" }).click();
    await expect(page.locator("#readyImg")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#loaderMsg")).toContainText("꾹 눌러");
    const link = page.locator("#openExternal");
    await expect(link).toHaveText("다른 브라우저로 열기");
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^kakaotalk:\/\/web\/openExternal\?url=/);
    expect(decodeURIComponent(href)).toContain("?result=g-100"); // 넘어가도 같은 결과
  });
});

// ── 인스타그램 연결 ─────────────────────────────────────────────
// 실제 인스타 앱은 테스트할 수 없어서, 휴대폰 공유 창(navigator.share)을 가짜로 바꿔 무엇이 넘어가는지 확인해요.
test.describe("인스타 스토리에 올리기 (휴대폰 브라우저)", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = async (d) => { window.__shared.push(d.files.map((f) => ({ name: f.name, type: f.type, size: f.size }))); };
    });
  });

  test("[인스타그램으로 보내기]를 누르면 면허증 JPEG 한 장이 공유 창으로 넘어간다", async ({ page }) => {
    await page.goto("./");
    await playQuiz(page, 0);
    await page.getByRole("button", { name: "인스타 스토리에 올리기" }).click();
    const btn = page.locator("#shareNow");
    await expect(btn).toHaveText("인스타그램으로 보내기", { timeout: 15_000 });
    await btn.click();
    await expect(page.locator("#loader")).toBeHidden();
    const shared = await page.evaluate(() => window.__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toEqual([expect.objectContaining({ name: "bonggoon-license.jpg", type: "image/jpeg" })]);
    expect(shared[0][0].size).toBeGreaterThan(20_000);
  });
});

test.describe("인스타 스토리에 올리기 (안드로이드 인스타그램 앱 안)", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Instagram 350.0.0" });

  test("[크롬으로 열기]로 같은 결과를 크롬에서 열 수 있다", async ({ page }) => {
    await page.goto("./");
    await playQuiz(page, 1);
    await page.getByRole("button", { name: "인스타 스토리에 올리기" }).click();
    await expect(page.locator("#readyImg")).toBeVisible({ timeout: 15_000 });
    const link = page.locator("#openExternal");
    await expect(link).toHaveText("크롬으로 열기");
    const href = await link.getAttribute("href");
    const host = new URL(page.url()).host + new URL(page.url()).pathname;
    expect(href).toBe(`intent://${host}?result=n-100#Intent;scheme=https;package=com.android.chrome;end`);
  });
});

test.describe("인스타 스토리에 올리기 (아이폰 인스타그램 앱 안)", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0" });

  test("꾹 눌러 저장 안내와 [인스타그램 열기](스토리 카메라) 링크가 나온다", async ({ page }) => {
    await page.goto("./");
    await playQuiz(page, 1);
    await page.getByRole("button", { name: "인스타 스토리에 올리기" }).click();
    await expect(page.locator("#readyImg")).toBeVisible({ timeout: 15_000 });
    const link = page.locator("#openExternal");
    await expect(link).toHaveText("인스타그램 열기");
    await expect(link).toHaveAttribute("href", "instagram://story-camera");
  });
});

// ── 카카오톡 공유 ───────────────────────────────────────────────
// 카카오 SDK는 등록된 도메인에서만 작동해서, 테스트에서는 가짜 SDK로 바꿔 무엇을 보내는지 확인해요.
test.describe("카카오톡으로 공유하기", () => {
  test.beforeEach(async ({ page }) => {
    // 진짜 SDK는 무결성(SRI) 검사 때문에 바꿔치기할 수 없어서, 요청은 막고 가짜 Kakao를 미리 심어요
    await page.route("**/kakao_js_sdk/**", (route) => route.abort());
    await page.addInitScript(() => {
      window.__kakao = { uploads: [], sent: [] };
      window.Kakao = { _init:false, init(){ this._init=true; }, isInitialized(){ return this._init; },
        Share: {
          async uploadImage({ file }) { const f = file[0]; window.__kakao.uploads.push({ name:f.name, type:f.type, size:f.size });
            return { infos: { original: { url: "https://k.kakaocdn.net/test/license.jpg", width: 800, height: 800 } } }; },
          sendDefault(o) { window.__kakao.sent.push(o); } } };
    });
  });

  test("내 결과 면허증 이미지가 카톡 카드 썸네일로 들어간다", async ({ page }) => {
    await page.goto("./");
    await playQuiz(page, 3);
    await page.getByRole("button", { name: "카카오톡으로 공유하기" }).click();
    const btn = page.locator("#shareNow");
    await expect(btn).toHaveText("카카오톡으로 보내기", { timeout: 15_000 });
    await btn.click();
    const k = await page.evaluate(() => window.__kakao);
    expect(k.uploads).toHaveLength(1);
    expect(k.uploads[0].type).toBe("image/jpeg");
    expect(k.sent).toHaveLength(1);
    const c = k.sent[0].content;
    expect(c.imageUrl).toBe("https://k.kakaocdn.net/test/license.jpg");
    expect(c.description).toContain("든든한 보디가드형");
    expect(c.description).toContain("100%");
    const pu = new URL(page.url()); expect(c.link.mobileWebUrl).toBe(pu.origin + pu.pathname + "?ref=kakao"); // 출처 꼬리표
  });
});

test("다른 브라우저로 넘어온 주소(#result-…)로 열면 같은 결과가 바로 보인다", async ({ page }) => {
  await page.goto("./#result-g-97");
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#rType")).toHaveText("든든한 보디가드형");
  await expect(page.locator("#rPct")).toHaveText("97%");
  await expect(page.locator("#start")).toBeHidden();
});

test("브라우저로 넘어온 주소(?result=…)로 열어도 같은 결과가 보인다", async ({ page }) => {
  await page.goto("./?result=w-91");
  await expect(page.locator("#rType")).toHaveText("산책 메이트형");
  await expect(page.locator("#rPct")).toHaveText("91%");
});

test("#licenses 미리보기에 면허증 4장이 나온다", async ({ page }) => {
  await page.goto("./#licenses");
  await expect(page.locator("#preview .license")).toHaveCount(4);
});

test("화면 가로 스크롤이 생기지 않는다", async ({ page }) => {
  await page.goto("./");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("사진에 촬영 위치(GPS)·기기 정보가 없다", async () => {
  const dir = path.join(__dirname, "..", "img");
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|heic)$/i.test(f));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f)).toString("latin1");
    expect(bytes, `${f}에 GPS 정보가 있어요`).not.toContain("GPS");
    expect(bytes.toLowerCase(), `${f}에 기기 정보가 있어요`).not.toMatch(/samsung|galaxy|iphone/);
  }
});

test("프로필 사진 캐러셀: [▶]로 넘기고 [◀]로 돌아온다", async ({ page }) => {
  await page.goto("./");
  const count = page.locator("#gCount");
  await expect(count).toHaveText(/^1 \/ \d+$/);
  const total = Number((await count.textContent()).split("/")[1]);
  expect(total).toBeGreaterThanOrEqual(10);
  await page.locator("#gPrev").click(); // 첫 장에서 이전 → 마지막 장
  await expect(count).toHaveText(`${total} / ${total}`);
  await page.locator("#gNext").click(); // 마지막 장에서 다음 → 첫 장
  await expect(count).toHaveText(`1 / ${total}`);
  await page.locator("#gNext").click();
  await expect(count).toHaveText(`2 / ${total}`);
  await page.locator("#gNext").click();
  await expect(count).toHaveText(`3 / ${total}`);
  await page.locator("#gPrev").click();
  await expect(count).toHaveText(`2 / ${total}`);
  // 모든 사진이 실제로 열리는지
  for (const src of await page.locator("#track img").evaluateAll((els) => els.map((e) => e.getAttribute("src")))) {
    expect((await page.request.get(src)).status(), src).toBe(200);
  }
});

test("시작 버튼 아래에 구분선이 있다", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#start .divider")).toBeVisible();
});

test("캐러셀은 가만히 두면 3초 뒤 다음 사진으로 넘어간다", async ({ page }) => {
  await page.goto("./");
  const count = page.locator("#gCount");
  await expect(count).toHaveText(/^1 \//);
  await expect(count).toHaveText(/^2 \//, { timeout: 5_000 });
});

test("홈 화면 바로가기 아이콘: manifest에 192·512 봉군이 아이콘이 있고 열린다", async ({ page }) => {
  await page.goto("./");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  const m = await res.json();
  const sizes = m.icons.map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const i of m.icons) expect((await page.request.get(i.src)).status(), i.src).toBe(200);
});

test("면허증 유형 옆에 픽셀 봉군이 도장이 찍혀 있다", async ({ page }) => {
  await page.goto("./");
  await playQuiz(page, 0);
  const seal = page.locator("#result .info .seal");
  await expect(seal).toBeVisible();
  await expect(seal.locator("img")).toHaveJSProperty("complete", true);
  expect(await seal.locator("img").evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
});

test.describe("컴퓨터에서 인스타 스토리", () => {
  test.use({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });

  test("[휴대폰으로 이어서 하기]를 누르면 같은 결과로 가는 QR 코드가 나온다", async ({ page }) => {
    await page.goto("./");
    await playQuiz(page, 2);
    await page.getByRole("button", { name: /휴대폰으로 이어서 하기/ }).click();
    const box = page.locator("#qrBox");
    await expect(box).toBeVisible();
    await expect(box.locator("canvas, img").first()).toBeAttached();
    expect(await box.getAttribute("data-url")).toMatch(/\?result=s-100&ref=qr$/);
    await expect(page.locator("#loaderMsg")).toContainText("휴대폰 카메라");
  });
});

test("면허증이 완성돼도 [닫기] 전까지 봉군이 산책 애니메이션이 계속 움직인다", async ({ page }) => {
  await page.goto("./");
  await playQuiz(page, 0);
  await page.getByRole("button", { name: "면허증 이미지 저장하기" }).click();
  await expect(page.locator("#openExternal")).toHaveText("사진 저장하기", { timeout: 15_000 });
  const sq = page.locator("#sq");
  await expect(sq).toBeVisible();
  const a = await sq.evaluate((c) => c.toDataURL());
  await page.waitForTimeout(400);
  const b = await sq.evaluate((c) => c.toDataURL());
  expect(a).not.toBe(b); // 그림이 바뀌고 있다 = 계속 재생 중
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.locator("#loader")).toBeHidden();
});

test("면허증을 저장하면 스토리 링크 스티커용 테스트 링크가 자동 복사된다", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  await playQuiz(page, 1);
  await page.getByRole("button", { name: "면허증 이미지 저장하기" }).click();
  await expect(page.locator("#openExternal")).toHaveText("사진 저장하기", { timeout: 15_000 });
  await expect(page.locator("#copyNote")).toBeVisible();
  await expect(page.locator("#copyNote")).toContainText("링크 스티커");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const pu = new URL(page.url());
  expect(clip).toBe(pu.origin + pu.pathname + "?ref=story");
});

// ── 영어 버전 ──────────────────────────────────────────────────
test.describe("한국어가 아닌 브라우저(영어)에서 열었을 때", () => {
  test.use({ locale: "en-US" });

  test("영어로 보이고, 면허증 저장 이미지까지 영어 / ?lang=ko 와 KO 버튼으로 한국어 전환", async ({ page }) => {
    const shots = process.env.EN_SHOTS; // 스크린샷이 필요하면 폴더 경로를 넘겨요
    await page.goto("./");
    await expect(page.locator("#go")).toHaveText("▶ Check our walk match");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /봉군이/); // 크롤러용 메타는 한국어
    await expect(page.locator(".en-only").first()).toBeHidden(); // 결과 전이라 아직 숨은 결과 화면 안내
    await expect(page.locator("#profileCta .en-only")).toHaveText(/adoption form is written in Korean/);
    if (shots) await page.screenshot({ path: `${shots}/en-1-start.png` });

    await page.locator("#go").click();
    await expect(page.locator("#q")).toHaveText(/^Weekend morning/);
    for (let q = 0; q < 6; q++) await page.locator("#opts .opt").nth(3).click();
    await expect(page.locator("#rType")).toHaveText("Trusty Bodyguard");
    await expect(page.locator("#rFact")).toHaveText("Bonggoon fun fact · Scared of other dogs");
    await expect(page.locator("#result .en-only")).toBeVisible();
    if (shots) await page.locator("#result").screenshot({ path: `${shots}/en-2-result.png` });

    await page.getByRole("button", { name: "Save license image" }).click();
    const link = page.locator("#openExternal");
    await expect(link).toHaveText("Save photo", { timeout: 15_000 });
    const [d] = await Promise.all([page.waitForEvent("download"), link.click()]);
    if (shots) fs.copyFileSync(await d.path(), `${shots}/en-3-license.jpg`);

    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "한국어로 보기" }).click();
    await expect(page).toHaveURL(/[?&]lang=ko/);
    await expect(page.locator("#go")).toHaveText("▶ 산책 궁합 알아보기");
  });
});

test("?lang=en 이면 한국어 브라우저에서도 영어로 보인다", async ({ page }) => {
  await page.goto("./?lang=en");
  await expect(page.locator("#go")).toHaveText("▶ Check our walk match");
  await expect(page.locator("#langBtn")).toHaveText("KO");
});

test("봉군이 임보 일기: 처음 온 날 Day 1, 같은 날 다시 와도 그대로, 다른 날 오면 1편씩 열린다", async ({ page }) => {
  const visit = async (iso) => {
    await page.clock.setFixedTime(new Date(iso));
    await page.goto("./");
    await expect(page.locator("#diary")).toBeVisible();
  };
  const grid = page.locator("#dGrid");
  // 첫 방문: Day 1 + '새 일기' 표시, 썸네일 1칸만 열림
  await visit("2026-11-26T10:00:00+09:00");
  await expect(page.locator("#dDay")).toHaveText("D+54"); // 10월 4일이 D+1
  await expect(page.locator("#dMeta")).toHaveText("Day 1 · 10월 4일");
  await expect(page.locator("#dCap")).toHaveText("봉군이 임시보호 시작 🐕");
  await expect(page.locator("#dNew")).toBeVisible();
  await expect(page.locator("#dCount")).toHaveText("모은 일기 1 / 35");
  await expect(grid.locator("button")).toHaveCount(1);
  await expect(grid.locator("span")).toHaveCount(34);
  expect((await page.request.get(await page.locator("#dImg").getAttribute("src"))).status()).toBe(200);
  // 같은 날 다시 와도 그대로, '새 일기' 표시 없음
  await visit("2026-11-26T23:59:00+09:00");
  await expect(page.locator("#dMeta")).toHaveText("Day 1 · 10월 4일");
  await expect(page.locator("#dNew")).toBeHidden();
  // 한국 자정 직후(UTC로는 아직 26일) → 다음 날 → Day 2 공개
  await visit("2026-11-27T00:30:00+09:00");
  await expect(page.locator("#dMeta")).toHaveText("Day 2 · 10월 6일");
  await expect(page.locator("#dNew")).toBeVisible();
  await expect(page.locator("#dCount")).toHaveText("모은 일기 2 / 35");
  await expect(grid.locator("button")).toHaveCount(2);
  // 며칠 건너뛰고 와도 1편만
  await visit("2026-12-05T12:00:00+09:00");
  await expect(page.locator("#dMeta")).toHaveText("Day 3 · 10월 9일");
  // 모은 썸네일을 누르면 그 일기가 카드에 보여요, 캡션 없는 게시물은 날짜만
  await grid.getByRole("button", { name: "Day 1 일기 보기" }).click();
  await expect(page.locator("#dMeta")).toHaveText("Day 1 · 10월 4일");
  await expect(grid.getByRole("button", { name: "Day 1 일기 보기" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#dDone")).toBeHidden();
});

test("봉군이 임보 일기: 캡션 없는 날은 날짜만, 다 모으면 완료 문구, 영어 화면", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("diary", JSON.stringify({ n: 34, last: "2000-01-01" })));
  await page.goto("./?lang=en");
  await expect(page.locator("#dMeta")).toHaveText("Day 35 · Nov 26");
  await expect(page.locator("#dCount")).toHaveText("Entries collected 35 / 35");
  await expect(page.locator("#dDone")).toBeVisible();
  await expect(page.locator("#dGrid span")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Day 4", exact: true }).click();
  await expect(page.locator("#dCap")).toHaveText("Bonggoon on Oct 11");
});

test("봉군이 임보 일기: localStorage가 막혀도 에러 없이 Day 1", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
  await page.goto("./");
  await expect(page.locator("#dMeta")).toHaveText("Day 1 · 10월 4일");
  await expect(page.locator("#dCount")).toHaveText("모은 일기 1 / 35");
  await expect(page.locator("#go")).toBeVisible();
  expect(errors).toEqual([]);
});
