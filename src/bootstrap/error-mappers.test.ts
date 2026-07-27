import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { EmailAlreadyVerifiedError, InvalidCredentialsError } from "../modules/auth/index.js";
import { UserNotFoundError } from "../modules/users/index.js";
import { applicationErrorMapper } from "./error-mappers.js";

describe("application error mapper", () => {
  it.each([
    [new InvalidCredentialsError(), 401],
    [new EmailAlreadyVerifiedError(), 409],
    [new UserNotFoundError(), 404],
  ])("uses the status owned by %s", (error, expectedStatus) => {
    expect(applicationErrorMapper(error, {} as Request)).toMatchObject({
      statusCode: expectedStatus,
      code: error.code,
      message: error.message,
    });
  });

  it("does not expose arbitrary coded errors as client errors", () => {
    expect(
      applicationErrorMapper(
        Object.assign(new Error("internal"), { code: "INTERNAL_DATABASE_ERROR" }),
        {} as Request,
      ),
    ).toBeUndefined();
  });
});
