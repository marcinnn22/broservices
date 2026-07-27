import type { UserRepository } from "../../../users/index.js";
import { AccountDisabledError, InvalidActionTokenError } from "../../domain/auth.errors.js";
import { assertPasswordMeetsPolicy } from "../../domain/password-policy.js";
import { type AcceptedResult, acceptedResult } from "../auth.types.js";
import type { AuthActionTokenRepository } from "../ports/auth-action-token-repository.js";
import type { AuthEmailSender } from "../ports/auth-email-sender.js";
import type { Clock } from "../ports/clock.js";
import type { OpaqueTokenService } from "../ports/opaque-token-service.js";
import type { PasswordHasher } from "../ports/password-hasher.js";

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface ResetPasswordDependencies {
  users: UserRepository;
  passwords: PasswordHasher;
  opaqueTokens: OpaqueTokenService;
  actionTokens: AuthActionTokenRepository;
  email: AuthEmailSender;
  clock: Clock;
  onNotificationError?: (notification: "password_changed", error: unknown) => void;
}

export class ResetPassword {
  constructor(private readonly dependencies: ResetPasswordDependencies) {}

  async execute(input: ResetPasswordInput): Promise<AcceptedResult> {
    assertPasswordMeetsPolicy(input.password);
    const now = this.dependencies.clock.now();
    const tokenHash = this.dependencies.opaqueTokens.hash(input.token);
    const actionToken = await this.dependencies.actionTokens.findValid(
      tokenHash,
      "password_reset",
      now,
    );

    if (!actionToken) {
      throw new InvalidActionTokenError();
    }

    const currentUser = await this.dependencies.users.findById(actionToken.userId);
    if (!currentUser) {
      throw new InvalidActionTokenError();
    }
    if (currentUser.status !== "active") {
      throw new AccountDisabledError();
    }

    const passwordHash = await this.dependencies.passwords.hash(input.password);
    const result = await this.dependencies.actionTokens.commitPasswordReset({
      tokenHash,
      passwordHash,
      changedAt: now,
    });

    if (result.outcome === "disabled") {
      throw new AccountDisabledError();
    }
    if (result.outcome === "invalid") {
      throw new InvalidActionTokenError();
    }

    const user = result.user;
    try {
      await this.dependencies.email.sendPasswordChangedEmail({
        email: user.email,
        name: user.name,
        changedAt: now,
      });
    } catch (error) {
      try {
        this.dependencies.onNotificationError?.("password_changed", error);
      } catch {
        // Observability must not turn a completed password change into a failure response.
      }
    }

    return acceptedResult;
  }
}
