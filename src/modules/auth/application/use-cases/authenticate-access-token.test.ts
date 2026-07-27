import { describe, expect, it, vi } from "vitest";

import type { User, UserRepository } from "../../../users/index.js";
import { InvalidAccessTokenError } from "../../domain/auth.errors.js";
import type { RefreshSession } from "../../domain/refresh-session.js";
import type { AccessTokenClaims, AccessTokenService } from "../ports/access-token-service.js";
import type { RefreshSessionRepository } from "../ports/refresh-session-repository.js";
import { AuthenticateAccessToken } from "./authenticate-access-token.js";

const now = new Date("2026-07-27T10:00:00.000Z");
const user: User = {
  id: "7e71edcc-e74c-4a76-9e8b-b2c9687c5267",
  email: "person@example.com",
  name: "Person",
  role: "user",
  status: "active",
  emailVerifiedAt: new Date("2026-07-26T10:00:00.000Z"),
  authVersion: 2,
  createdAt: new Date("2026-07-26T09:00:00.000Z"),
  updatedAt: new Date("2026-07-26T10:00:00.000Z"),
};
const claims: AccessTokenClaims = {
  userId: user.id,
  role: user.role,
  authVersion: user.authVersion,
  sessionId: "4ca35c61-8b4d-42e7-8869-77d6fb77eff0",
  issuedAt: new Date(now.getTime() - 60_000),
  expiresAt: new Date(now.getTime() + 60_000),
};
const session: RefreshSession = {
  id: claims.sessionId,
  userId: user.id,
  familyId: "90522529-22a6-49f6-bb19-51d63298f5cf",
  tokenHash: "a".repeat(64),
  authVersion: user.authVersion,
  expiresAt: new Date(now.getTime() + 60_000),
  lastUsedAt: null,
  revokedAt: new Date(now.getTime() - 5_000),
  revocationReason: "rotated",
  createdAt: claims.issuedAt,
};

describe("AuthenticateAccessToken", () => {
  it("accepts an older tab's access token during the post-rotation grace period", async () => {
    const authenticate = createUseCase(session);

    await expect(authenticate.execute("access-token")).resolves.toEqual({
      userId: user.id,
      role: user.role,
      sessionId: session.id,
    });
  });

  it("rejects a rotated session after the access-token grace period", async () => {
    const authenticate = createUseCase({
      ...session,
      revokedAt: new Date(now.getTime() - 30_001),
    });

    await expect(authenticate.execute("access-token")).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it.each(["logout", "reuse_detected"] as const)(
    "does not grant rotation grace to a %s revocation",
    async (revocationReason) => {
      const authenticate = createUseCase({
        ...session,
        revocationReason,
      });

      await expect(authenticate.execute("access-token")).rejects.toBeInstanceOf(
        InvalidAccessTokenError,
      );
    },
  );
});

function createUseCase(currentSession: RefreshSession): AuthenticateAccessToken {
  return new AuthenticateAccessToken({
    users: {
      findById: vi.fn(async () => user),
    } as unknown as UserRepository,
    accessTokens: {
      issue: vi.fn(),
      verify: vi.fn(async () => claims),
    } as unknown as AccessTokenService,
    sessions: {
      findById: vi.fn(async () => currentSession),
    } as unknown as RefreshSessionRepository,
    clock: { now: () => now },
    rotationGraceMs: 30_000,
  });
}
