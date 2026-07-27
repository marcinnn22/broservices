import { describe, expect, it, vi } from "vitest";

import type { User, UserRepository } from "../../users/index.js";
import { createAuthEmailRequestWorker } from "./auth-email-request-worker.js";
import type { AuthActionTokenRepository } from "./ports/auth-action-token-repository.js";
import type {
  AuthEmailRequest,
  AuthEmailRequestRepository,
} from "./ports/auth-email-request-repository.js";
import type { AuthEmailSender } from "./ports/auth-email-sender.js";

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

const request: AuthEmailRequest = {
  id: "f8af4325-50db-4675-8505-3d39e4341e27",
  email: user.email,
  purpose: "password_reset",
  attempts: 1,
  claimId: "aa253b59-0045-4da4-ab6d-666a1ba51e56",
  actionToken: null,
  createdAt: now,
};

const createDependencies = (options?: {
  readonly queuedRequest?: AuthEmailRequest;
  readonly foundUser?: User | null;
  readonly deliveryError?: Error;
}) => {
  const complete = vi.fn().mockResolvedValue(true);
  const retry = vi.fn().mockResolvedValue(true);
  const deleteCompleted = vi.fn().mockResolvedValue(0);
  const storeActionToken = vi.fn().mockResolvedValue(true);
  const replace = vi.fn().mockImplementation(async (input) => ({
    id: "703c2c91-69d6-4fe5-91e7-ef7bb8706776",
    ...input,
    consumedAt: null,
  }));
  const issue = vi.fn(() => ({ value: "raw-token", hash: "a".repeat(64) }));
  const sendPasswordResetEmail =
    options?.deliveryError === undefined
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(options.deliveryError);
  const sendVerificationEmail =
    options?.deliveryError === undefined
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(options.deliveryError);
  const requests = {
    deleteCompleted,
    claim: vi
      .fn()
      .mockResolvedValue(options?.queuedRequest === undefined ? [] : [options.queuedRequest]),
    complete,
    retry,
    storeActionToken,
  } as unknown as AuthEmailRequestRepository;

  return {
    options: {
      requests,
      users: {
        findByEmail: vi.fn().mockResolvedValue(options?.foundUser ?? null),
      } as unknown as UserRepository,
      opaqueTokens: {
        issue,
        hash: vi.fn(),
      },
      actionTokens: { replace } as unknown as AuthActionTokenRepository,
      email: { sendPasswordResetEmail, sendVerificationEmail } as unknown as AuthEmailSender,
      clock: { now: () => now },
      emailVerificationMs: 24 * 60 * 60_000,
      passwordResetMs: 60 * 60_000,
      pollIntervalMs: 1_000,
      requestCooldownMs: 20 * 60_000,
    },
    complete,
    retry,
    deleteCompleted,
    storeActionToken,
    issue,
    replace,
    sendPasswordResetEmail,
    sendVerificationEmail,
  };
};

