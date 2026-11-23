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
    await page.goto("./");
    await playQuiz(page, 3);
    await page.getByRole("button", { name: "면허증 이미지 저장하기" }).click();
    await expect(page.locator("#readyImg")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#loaderMsg")).toContainText("꾹 눌러");
    const link = page.locator("#openExternal");
    await expect(link).toHaveText("다른 브라우저로 열기");
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^kakaotalk:\/\/web\/openExternal\?url=/);
    expect(decodeURIComponent(href)).toContain("#result-g-100"); // 넘어가도 같은 결과
  });
});

test("다른 브라우저로 넘어온 주소(#result-…)로 열면 같은 결과가 바로 보인다", async ({ page }) => {
  await page.goto("./#result-g-97");
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#rType")).toHaveText("든든한 보디가드형");
  await expect(page.locator("#rPct")).toHaveText("97%");
  await expect(page.locator("#start")).toBeHidden();
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
