import { type AcceptedResult, acceptedResult } from "../auth.types.js";
import type { Clock } from "../ports/clock.js";
import type { OpaqueTokenService } from "../ports/opaque-token-service.js";
import type { RefreshSessionRepository } from "../ports/refresh-session-repository.js";

export interface LogoutDependencies {
  opaqueTokens: OpaqueTokenService;
  sessions: RefreshSessionRepository;
  clock: Clock;
}

export class Logout {
  constructor(private readonly dependencies: LogoutDependencies) {}

  async execute(refreshToken: string): Promise<AcceptedResult> {
    const tokenHash = this.dependencies.opaqueTokens.hash(refreshToken);
    await this.dependencies.sessions.revokeByTokenHash(
      tokenHash,
      "logout",
      this.dependencies.clock.now(),
    );

    return acceptedResult;
  }
}
