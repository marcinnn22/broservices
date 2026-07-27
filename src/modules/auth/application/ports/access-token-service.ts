import type { UserRole } from "../../../users/index.js";

export interface IssueAccessTokenInput {
  userId: string;
  role: UserRole;
  authVersion: number;
  sessionId: string;
  issuedAt: Date;
}

export interface AccessTokenClaims {
  userId: string;
  role: UserRole;
  authVersion: number;
  sessionId: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface AccessTokenService {
  issue(input: IssueAccessTokenInput): Promise<string>;
  verify(token: string): Promise<AccessTokenClaims | null>;
}
