import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const isContinuousIntegration = ["1", "true"].includes(process.env.CI?.toLowerCase() ?? "");

if (!isContinuousIntegration && existsSync(".git")) {
  const result = spawnSync("lefthook", ["install"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
