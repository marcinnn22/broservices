import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env.test");
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
    throw error;
  }
}

export default defineConfig({
  test: {
    clearMocks: true,
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.test.ts"],
    mockReset: true,
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
