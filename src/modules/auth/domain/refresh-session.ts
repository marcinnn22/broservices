export const refreshSessionRevocationReasons = [
  "rotated",
  "logout",
  "logout_all",
  "credentials_changed",
  "account_changed",
  "reuse_detected",
] as const;

export type RefreshSessionRevocationReason = (typeof refreshSessionRevocationReasons)[number];

export interface RefreshSession {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  authVersion: number;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revocationReason: RefreshSessionRevocationReason | null;
  createdAt: Date;
}

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}
