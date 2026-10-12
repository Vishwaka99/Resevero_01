import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The booking rules are written against a fixed timezone, so the suite
    // behaves the same on a laptop in Colombo and on CI in UTC.
    env: { ORG_TIME_ZONE: "Asia/Colombo" },
  },
});
