import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  // 오너가 콘솔에 등록한 앱 이름(appName)과 똑같아야 업로드돼요. 다르면 여기만 바꿔 주세요.
  appName: "bonggoon-quest",
  webView: {},
  permissions: [],
  webBundleDir: "dist",
});
