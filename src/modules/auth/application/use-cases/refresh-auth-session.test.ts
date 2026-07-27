import { describe, expect, it, vi } from "vitest";
import type { User, UserRepository } from "../../../users/index.js";
import { RefreshAlreadyRotatedError, RefreshTokenReusedError } from "../../domain/auth.errors.js";
import type { RefreshSession } from "../../domain/refresh-session.js";
import type { AccessTokenService } from "../ports/access-token-service.js";
import type { OpaqueTokenService } from "../ports/opaque-token-service.js";
import type { RefreshSessionRepository } from "../ports/refresh-session-repository.js";
import { RefreshAuthSession, type RefreshAuthSessionDependencies } from "./refresh-auth-session.js";

const now = new Date("2026-07-26T07:00:00.000Z");
const expiresAt = new Date("2026-08-25T07:00:00.000Z");

const user: User = {
  id: "7e71edcc-e74c-4a76-9e8b-b2c9687c5267",
  email: "person@example.com",
  name: "Person",
  role: "user",
  status: "active",
  emailVerifiedAt: new Date("2026-07-25T07:00:00.000Z"),
  authVersion: 2,
  createdAt: new Date("2026-07-25T06:00:00.000Z"),
  updatedAt: new Date("2026-07-25T07:00:00.000Z"),
};

const currentSession: RefreshSession = {
  id: "4ca35c61-8b4d-42e7-8869-77d6fb77eff0",
  userId: user.id,
  familyId: "90522529-22a6-49f6-bb19-51d63298f5cf",
  tokenHash: "a".repeat(64),
  authVersion: user.authVersion,
  expiresAt,
  lastUsedAt: null,
  revokedAt: null,
  revocationReason: null,
  createdAt: now,
};

const replacementSession: RefreshSession = {
  ...currentSession,
  id: "b2dd7d8c-d487-48af-b35f-90b9ece162d9",
  tokenHash: "b".repeat(64),
  createdAt: now,
};

describe("RefreshAuthSession", () => {
  it("rotates the session while preserving the absolute family expiry", async () => {
    const rotate = vi.fn(async () => replacementSession);
    const revokeFamily = vi.fn(async () => 0);
    const useCase = new RefreshAuthSession(
      dependencies({
        current: currentSession,
        rotate,
        revokeFamily,
      }),
    );

    const result = await useCase.execute({
      refreshToken: "rt_original",
      ipAddress: "127.0.0.1",
    });

    expect(result).toMatchObject({
      accessToken: "signed-access-token",
      refreshToken: "rt_replacement",
      refreshTokenExpiresAt: expiresAt,
    });
    expect(rotate).toHaveBeenCalledWith(
      expect.objectContaining({
        currentSessionId: currentSession.id,
        replacementSessionId: replacementSession.id,
        expiresAt,
        ipAddress: "127.0.0.1",
      }),
    );
    expect(revokeFamily).not.toHaveBeenCalled();
  });

  it("revokes the token family when a rotated token is reused", async () => {
    const reusedSession: RefreshSession = {
      ...currentSession,
      revokedAt: new Date(now.getTime() - 5_001),
      revocationReason: "rotated",
    };
    const revokeFamily = vi.fn(async () => 1);
    const useCase = new RefreshAuthSession(
      dependencies({
        current: reusedSession,
        rotate: vi.fn(async () => null),
        revokeFamily,
      }),
    );

    await expect(useCase.execute({ refreshToken: "rt_original" })).rejects.toBeInstanceOf(
      RefreshTokenReusedError,
    );
    expect(revokeFamily).toHaveBeenCalledWith(currentSession.familyId, "reuse_detected", now);
  });

  it("does not revoke the winner when a recently rotated token is retried", async () => {
    const recentlyRotated: RefreshSession = {
      ...currentSession,
      revokedAt: new Date(now.getTime() - 1_000),
      revocationReason: "rotated",
    };
    const revokeFamily = vi.fn(async () => 0);
    const useCase = new RefreshAuthSession(
      dependencies({
        current: recentlyRotated,
        rotate: vi.fn(async () => null),
        revokeFamily,
      }),
    );

    await expect(useCase.execute({ refreshToken: "rt_original" })).rejects.toBeInstanceOf(
      RefreshAlreadyRotatedError,
    );
    expect(revokeFamily).not.toHaveBeenCalled();
  });

  it("does not report reuse when the wall clock moves behind the rotation timestamp", async () => {
    const rotatedAfterClockSkew: RefreshSession = {
      ...currentSession,
      revokedAt: new Date(now.getTime() + 1_000),
      revocationReason: "rotated",
    };
    const revokeFamily = vi.fn(async () => 0);
    const useCase = new RefreshAuthSession(
      dependencies({
        current: rotatedAfterClockSkew,
        rotate: vi.fn(async () => null),
        revokeFamily,
      }),
    );

    await expect(useCase.execute({ refreshToken: "rt_original" })).rejects.toBeInstanceOf(
      RefreshAlreadyRotatedError,
    );
    expect(revokeFamily).not.toHaveBeenCalled();
  });

  it("re-reads a session after losing the atomic rotation race", async () => {
    const recentlyRotated: RefreshSession = {
      ...currentSession,
      revokedAt: now,
      revocationReason: "rotated",
    };
    const revokeFamily = vi.fn(async () => 0);
    const useCase = new RefreshAuthSession(
      dependencies({
        current: currentSession,
        latest: recentlyRotated,
        rotate: vi.fn(async () => null),
        revokeFamily,
      }),
    );

    await expect(useCase.execute({ refreshToken: "rt_original" })).rejects.toBeInstanceOf(
      RefreshAlreadyRotatedError,
    );
    expect(revokeFamily).not.toHaveBeenCalled();
  });
});

function dependencies(input: {
  current: RefreshSession;
  latest?: RefreshSession;
  rotate: RefreshSessionRepository["rotate"];
  revokeFamily: RefreshSessionRepository["revokeFamily"];
}): RefreshAuthSessionDependencies {
  const users = {
    findById: vi.fn(async () => user),
  } as unknown as UserRepository;

  const sessions = {
    findByTokenHash: vi.fn(async () => input.current),
    findById: vi.fn(async () => input.latest ?? input.current),
    rotate: input.rotate,
    revokeFamily: input.revokeFamily,
  } as unknown as RefreshSessionRepository;

  const accessTokens: AccessTokenService = {
    issue: vi.fn(async () => "signed-access-token"),
    verify: vi.fn(async () => null),
  };
  const opaqueTokens: OpaqueTokenService = {
    issue: vi.fn(() => ({
      value: "rt_replacement",
      hash: replacementSession.tokenHash,
    })),
    hash: vi.fn(() => currentSession.tokenHash),
  };

  return {
    users,
    sessions,
    accessTokens,
    opaqueTokens,
    ids: { generate: () => replacementSession.id },
    clock: { now: () => now },
    refreshReuseGraceMs: 5_000,
  };
}
