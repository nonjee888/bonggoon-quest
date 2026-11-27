// @ts-check
// 봉군이랑 친해지기: 메뉴 진입, 하루 5번 제한·다음 날 초기화, 단계 오름, 1단계 간식 거절, 토스 빌드
const { test, expect } = require("@playwright/test");

const today = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
const state = (s, p, extra = {}) => ({ d0: today(), day: today(), n: 0, p, s, last: "", acc: "", ...extra });
// 확률 고정: 0.99 → 실수·방석 이벤트 없음, 훈련 실패 / 0 → 실수 이벤트 나옴, 훈련 성공
async function open(page, { st = null, rnd = 0.99, url = "./" } = {}) {
  await page.addInitScript(([st, rnd]) => {
    Math.random = () => rnd;
    if (st && !sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("bond", JSON.stringify(st)); }
  }, [st, rnd]);
  await page.goto(url);
  await page.locator("#bondGo").click();
  await expect(page.locator("#bond")).toBeVisible();
}
const act = (page, name) => page.locator("#bActs").getByRole("button", { name }).click();

test("첫 화면 [봉군이랑 친해지기] → 게임 화면 (1단계, 오늘 5번, 훈련 잠김)", async ({ page }) => {
  await open(page);
  await expect(page.locator("#start")).toBeHidden();
  await expect(page.locator("#bDay")).toHaveText("친해진 지 1일째");
  await expect(page.locator("#bLeft")).toHaveText("●●●●●");
  await expect(page.locator("#bStage")).toHaveText("1단계 · 벽에 붙은 봉군이");
  await expect(page.locator("#bScene img")).toHaveCount(1);
  await expect(page.locator("#bActs").getByRole("button", { name: /훈련/ })).toBeDisabled();
  await expect(page.locator("#bEnd")).toBeHidden();
  await page.getByRole("button", { name: "← 처음 화면으로" }).click();
  await expect(page.locator("#start")).toBeVisible();
});

test("하루 5번 쓰면 쉬어요, 한국 날짜가 바뀌면 다시 5번", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-27T23:00:00+09:00"));
  await open(page);
  for (const n of ["쓰다듬기", "간식 주기", "쓰다듬기", "간식 주기", "쓰다듬기"]) await act(page, n);
  await expect(page.locator("#bLeft")).toHaveText("○○○○○");
  await expect(page.locator("#bRest")).toHaveText("봉군이가 쉬고 싶어 해요. 내일 또 만나요");
  await expect(page.locator("#bActs button:enabled")).toHaveCount(0);
  // 같은 날 다시 와도 그대로
  await page.reload(); await page.locator("#bondGo").click();
  await expect(page.locator("#bActs button:enabled")).toHaveCount(0);
  // 한국 자정 직후(UTC로는 아직 27일) → 다음 날
  await page.clock.setFixedTime(new Date("2026-11-28T00:30:00+09:00"));
  await page.reload(); await page.locator("#bondGo").click();
  await expect(page.locator("#bDay")).toHaveText("친해진 지 2일째");
  await expect(page.locator("#bLeft")).toHaveText("●●●●●");
  await expect(page.locator("#bRest")).toBeHidden();
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 6 / 75"); // 쓰다듬기 2 ×3, 1단계 간식 0
});

test("1단계에서는 간식을 안 먹어요 (유대감 그대로)", async ({ page }) => {
  await open(page);
  await act(page, "간식 주기");
  await expect(page.locator("#bSay")).toContainText("쳐다보지도 않아요");
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 0 / 75");
});

test("1·2단계에서 쓰다듬기를 연달아 하면 움찔하며 유대감이 내려가요", async ({ page }) => {
  await open(page);
  await act(page, "쓰다듬기");
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 2 / 75");
  await act(page, "쓰다듬기");
  await expect(page.locator("#bSay")).toContainText("서둘렀어요");
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 1 / 75");
});

test("유대감이 차면 단계가 오르고, 3단계부터 훈련이 열려요", async ({ page }) => {
  await open(page, { st: state(1, 9) });
  await act(page, "쓰다듬기");
  await expect(page.locator("#bStage")).toHaveText("2단계 · 조심조심");
  await expect(page.locator("#bSay")).toContainText("2단계가 됐어요!");
  await expect(page.locator("#bActs").getByRole("button", { name: /훈련/ })).toBeDisabled();
  await page.evaluate(() => { const b = JSON.parse(localStorage.getItem("bond")); b.p = 27; localStorage.setItem("bond", JSON.stringify(b)); });
  await page.reload(); await page.locator("#bondGo").click();
  await act(page, "간식 주기");
  await expect(page.locator("#bSay")).toContainText("3단계가 됐어요!");
  await expect(page.locator("#bScene .plant")).toHaveCount(1);
  await act(page, "훈련");
  await expect(page.locator("#bSay")).toContainText("쳐다만 봐요"); // 0.99 → 실패, 그래도 +1
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 30 / 75");
});

test("소변 실수: 괜찮아는 +, 혼내기는 −, 고르는 동안 다른 행동은 잠겨요", async ({ page }) => {
  await open(page, { st: state(2, 15), rnd: 0 });
  await act(page, "간식 주기");
  await expect(page.locator("#bSay")).toContainText("쉬를 했어요");
  await expect(page.locator("#bActs button:enabled")).toHaveCount(0);
  await page.getByRole("button", { name: "혼내기" }).click();
  await expect(page.locator("#bSay")).toContainText("꼬리를 말고");
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 15 / 75"); // 간식 +2, 혼내기 −2
  await expect(page.locator("#bChoice")).toBeHidden();
});

