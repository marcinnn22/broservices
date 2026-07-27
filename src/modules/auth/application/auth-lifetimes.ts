export interface AuthLifetimes {
  refreshSessionMs: number;
  refreshReuseGraceMs: number;
  accessTokenRotationGraceMs: number;
  emailRequestCooldownMs: number;
  emailVerificationMs: number;
  passwordResetMs: number;
}

export function expiresAfter(now: Date, durationMs: number): Date {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new RangeError("Authentication token lifetime must be positive");
  }

  const timestamp = now.getTime() + durationMs;
  if (!Number.isSafeInteger(timestamp)) {
    throw new RangeError("Authentication token expiry is outside Date range");
  }

  return new Date(timestamp);
}
