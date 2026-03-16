import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:5173",
    extraHTTPHeaders: {
      Accept: "application/json",
    },
  },
  projects: [
    {
      name: "api",
      testMatch: /.*\.api\.test\.ts/,
      use: {
        baseURL: process.env.TEST_API_URL || "http://localhost:3000",
      },
    },
    {
      name: "ws",
      testMatch: /.*\.ws\.test\.ts/,
      use: {
        baseURL: process.env.TEST_API_URL || "http://localhost:3000",
      },
    },
    {
      name: "ui",
      testMatch: /.*\.ui\.test\.ts/,
      use: {
        browserName: "chromium",
      },
    },
  ],
  reporter: [["html", { open: "never" }], ["list"]],
});
