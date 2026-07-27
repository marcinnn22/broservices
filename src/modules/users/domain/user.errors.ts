export type UserErrorCode =
  | "USER_NOT_FOUND"
  | "USER_EMAIL_ALREADY_EXISTS"
  | "INVALID_USER_EMAIL"
  | "INVALID_USER_NAME"
  | "USER_OPERATION_FORBIDDEN"
  | "LAST_ADMIN_PROTECTION";

export type UserErrorCategory = "invalid_request" | "forbidden" | "not_found" | "conflict";

export class UserError extends Error {
  constructor(
    readonly code: UserErrorCode,
    readonly category: UserErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class UserNotFoundError extends UserError {
  constructor() {
    super("USER_NOT_FOUND", "not_found", "User not found");
  }
}

export class DuplicateUserEmailError extends UserError {
  constructor(options?: ErrorOptions) {
    super(
      "USER_EMAIL_ALREADY_EXISTS",
      "conflict",
      "A user with this email already exists",
      options,
    );
  }
}

export class InvalidEmailError extends UserError {
  constructor() {
    super("INVALID_USER_EMAIL", "invalid_request", "Email address is invalid");
  }
}

export class InvalidUserNameError extends UserError {
  constructor() {
    super("INVALID_USER_NAME", "invalid_request", "Name must contain between 2 and 100 characters");
  }
}

export class UserOperationForbiddenError extends UserError {
  constructor(message = "You are not allowed to perform this user operation") {
    super("USER_OPERATION_FORBIDDEN", "forbidden", message);
  }
}

export class LastAdminProtectionError extends UserError {
  constructor() {
    super("LAST_ADMIN_PROTECTION", "conflict", "At least one active administrator must remain");
  }
}
