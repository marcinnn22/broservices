import { toUserView, type UserView } from "../../../users/index.js";
import {
  AccountDisabledError,
  EmailAlreadyVerifiedError,
  InvalidActionTokenError,
} from "../../domain/auth.errors.js";
import type { AuthActionTokenRepository } from "../ports/auth-action-token-repository.js";
import type { Clock } from "../ports/clock.js";
import type { OpaqueTokenService } from "../ports/opaque-token-service.js";

export interface VerifyEmailDependencies {
  opaqueTokens: OpaqueTokenService;
  actionTokens: AuthActionTokenRepository;
  clock: Clock;
}

export class VerifyEmail {
  constructor(private readonly dependencies: VerifyEmailDependencies) {}

  async execute(rawToken: string): Promise<UserView> {
    const now = this.dependencies.clock.now();
    const result = await this.dependencies.actionTokens.consumeEmailVerification(
      this.dependencies.opaqueTokens.hash(rawToken),
      now,
    );

    if (result.outcome === "disabled") {
      throw new AccountDisabledError();
    }
    if (result.outcome === "already_verified") {
      throw new EmailAlreadyVerifiedError();
    }
    if (result.outcome === "invalid") {
      throw new InvalidActionTokenError();
    }

    return toUserView(result.user);
  }
}
