import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30000,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
