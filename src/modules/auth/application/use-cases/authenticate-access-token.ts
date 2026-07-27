import type { UserRepository } from "../../../users/index.js";
import { InvalidAccessTokenError } from "../../domain/auth.errors.js";
import type { AuthPrincipal } from "../auth.types.js";
import type { AccessTokenService } from "../ports/access-token-service.js";
import type { Clock } from "../ports/clock.js";
import type { RefreshSessionRepository } from "../ports/refresh-session-repository.js";

export interface AuthenticateAccessTokenDependencies {
  users: UserRepository;
  accessTokens: AccessTokenService;
  sessions: RefreshSessionRepository;
  clock: Clock;
  rotationGraceMs: number;
}

export class AuthenticateAccessToken {
  constructor(private readonly dependencies: AuthenticateAccessTokenDependencies) {}

  async execute(token: string): Promise<AuthPrincipal> {
    const claims = await this.dependencies.accessTokens.verify(token);
    if (!claims) {
      throw new InvalidAccessTokenError();
    }

    const [user, session] = await Promise.all([
      this.dependencies.users.findById(claims.userId),
      this.dependencies.sessions.findById(claims.sessionId),
    ]);
    const now = this.dependencies.clock.now();
    const sessionAllowsAccess =
      session !== null &&
      (session.revokedAt === null ||
        (session.revocationReason === "rotated" &&
          claims.issuedAt.getTime() <= session.revokedAt.getTime() &&
          now.getTime() - session.revokedAt.getTime() <= this.dependencies.rotationGraceMs));

    if (
      user?.status !== "active" ||
      user.authVersion !== claims.authVersion ||
      user.role !== claims.role ||
      !session ||
      session.userId !== user.id ||
      session.authVersion !== user.authVersion ||
      !sessionAllowsAccess ||
      session.expiresAt.getTime() <= now.getTime()
    ) {
      throw new InvalidAccessTokenError();
    }

    return {
      userId: user.id,
      role: user.role,
      sessionId: session.id,
    };
  }
}
