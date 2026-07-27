import { describe, expect, it, vi } from "vitest";

import type { User, UserRepository } from "../../../users/index.js";
import { AccountDisabledError, InvalidActionTokenError } from "../../domain/auth.errors.js";
import type { AuthActionTokenRepository } from "../ports/auth-action-token-repository.js";
import type { AuthEmailRequestRepository } from "../ports/auth-email-request-repository.js";
import type { AuthEmailSender } from "../ports/auth-email-sender.js";
import type { OpaqueTokenService } from "../ports/opaque-token-service.js";
import type { PasswordHasher } from "../ports/password-hasher.js";
import { RegisterUser } from "./register-user.js";
import { ResetPassword } from "./reset-password.js";

const now = new Date("2026-07-26T08:00:00.000Z");
const user: User = {
  id: "82ef09cc-912f-4979-8791-8a3a635e18bb",
  email: "person@example.com",
  name: "Test Person",
  role: "user",
  status: "active",
  emailVerifiedAt: null,
  authVersion: 0,
  createdAt: now,
  updatedAt: now,
};

const opaqueTokens = {
  issue: vi.fn(() => ({ value: "raw-token", hash: "hashed-token" })),
  hash: vi.fn(() => "hashed-token"),
} as unknown as OpaqueTokenService;

describe("account lifecycle invariants", () => {
  it("does not consume a password-reset token for a disabled account", async () => {
    const disabledUser = { ...user, status: "disabled" as const };
    const commitPasswordReset = vi.fn();
    const hashPassword = vi.fn();
    const resetPassword = new ResetPassword({
      users: {
        findById: vi.fn().mockResolvedValue(disabledUser),
      } as unknown as UserRepository,
      passwords: { hash: hashPassword } as unknown as PasswordHasher,
      opaqueTokens,
      actionTokens: {
        findValid: vi.fn().mockResolvedValue({
          id: "token-id",
          userId: user.id,
          purpose: "password_reset",
          tokenHash: "hashed-token",
          expiresAt: new Date(now.getTime() + 60_000),
          consumedAt: null,
          createdAt: now,
        }),
        commitPasswordReset,
      } as unknown as AuthActionTokenRepository,
      email: {} as AuthEmailSender,
      clock: { now: () => now },
    });

    await expect(
      resetPassword.execute({
        token: "raw-token",
        password: "A-good-password-value-7!",
      }),
    ).rejects.toBeInstanceOf(AccountDisabledError);
    expect(commitPasswordReset).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("keeps a completed password reset successful when its notification fails", async () => {
    const notificationError = new Error("SMTP unavailable");
    const onNotificationError = vi.fn();
    const actionToken = {
      id: "token-id",
      userId: user.id,
      purpose: "password_reset" as const,
      tokenHash: "hashed-token",
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      createdAt: now,
    };
    const resetPassword = new ResetPassword({
      users: {
        findById: vi.fn().mockResolvedValue(user),
      } as unknown as UserRepository,
      passwords: {
        hash: vi.fn().mockResolvedValue("new-password-hash"),
      } as unknown as PasswordHasher,
      opaqueTokens,
      actionTokens: {
        findValid: vi.fn().mockResolvedValue(actionToken),
        commitPasswordReset: vi.fn().mockResolvedValue({
          outcome: "reset",
          user: { ...user, authVersion: 1 },
        }),
      } as unknown as AuthActionTokenRepository,
      email: {
        sendPasswordChangedEmail: vi.fn().mockRejectedValue(notificationError),
      } as unknown as AuthEmailSender,
      clock: { now: () => now },
      onNotificationError,
    });

    await expect(
      resetPassword.execute({
        token: "raw-token",
        password: "A-good-password-value-7!",
      }),
    ).resolves.toEqual({ accepted: true });
    expect(onNotificationError).toHaveBeenCalledWith("password_changed", notificationError);
  });

  it("rejects when transactional reset revalidation loses a race", async () => {
    const sendPasswordChangedEmail = vi.fn();
    const resetPassword = new ResetPassword({
      users: {
        findById: vi.fn().mockResolvedValue(user),
      } as unknown as UserRepository,
      passwords: {
        hash: vi.fn().mockResolvedValue("new-password-hash"),
      } as unknown as PasswordHasher,
      opaqueTokens,
      actionTokens: {
        findValid: vi.fn().mockResolvedValue({
          id: "token-id",
          userId: user.id,
          purpose: "password_reset",
          tokenHash: "hashed-token",
          expiresAt: new Date(now.getTime() + 60_000),
          consumedAt: null,
          createdAt: now,
        }),
        commitPasswordReset: vi.fn().mockResolvedValue({ outcome: "invalid" }),
      } as unknown as AuthActionTokenRepository,
      email: { sendPasswordChangedEmail } as unknown as AuthEmailSender,
      clock: { now: () => now },
    });

    await expect(
      resetPassword.execute({
        token: "raw-token",
        password: "A-good-password-value-7!",
      }),
    ).rejects.toBeInstanceOf(InvalidActionTokenError);
    expect(sendPasswordChangedEmail).not.toHaveBeenCalled();
  });

  it("durably queues registration verification without waiting for SMTP", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const deleteUnverified = vi.fn();
    const register = new RegisterUser({
      users: {
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(user),
        deleteUnverified,
      } as unknown as UserRepository,
      passwords: {
        hash: vi.fn().mockResolvedValue("password-hash"),
      } as unknown as PasswordHasher,
      emailRequests: { enqueue } as unknown as AuthEmailRequestRepository,
      clock: { now: () => now },
    });

    await expect(
      register.execute({
        email: user.email,
        name: user.name,
        password: "A-good-password-value-7!",
      }),
    ).resolves.toMatchObject({ id: user.id, email: user.email });
    expect(enqueue).toHaveBeenCalledWith({
      email: user.email,
      purpose: "email_verification",
      requestedAt: now,
      cooldownBefore: now,
      replaceExisting: true,
    });
    expect(deleteUnverified).not.toHaveBeenCalled();
  });

  it("removes a newly created unverified user when durable enqueue fails", async () => {
    const queueError = new Error("PostgreSQL queue unavailable");
    const deleteUnverified = vi.fn().mockResolvedValue(true);
    const register = new RegisterUser({
      users: {
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(user),
        deleteUnverified,
      } as unknown as UserRepository,
      passwords: {
        hash: vi.fn().mockResolvedValue("password-hash"),
      } as unknown as PasswordHasher,
      emailRequests: {
        enqueue: vi.fn().mockRejectedValue(queueError),
      } as unknown as AuthEmailRequestRepository,
      clock: { now: () => now },
    });

    await expect(
      register.execute({
        email: user.email,
        name: user.name,
        password: "A-good-password-value-7!",
      }),
    ).rejects.toBe(queueError);
    expect(deleteUnverified).toHaveBeenCalledWith(user.id);
  });
});
