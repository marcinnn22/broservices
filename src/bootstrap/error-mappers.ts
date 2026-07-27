import { AuthError } from "../modules/auth/index.js";
import { UserError } from "../modules/users/index.js";
import { type ErrorMapper, HttpError } from "../platform/http/index.js";

type ApplicationErrorCategory = AuthError["category"] | UserError["category"];

const statusForCategory = (category: ApplicationErrorCategory): 400 | 401 | 403 | 404 | 409 => {
  switch (category) {
    case "invalid_request":
      return 400;
    case "unauthenticated":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
  }
};

export const applicationErrorMapper: ErrorMapper = (error) => {
  if (!(error instanceof AuthError || error instanceof UserError)) {
    return undefined;
  }

  return new HttpError({
    statusCode: statusForCategory(error.category),
    code: error.code,
    message: error.message,
    cause: error,
  });
};
