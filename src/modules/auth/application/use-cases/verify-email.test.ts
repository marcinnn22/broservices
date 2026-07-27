import { describe, expect, it, vi } from "vitest";

import type { User } from "../../../users/index.js";
import { AccountDisabledError, EmailAlreadyVerifiedError } from "../../domain/auth.errors.js";
import type { AuthActionTokenRepository } from "../ports/auth-action-token-repository.js";
import { VerifyEmail } from "./verify-email.js";

const now = new Date("2026-07-26T08:00:00.000Z");
const user: User = {
  id: "82ef09cc-912f-4979-8791-8a3a635e18bb",
  email: "person@example.com",
  name: "Test Person",
  role: "user",
  status: "active",
  emailVerifiedAt: now,
  authVersion: 0,
  createdAt: now,
  updatedAt: now,
};

describe("VerifyEmail", () => {
  it("returns the user produced by the atomic verification operation", async () => {
    const consumeEmailVerification = vi.fn().mockResolvedValue({
      outcome: "verified",
      user,
    });
    const useCase = new VerifyEmail({
      opaqueTokens: {
        issue: vi.fn(),
        hash: vi.fn(() => "hashed-token"),
      },
      actionTokens: {
        consumeEmailVerification,
      } as unknown as AuthActionTokenRepository,
      clock: { now: () => now },
    });

    await expect(useCase.execute("raw-token")).resolves.toMatchObject({
      id: user.id,
      emailVerifiedAt: now,
    });
    expect(consumeEmailVerification).toHaveBeenCalledWith("hashed-token", now);
  });

  it("rejects a disabled account without converting it to an invalid-token error", async () => {
    const useCase = new VerifyEmail({
      opaqueTokens: {
        issue: vi.fn(),
        hash: vi.fn(() => "hashed-token"),
      },
      actionTokens: {
        consumeEmailVerification: vi.fn().mockResolvedValue({ outcome: "disabled" }),
      } as unknown as AuthActionTokenRepository,
      clock: { now: () => now },
    });

    await expect(useCase.execute("raw-token")).rejects.toBeInstanceOf(AccountDisabledError);
  });

  it("reports an already-verified account as a conflict", async () => {
    const useCase = new VerifyEmail({
      opaqueTokens: {
        issue: vi.fn(),
        hash: vi.fn(() => "hashed-token"),
      },
      actionTokens: {
        consumeEmailVerification: vi.fn().mockResolvedValue({ outcome: "already_verified" }),
      } as unknown as AuthActionTokenRepository,
      clock: { now: () => now },
    });

    await expect(useCase.execute("raw-token")).rejects.toBeInstanceOf(EmailAlreadyVerifiedError);
  });
});
