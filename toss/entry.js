// 토스 미니앱 번들(dist/)에만 들어가요. GitHub Pages 사이트에는 이 파일이 없어서 아무 영향이 없어요.
import { openURL } from "@apps-in-toss/web-framework";

// GoatCounter 유입 꼬리표: 미니앱 방문은 "toss"로 집계돼요 (?ref=kakao·qr·story 와 같은 자리)
window.goatcounter = { referrer: "toss" };

// 앱인토스 정책: 공유 링크가 자사 웹사이트로 가면 안 되고(카톡·QR·스토리 링크 모두 github.io로 감),
// 자사 채널 이동 유도도 막혀 있어요 → 공유 묶음과 인스타 링크만 숨겨요. 문구는 그대로예요.
// ponytail: 숨기기만 함. 토스 공유(getTossShareLink + share)는 필요해지면 그때 붙여요.
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("kakao")?.closest(".sign")?.setAttribute("hidden", "");
  document.querySelectorAll('a[href*="instagram.com"]').forEach((a) => a.setAttribute("hidden", ""));
  // 결과 카드엔 누를 수 없는 안내 글자만 남겨요 (링크·버튼 금지). 언어 전환은 새로고침이라 지금 언어로 한 번만 넣으면 돼요
  const p = document.createElement("p");
  p.className = "small";
  // '@im.bonggoon'은 중간에서 끊기지 않게 묶어 둬요 (토스 검수가 어색한 줄바꿈에 민감)
  const [before, tag] = document.documentElement.lang === "en"
    ? ["Bonggoon's Instagram ", "@im.bonggoon"]
    : ["봉군이의 인스타그램 ", "@im.bonggoon"];
  const nb = document.createElement("span");
  nb.style.whiteSpace = "nowrap";
  nb.textContent = tag;
  p.append(before, nb);
  document.querySelector('#result .sign a.btn.alt[href*="instagram.com"]')?.after(p);
});

// 웹뷰가 숫자·주소를 자동 링크로 바꾸지 않게 (위 안내 글자가 눌리지 않도록)
document.head.insertAdjacentHTML("beforeend", '<meta name="format-detection" content="telephone=no,email=no,address=no">');

// 새 창 링크(입양 신청서)는 미니앱 웹뷰 밖, 기기 브라우저로 열어요
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[target="_blank"]');
  if (!a || !window.ReactNativeWebView) return; // 토스 밖(로컬 브라우저)에선 평소처럼 새 창
  e.preventDefault();
  openURL(a.href).catch(() => {});
}, true);

// 마지막 답 → 결과 사이에 봉군이 산책 로딩을 잠깐 보여줘요 (미니앱에서만. finish·loaderOpen·loaderClose는 index.html 전역 함수)
// 3초(상한): 걷기(~1.6초) → 볼일(~0.7초) → 다시 걷기(~2.7초)까지 보이는 시간 (60fps 기준, 느린 기기 여유 포함)
document.addEventListener("DOMContentLoaded", () => {
  const done = window.finish;
  if (typeof done !== "function") return;
  window.finish = () => {
    const close = document.getElementById("loaderClose");
    loaderOpen(); close.hidden = true; // 이미지 저장용 요소는 loaderOpen이 이미 숨겨요
    setTimeout(() => { loaderClose(); close.hidden = false; done(); }, 3000);
  };
});
