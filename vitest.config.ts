import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      exclude: [
        "dist/**",
        "drizzle/**",
        "src/bootstrap/server.ts",
        "src/**/*.d.ts",
        "src/tests/**",
      ],
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        branches: 40,
        functions: 45,
        lines: 50,
        statements: 50,
      },
    },
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    mockReset: true,
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
