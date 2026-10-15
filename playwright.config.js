const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 360, height: 480 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "chromium-hidpi", use: { browserName: "chromium", deviceScaleFactor: 2 } },
  ],
  webServer: {
    command: "node tests/browser-server.js",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