describe("auth email request worker", () => {
  it("completes ineligible requests without issuing a token or sending email", async () => {
    const dependencies = createDependencies({ queuedRequest: request, foundUser: null });
    const worker = createAuthEmailRequestWorker(dependencies.options);

    await worker.run();

    expect(dependencies.complete).toHaveBeenCalledWith(request.id, request.claimId, now);
    expect(dependencies.replace).not.toHaveBeenCalled();
    expect(dependencies.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("creates and delivers a token for an eligible account", async () => {
    const dependencies = createDependencies({ queuedRequest: request, foundUser: user });
    const worker = createAuthEmailRequestWorker(dependencies.options);

    await worker.run();

    expect(dependencies.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        purpose: "password_reset",
      }),
    );
    expect(dependencies.storeActionToken).toHaveBeenCalledWith({
      id: request.id,
      claimId: request.claimId,
      preparedAt: now,
      value: "raw-token",
      hash: "a".repeat(64),
      createdAt: now,
      expiresAt: new Date(now.getTime() + dependencies.options.passwordResetMs),
    });
    expect(dependencies.sendPasswordResetEmail).toHaveBeenCalledOnce();
    expect(dependencies.complete).toHaveBeenCalledWith(request.id, request.claimId, now);
  });

  it("delivers queued registration verification for an unverified account", async () => {
    const verificationRequest: AuthEmailRequest = {
      ...request,
      purpose: "email_verification",
    };
    const dependencies = createDependencies({
      queuedRequest: verificationRequest,
      foundUser: { ...user, emailVerifiedAt: null },
    });
    const worker = createAuthEmailRequestWorker(dependencies.options);

    await worker.run();

    expect(dependencies.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        purpose: "email_verification",
      }),
    );
    expect(dependencies.sendVerificationEmail).toHaveBeenCalledOnce();
    expect(dependencies.complete).toHaveBeenCalledWith(
      verificationRequest.id,
      verificationRequest.claimId,
      now,
    );
  });

  it("retries SMTP failures without failing the public request path", async () => {
    const deliveryError = new Error("SMTP unavailable");
    const onError = vi.fn();
    const dependencies = createDependencies({
      queuedRequest: request,
      foundUser: user,
      deliveryError,
    });
    const worker = createAuthEmailRequestWorker({
      ...dependencies.options,
      onError,
    });

    await worker.run();

    expect(onError).toHaveBeenCalledWith(deliveryError, request);
    expect(dependencies.retry).toHaveBeenCalledWith(
      request.id,
      request.claimId,
      new Date(now.getTime() + 30_000),
    );
    expect(dependencies.complete).not.toHaveBeenCalled();
  });

  it("reuses the persisted action token after an ambiguous SMTP failure", async () => {
    const deliveryError = new Error("SMTP acknowledgement was lost");
    const dependencies = createDependencies({
      queuedRequest: request,
      foundUser: user,
    });
    dependencies.sendPasswordResetEmail
      .mockRejectedValueOnce(deliveryError)
      .mockResolvedValueOnce(undefined);
    const persistedActionToken = {
      value: "raw-token",
      hash: "a".repeat(64),
      createdAt: now,
      expiresAt: new Date(now.getTime() + dependencies.options.passwordResetMs),
    };
    vi.mocked(dependencies.options.requests.claim)
      .mockResolvedValueOnce([request])
      .mockResolvedValueOnce([
        {
          ...request,
          attempts: 2,
          claimId: "403da863-c28a-4617-b054-eeefc942e158",
          actionToken: persistedActionToken,
        },
      ]);
    const worker = createAuthEmailRequestWorker(dependencies.options);

    await worker.run();
    await worker.run();

    expect(dependencies.issue).toHaveBeenCalledOnce();
    expect(dependencies.storeActionToken).toHaveBeenCalledOnce();
    expect(dependencies.replace).toHaveBeenCalledTimes(2);
    expect(dependencies.replace).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tokenHash: persistedActionToken.hash,
        createdAt: persistedActionToken.createdAt,
        expiresAt: persistedActionToken.expiresAt,
      }),
    );
    expect(dependencies.sendPasswordResetEmail).toHaveBeenCalledTimes(2);
    expect(dependencies.sendPasswordResetEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        token: persistedActionToken.value,
        expiresAt: persistedActionToken.expiresAt,
      }),
    );
    expect(dependencies.complete).toHaveBeenCalledWith(
      request.id,
      "403da863-c28a-4617-b054-eeefc942e158",
      now,
    );
  });

  it("processes a claimed batch concurrently so later leases cannot age in a local queue", async () => {
    const secondRequest: AuthEmailRequest = {
      ...request,
      id: "65ff1daa-a62c-4fc1-ad3e-d011d7e91d4f",
      claimId: "471eb80b-2dd0-4252-a9ab-5fbf60969667",
    };
    const dependencies = createDependencies({ foundUser: user });
    vi.mocked(dependencies.options.requests.claim).mockResolvedValue([request, secondRequest]);
    const releases: Array<() => void> = [];
    const send = vi.spyOn(dependencies.options.email, "sendPasswordResetEmail").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    const worker = createAuthEmailRequestWorker(dependencies.options);

    const run = worker.run();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    for (const release of releases) {
      release();
    }
    await run;

    expect(dependencies.complete).toHaveBeenCalledTimes(2);
  });

  it("sweeps completed rows once per cooldown instead of on every poll", async () => {
    const dependencies = createDependencies();
    const worker = createAuthEmailRequestWorker(dependencies.options);

    await worker.run();
    await worker.run();

    expect(dependencies.deleteCompleted).toHaveBeenCalledOnce();
    expect(dependencies.deleteCompleted).toHaveBeenCalledWith(
      new Date(now.getTime() - dependencies.options.requestCooldownMs),
    );
  });
});
