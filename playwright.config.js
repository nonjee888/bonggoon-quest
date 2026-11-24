// @ts-check
const { defineConfig, devices } = require("@playwright/test");

// The site is plain static files, so tests serve the repo folder with Python's built-in server.
module.exports = defineConfig({
  testDir: "tests",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // BASE_URL set → test the live site (after deploy) instead of a local server
  use: { baseURL: process.env.BASE_URL || "http://127.0.0.1:4173/", trace: "retain-on-failure" },
  webServer: process.env.BASE_URL ? undefined : {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
});
