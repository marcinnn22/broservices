import { toUserView, type UserRepository } from "../../../users/index.js";
import {
  InvalidRefreshTokenError,
  RefreshAlreadyRotatedError,
  RefreshTokenReusedError,
} from "../../domain/auth.errors.js";
import type { RefreshSession, SessionMetadata } from "../../domain/refresh-session.js";
import type { AuthSessionResult } from "../auth.types.js";
import type { AccessTokenService } from "../ports/access-token-service.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { OpaqueTokenService } from "../ports/opaque-token-service.js";
import type { RefreshSessionRepository } from "../ports/refresh-session-repository.js";
import { normalizeSessionMetadata } from "../session-metadata.js";

export interface RefreshAuthSessionInput extends SessionMetadata {
  refreshToken: string;
}

export interface RefreshAuthSessionDependencies {
  users: UserRepository;
  accessTokens: AccessTokenService;
  opaqueTokens: OpaqueTokenService;
  sessions: RefreshSessionRepository;
  ids: IdGenerator;
  clock: Clock;
  refreshReuseGraceMs: number;
}

export class RefreshAuthSession {
  constructor(private readonly dependencies: RefreshAuthSessionDependencies) {}

  async execute(input: RefreshAuthSessionInput): Promise<AuthSessionResult> {
    const now = this.dependencies.clock.now();
    const tokenHash = this.dependencies.opaqueTokens.hash(input.refreshToken);
    const current = await this.dependencies.sessions.findByTokenHash(tokenHash);

    if (!current) {
      throw new InvalidRefreshTokenError();
    }

    if (current.revokedAt) {
      await this.rejectRevokedSession(current, now);
    }

    if (current.expiresAt.getTime() <= now.getTime()) {
      throw new InvalidRefreshTokenError();
    }

    const user = await this.dependencies.users.findById(current.userId);
    if (
      user?.status !== "active" ||
      !user.emailVerifiedAt ||
      user.authVersion !== current.authVersion
    ) {
      await this.dependencies.sessions.revokeFamily(current.familyId, "account_changed", now);
      throw new InvalidRefreshTokenError();
    }

    const refreshToken = this.dependencies.opaqueTokens.issue("refresh");
    const replacementSessionId = this.dependencies.ids.generate();
    const accessToken = await this.dependencies.accessTokens.issue({
      userId: user.id,
      role: user.role,
      authVersion: user.authVersion,
      sessionId: replacementSessionId,
      issuedAt: now,
    });

    const replacement = await this.dependencies.sessions.rotate({
      currentSessionId: current.id,
      replacementSessionId,
      tokenHash: refreshToken.hash,
      authVersion: user.authVersion,
      expiresAt: current.expiresAt,
      rotatedAt: now,
      ...normalizeSessionMetadata(input),
    });

    if (!replacement) {
      const latest = await this.dependencies.sessions.findById(current.id);

      if (latest?.revokedAt) {
        await this.rejectRevokedSession(latest, now);
      }

      throw new InvalidRefreshTokenError();
    }

    return {
      user: toUserView(user),
      accessToken,
      refreshToken: refreshToken.value,
      refreshTokenExpiresAt: replacement.expiresAt,
    };
  }

  private async rejectRevokedSession(session: RefreshSession, now: Date): Promise<never> {
    if (session.revocationReason !== "rotated" || session.revokedAt === null) {
      throw new InvalidRefreshTokenError();
    }

    const elapsedMs = now.getTime() - session.revokedAt.getTime();
    // A wall clock can move backwards after NTP correction. Treat a future
    // revocation timestamp as an immediate concurrent retry, never as theft.
    if (elapsedMs <= this.dependencies.refreshReuseGraceMs) {
      throw new RefreshAlreadyRotatedError();
    }

    await this.dependencies.sessions.revokeFamily(session.familyId, "reuse_detected", now);
    throw new RefreshTokenReusedError();
  }
}
