import type { UserRepository } from "../../users/index.js";
import { expiresAfter } from "./auth-lifetimes.js";
import { createNonOverlappingScheduler } from "./non-overlapping-scheduler.js";
import type { AuthActionTokenRepository } from "./ports/auth-action-token-repository.js";
import type {
  AuthEmailActionToken,
  AuthEmailRequest,
  AuthEmailRequestRepository,
} from "./ports/auth-email-request-repository.js";
import type { AuthEmailSender } from "./ports/auth-email-sender.js";
import type { Clock } from "./ports/clock.js";
import type { OpaqueTokenService } from "./ports/opaque-token-service.js";

export interface AuthEmailRequestWorker {
  run(): Promise<void>;
  start(): void;
  close(): Promise<void>;
}

const batchSize = 10;
const lockTimeoutMs = 5 * 60_000;
const maxAttempts = 5;
const retryBaseDelayMs = 30_000;
const retryMaximumDelayMs = 60 * 60_000;

export function createAuthEmailRequestWorker(options: {
  readonly requests: AuthEmailRequestRepository;
  readonly users: UserRepository;
  readonly opaqueTokens: OpaqueTokenService;
  readonly actionTokens: AuthActionTokenRepository;
  readonly email: AuthEmailSender;
  readonly clock: Clock;
  readonly emailVerificationMs: number;
  readonly passwordResetMs: number;
  readonly pollIntervalMs: number;
  readonly requestCooldownMs: number;
  readonly onError?: (error: unknown, request?: AuthEmailRequest) => void;
}): AuthEmailRequestWorker {
  let nextCompletedCleanupAt = Number.NEGATIVE_INFINITY;

  const reportError = (error: unknown, request?: AuthEmailRequest): void => {
    try {
      options.onError?.(error, request);
    } catch {
      // Observability must not change queue state.
    }
  };

  const completeRequest = async (request: AuthEmailRequest): Promise<void> => {
    const completed = await options.requests.complete(
      request.id,
      request.claimId,
      options.clock.now(),
    );
    if (!completed) {
      reportError(new Error("Auth email request lease was lost before completion"), request);
    }
  };

  const prepareActionToken = async (
    request: AuthEmailRequest,
    userId: string,
    lifetimeMs: number,
  ): Promise<AuthEmailActionToken | null> => {
    const now = options.clock.now();
    let actionToken = request.actionToken;

    if (actionToken === null || actionToken.expiresAt.getTime() <= now.getTime()) {
      const issued = options.opaqueTokens.issue(request.purpose);
      actionToken = {
        value: issued.value,
        hash: issued.hash,
        createdAt: now,
        expiresAt: expiresAfter(now, lifetimeMs),
      };

      const stored = await options.requests.storeActionToken({
        id: request.id,
        claimId: request.claimId,
        preparedAt: now,
        ...actionToken,
      });
      if (!stored) {
        throw new Error("Auth email request lease was lost before token preparation");
      }
    }

    const persisted = await options.actionTokens.replace({
      userId,
      purpose: request.purpose,
      tokenHash: actionToken.hash,
      expiresAt: actionToken.expiresAt,
      createdAt: actionToken.createdAt,
    });

    if (
      persisted.consumedAt !== null ||
      persisted.expiresAt.getTime() <= options.clock.now().getTime()
    ) {
      await completeRequest(request);
      return null;
    }

    return actionToken;
  };

  const processRequest = async (request: AuthEmailRequest): Promise<void> => {
    const user = await options.users.findByEmail(request.email);

    if (request.purpose === "email_verification") {
      if (!user || user.emailVerifiedAt !== null || user.status !== "active") {
        await completeRequest(request);
        return;
      }

      const actionToken = await prepareActionToken(request, user.id, options.emailVerificationMs);
      if (actionToken === null) {
        return;
      }
      await options.email.sendVerificationEmail({
        email: user.email,
        name: user.name,
        token: actionToken.value,
        expiresAt: actionToken.expiresAt,
      });
      await completeRequest(request);
      return;
    }

    if (!user?.emailVerifiedAt || user.status !== "active") {
      await completeRequest(request);
      return;
    }

    const actionToken = await prepareActionToken(request, user.id, options.passwordResetMs);
    if (actionToken === null) {
      return;
    }
    await options.email.sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      token: actionToken.value,
      expiresAt: actionToken.expiresAt,
    });
    await completeRequest(request);
  };

  const handleFailure = async (request: AuthEmailRequest, error: unknown): Promise<void> => {
    reportError(error, request);

    if (request.attempts >= maxAttempts) {
      await completeRequest(request);
      return;
    }

    const exponentialDelay = retryBaseDelayMs * 2 ** Math.max(0, request.attempts - 1);
    const retryAt = new Date(
      options.clock.now().getTime() + Math.min(exponentialDelay, retryMaximumDelayMs),
    );
    const retried = await options.requests.retry(request.id, request.claimId, retryAt);
    if (!retried) {
      reportError(new Error("Auth email request lease was lost before retry"), request);
    }
  };

  const execute = async (): Promise<void> => {
    const now = options.clock.now();
    const requests = await options.requests.claim({
      at: now,
      staleBefore: new Date(now.getTime() - lockTimeoutMs),
      limit: batchSize,
    });

    await Promise.all(
      requests.map(async (request) => {
        try {
          await processRequest(request);
        } catch (error) {
          try {
            await handleFailure(request, error);
          } catch (queueError) {
            reportError(
              new AggregateError([error, queueError], "Auth email request recovery failed"),
              request,
            );
          }
        }
      }),
    );

    if (now.getTime() >= nextCompletedCleanupAt) {
      nextCompletedCleanupAt = now.getTime() + options.requestCooldownMs;
      await options.requests.deleteCompleted(new Date(now.getTime() - options.requestCooldownMs));
    }
  };

  return createNonOverlappingScheduler({
    task: execute,
    intervalMs: options.pollIntervalMs,
    onError: (error) => reportError(error),
  });
}
