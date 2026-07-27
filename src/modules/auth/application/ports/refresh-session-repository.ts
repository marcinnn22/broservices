import type {
  RefreshSession,
  RefreshSessionRevocationReason,
  SessionMetadata,
} from "../../domain/refresh-session.js";

export interface CreateRefreshSessionInput extends SessionMetadata {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  authVersion: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface RotateRefreshSessionInput extends SessionMetadata {
  currentSessionId: string;
  replacementSessionId: string;
  tokenHash: string;
  authVersion: number;
  expiresAt: Date;
  rotatedAt: Date;
}

export interface RefreshSessionRepository {
  findById(id: string): Promise<RefreshSession | null>;
  findByTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  create(input: CreateRefreshSessionInput): Promise<RefreshSession>;
  /**
   * Atomically revokes the current session and creates its replacement.
   * Returns null when another caller already consumed/revoked the session.
   */
  rotate(input: RotateRefreshSessionInput): Promise<RefreshSession | null>;
  /**
   * Resolves the presented token's family and revokes its active session
   * atomically. This also signs out a replacement created by a racing refresh.
   */
  revokeByTokenHash(
    tokenHash: string,
    reason: RefreshSessionRevocationReason,
    revokedAt: Date,
  ): Promise<boolean>;
  revokeFamily(
    familyId: string,
    reason: RefreshSessionRevocationReason,
    revokedAt: Date,
  ): Promise<number>;
  revokeAllForUser(
    userId: string,
    reason: RefreshSessionRevocationReason,
    revokedAt: Date,
  ): Promise<number>;
  deleteExpired(before: Date): Promise<number>;
}
