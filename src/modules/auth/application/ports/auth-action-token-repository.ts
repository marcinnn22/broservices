import type { User } from "../../../users/domain/user.js";
import type { AuthActionPurpose, AuthActionToken } from "../../domain/auth-action-token.js";

export interface ReplaceAuthActionTokenInput {
  userId: string;
  purpose: AuthActionPurpose;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CommitPasswordResetInput {
  tokenHash: string;
  passwordHash: string;
  changedAt: Date;
}

export type EmailVerificationResult =
  | { readonly outcome: "verified"; readonly user: User }
  | { readonly outcome: "already_verified" }
  | { readonly outcome: "disabled" }
  | { readonly outcome: "invalid" };

export type PasswordResetCommitResult =
  | { readonly outcome: "reset"; readonly user: User }
  | { readonly outcome: "disabled" }
  | { readonly outcome: "invalid" };

export interface AuthActionTokenRepository {
  replace(input: ReplaceAuthActionTokenInput): Promise<AuthActionToken>;
  findValid(
    tokenHash: string,
    purpose: AuthActionPurpose,
    at: Date,
  ): Promise<AuthActionToken | null>;
  commitPasswordReset(input: CommitPasswordResetInput): Promise<PasswordResetCommitResult>;
  consumeEmailVerification(tokenHash: string, verifiedAt: Date): Promise<EmailVerificationResult>;
  deleteExpired(before: Date): Promise<number>;
}
