export type AuthErrorCode =
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_DISABLED"
  | "INVALID_ACCESS_TOKEN"
  | "INVALID_REFRESH_TOKEN"
  | "REFRESH_ALREADY_ROTATED"
  | "REFRESH_TOKEN_REUSED"
  | "INVALID_OR_EXPIRED_ACTION_TOKEN"
  | "EMAIL_ALREADY_VERIFIED"
  | "WEAK_PASSWORD";

export type AuthErrorCategory = "invalid_request" | "unauthenticated" | "forbidden" | "conflict";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly category: AuthErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class EmailAlreadyRegisteredError extends AuthError {
  constructor(options?: ErrorOptions) {
    super("EMAIL_ALREADY_REGISTERED", "conflict", "A user with this email already exists", options);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super("INVALID_CREDENTIALS", "unauthenticated", "Invalid email or password");
  }
}

export class EmailNotVerifiedError extends AuthError {
  constructor() {
    super("EMAIL_NOT_VERIFIED", "forbidden", "Email address has not been verified");
  }
}

export class AccountDisabledError extends AuthError {
  constructor() {
    super("ACCOUNT_DISABLED", "forbidden", "This account is disabled");
  }
}

export class InvalidAccessTokenError extends AuthError {
  constructor() {
    super("INVALID_ACCESS_TOKEN", "unauthenticated", "Access token is invalid or expired");
  }
}

export class InvalidRefreshTokenError extends AuthError {
  constructor() {
    super("INVALID_REFRESH_TOKEN", "unauthenticated", "Refresh token is invalid or expired");
  }
}

export class RefreshAlreadyRotatedError extends AuthError {
  constructor() {
    super(
      "REFRESH_ALREADY_ROTATED",
      "conflict",
      "A concurrent request already rotated this refresh token; retry with the latest cookie",
    );
  }
}

export class RefreshTokenReusedError extends AuthError {
  constructor() {
    super(
      "REFRESH_TOKEN_REUSED",
      "unauthenticated",
      "Refresh token reuse was detected; this session has been revoked",
    );
  }
}

export class InvalidActionTokenError extends AuthError {
  constructor() {
    super(
      "INVALID_OR_EXPIRED_ACTION_TOKEN",
      "invalid_request",
      "Token is invalid, expired, or has already been used",
    );
  }
}

export class EmailAlreadyVerifiedError extends AuthError {
  constructor() {
    super("EMAIL_ALREADY_VERIFIED", "conflict", "Email address is already verified");
  }
}

export class WeakPasswordError extends AuthError {
  constructor(message = "Password does not meet the password policy") {
    super("WEAK_PASSWORD", "invalid_request", message);
  }
}
