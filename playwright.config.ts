import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 300_000, // 5 minutes per test
  workers: 1, // Serial — all tests share one demo session
  use: {
    browserName: "chromium",
    headless: false,
    video: "on",
    screenshot: "on",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
  },
  outputDir: "./test-results",
  reporter: [["list"]],
});
