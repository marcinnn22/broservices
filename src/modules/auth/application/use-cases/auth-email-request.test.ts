import { describe, expect, it, vi } from "vitest";

import type { AuthEmailRequestRepository } from "../ports/auth-email-request-repository.js";
import { RequestPasswordReset } from "./request-password-reset.js";
import { ResendVerificationEmail } from "./resend-verification-email.js";

const now = new Date("2026-07-26T08:00:00.000Z");
const requestCooldownMs = 20 * 60_000;

describe("public auth email requests", () => {
  it("durably enqueues password-reset work without reading account state", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const useCase = new RequestPasswordReset({
      requests: { enqueue } as unknown as AuthEmailRequestRepository,
      clock: { now: () => now },
      requestCooldownMs,
    });

    await expect(useCase.execute(" Person@Example.com ")).resolves.toEqual({ accepted: true });
    expect(enqueue).toHaveBeenCalledWith({
      email: "person@example.com",
      purpose: "password_reset",
      requestedAt: now,
      cooldownBefore: new Date(now.getTime() - requestCooldownMs),
    });
  });

  it("uses the same durable path for verification resend work", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const useCase = new ResendVerificationEmail({
      requests: { enqueue } as unknown as AuthEmailRequestRepository,
      clock: { now: () => now },
      requestCooldownMs,
    });

    await expect(useCase.execute(" Person@Example.com ")).resolves.toEqual({ accepted: true });
    expect(enqueue).toHaveBeenCalledWith({
      email: "person@example.com",
      purpose: "email_verification",
      requestedAt: now,
      cooldownBefore: new Date(now.getTime() - requestCooldownMs),
    });
  });
});
