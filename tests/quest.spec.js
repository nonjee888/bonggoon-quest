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
  await expect(result.getByRole("link", { name: "입양 신청서" })).toBeVisible();
  await expect(result.getByRole("link", { name: "봉군이 인스타 @im.bonggoon" })).toBeVisible();
  await expect(result.getByRole("button", { name: "면허증 이미지 저장하기" })).toBeVisible();
  await expect(result.getByRole("button", { name: "인스타 스토리에 올리기" })).toBeVisible();
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
    expect(href).toMatch(/^intent:\/\/127\.0\.0\.1:4173\/\?result=n-100#Intent;scheme=https;package=com\.android\.chrome;end$/);
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
    await page.route("**/kakao_js_sdk/**", (route) => route.fulfill({
      contentType: "application/javascript",
      body: `window.__kakao = { uploads: [], sent: [] };
        window.Kakao = { _init:false, init(){ this._init=true; }, isInitialized(){ return this._init; },
          Share: {
            async uploadImage({ file }) { const f = file[0]; window.__kakao.uploads.push({ name:f.name, type:f.type, size:f.size });
              return { infos: { original: { url: "https://k.kakaocdn.net/test/license.jpg", width: 800, height: 800 } } }; },
            sendDefault(o) { window.__kakao.sent.push(o); } } };`,
    }));
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
    expect(c.link.mobileWebUrl).toMatch(/^http:\/\/127\.0\.0\.1:4173\/$/);
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
