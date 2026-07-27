import type { UserRole, UserView } from "../../users/index.js";

export interface AuthSessionResult {
  user: UserView;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthPrincipal {
  userId: string;
  role: UserRole;
  sessionId: string;
}

export interface AcceptedResult {
  accepted: true;
}

export const acceptedResult: AcceptedResult = Object.freeze({
  accepted: true,
});
