import type { UserRepository } from "../../../users/index.js";
import { InvalidAccessTokenError } from "../../domain/auth.errors.js";
import { type AcceptedResult, type AuthPrincipal, acceptedResult } from "../auth.types.js";
import type { Clock } from "../ports/clock.js";
import type { RefreshSessionRepository } from "../ports/refresh-session-repository.js";

export interface LogoutAllDependencies {
  users: UserRepository;
  sessions: RefreshSessionRepository;
  clock: Clock;
}

export class LogoutAll {
  constructor(private readonly dependencies: LogoutAllDependencies) {}

  async execute(principal: AuthPrincipal): Promise<AcceptedResult> {
    const now = this.dependencies.clock.now();
    const user = await this.dependencies.users.bumpAuthVersion(principal.userId, now);

    if (!user) {
      throw new InvalidAccessTokenError();
    }

    await this.dependencies.sessions.revokeAllForUser(principal.userId, "logout_all", now);

    return acceptedResult;
  }
}
