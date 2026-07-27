export const authActionPurposes = ["email_verification", "password_reset"] as const;

export type AuthActionPurpose = (typeof authActionPurposes)[number];

export interface AuthActionToken {
  id: string;
  userId: string;
  purpose: AuthActionPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}