test("5단계 엔딩: 문구 + 자랑하기 + 봉군이 인스타 링크 (웹)", async ({ page }) => {
  await open(page, { st: state(5, 80) });
  await expect(page.locator("#bStage")).toHaveText("5단계 · 같이 나가요");
  const end = page.locator("#bEnd");
  await expect(end).toContainText("봉군이는 아직 꼬리를 흔들지 않아요.");
  await expect(end).toContainText("천천히 마음을 열어 줄 가족을 기다려요.");
  await expect(end.getByRole("button", { name: "친구에게 자랑하기" })).toBeVisible();
  await expect(end.getByRole("link", { name: "봉군이 인스타 @im.bonggoon" })).toHaveAttribute("href", "https://www.instagram.com/im.bonggoon/");
});

test("토스 빌드(dist): 엔딩에 인스타 링크 없이 글자만", async ({ page }) => {
  test.skip(!!process.env.BASE_URL, "배포된 사이트에는 dist/가 없어요");
  await open(page, { st: state(5, 80), url: "./dist/" });
  const end = page.locator("#bEnd");
  await expect(end).toBeVisible();
  await expect(page.locator('#bond a[href*="instagram.com"]')).toHaveCount(0);
  await expect(end).toContainText("봉군이의 인스타그램 @im.bonggoon");
  await expect(end.getByRole("button", { name: "친구에게 자랑하기" })).toBeHidden(); // 토스 밖에선 토스 공유가 없어 숨김
});

test("영어 화면, 저장소가 막혀도 오류 없이 돌아가요", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
  await page.goto("./?lang=en");
  await page.getByRole("button", { name: /Get close to Bonggoon/ }).click();
  await expect(page.locator("#bStage")).toHaveText("Stage 1 · Glued to the Wall");
  await expect(page.locator("#bDay")).toHaveText("Day 1 together");
  await page.locator("#bActs").getByRole("button", { name: "Treat" }).click();
  await expect(page.locator("#bSay")).toContainText("won't even look at it");
  expect(errors).toEqual([]);
});

test("통계: 친해지기 시작·단계·엔딩공유 이벤트 (+ 공유 사람 수)", async ({ page }) => {
  await page.route(/\/(index\.html)?(\?.*)?$/, async (route) => {
    const res = await route.fetch(); let body = await res.text();
    body = body.replace(/const GC_CODE = "[a-z0-9-]*";/, 'const GC_CODE = "test";');
    await route.fulfill({ response: res, body });
  });
  await page.route("**/gc.zgo.at/**", (r) => r.abort());
  await page.route("**/kakao**", (r) => r.abort()); // 카카오 SDK 없이 → 문구 복사로
  await page.addInitScript(() => { window.__trackTest = true; window.__events = []; window.goatcounter = { count: (o) => window.__events.push(o) }; });
  await open(page, { st: state(4, 74), rnd: 0 });
  await act(page, "쓰다듬기");
  await page.getByRole("button", { name: "친구에게 자랑하기" }).click();
  const paths = (await page.evaluate(() => window.__events)).map((e) => e.path);
  expect(paths).toEqual(expect.arrayContaining(["event/친해지기-시작", "event/친해지기-단계5", "event/친해지기-엔딩공유", "event/3-공유-사람"]));
});

test("소변 실수에서 괜찮아를 고르면 유대감이 올라요", async ({ page }) => {
  await open(page, { st: state(2, 15), rnd: 0 });
  await act(page, "간식 주기");
  await page.getByRole("button", { name: "괜찮아" }).click();
  await expect(page.locator("#bSay")).toContainText("조용히 치웠어요");
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 19 / 75"); // 간식 +2, 괜찮아 +2
});

test("단계가 오르는 행동에는 실수 이벤트가 끼어들지 않아요", async ({ page }) => {
  await open(page, { st: state(1, 9), rnd: 0 });
  await act(page, "쓰다듬기");
  await expect(page.locator("#bSay")).toContainText("2단계가 됐어요!");
  await expect(page.locator("#bChoice")).toBeHidden();
  await expect(page.locator("#bActs button:enabled")).toHaveCount(2);
});

test("방석 옮기기: 구석에 웅크린 장면, 다음 행동 때 원래 장면으로", async ({ page }) => {
  await open(page);
  // 첫 확률(실수)은 피하고, 둘째(방석)는 걸리게
  await page.evaluate(() => { let k = 0; Math.random = () => (k++ % 2 ? 0 : 0.99); });
  await act(page, "쓰다듬기");
  await expect(page.locator("#bSay")).toContainText("구석이 최고래요");
  await expect(page.locator('#bScene img[src$="dog-curl.png"]')).toHaveCount(1);
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 2 / 75");
  await page.evaluate(() => { Math.random = () => 0.99; });
  await act(page, "간식 주기");
  await expect(page.locator('#bScene img[src$="dog1.png"]')).toHaveCount(1);
});

test("훈련 성공은 +3", async ({ page }) => {
  await open(page, { st: state(3, 30), rnd: 0 });
  await act(page, "훈련");
  await expect(page.locator("#bSay")).toContainText("'손' 성공!");
  await expect(page.locator("#bBar")).toHaveAttribute("aria-label", "유대감 33 / 75");
});
