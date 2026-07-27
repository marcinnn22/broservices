import type { OpenApiFragment } from "../../../platform/http/openapi.js";

const jsonBody = (schema: Readonly<Record<string, unknown>>) => ({
  required: true,
  content: { "application/json": { schema } },
});

const success = (description: string, schema?: Readonly<Record<string, unknown>>) => ({
  description,
  ...(schema === undefined ? {} : { content: { "application/json": { schema } } }),
});

const newPasswordSchema = {
  type: "string",
  minLength: 12,
  maxLength: 1024,
  format: "password",
  description:
    "At least 12 characters with lowercase, uppercase, number, and special-character classes; at most 1024 UTF-8 bytes.",
} as const;

export const authOpenApi: OpenApiFragment = {
  tags: [{ name: "Authentication", description: "Account and session lifecycle." }],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register an account",
        operationId: "registerUser",
        requestBody: jsonBody({ $ref: "#/components/schemas/RegisterInput" }),
        responses: {
          "201": success("Account created.", { $ref: "#/components/schemas/UserEnvelope" }),
          "400": { $ref: "#/components/responses/BadRequest" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Create an authenticated session",
        operationId: "login",
        requestBody: jsonBody({ $ref: "#/components/schemas/LoginInput" }),
        responses: {
          "200": success("Authenticated.", {
            $ref: "#/components/schemas/AuthSessionEnvelope",
          }),
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Rotate the refresh session",
        description: "Reads and replaces the HttpOnly refresh-token cookie.",
        operationId: "refreshSession",
        responses: {
          "200": success("Session rotated.", {
            $ref: "#/components/schemas/AuthSessionEnvelope",
          }),
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Revoke the current refresh session",
        operationId: "logout",
        responses: { "202": success("Logout accepted.") },
      },
    },
    "/auth/logout-all": {
      post: {
        tags: ["Authentication"],
        summary: "Revoke every session for the current user",
        operationId: "logoutAll",
        security: [{ bearerAuth: [] }],
        responses: {
          "202": success("Logout accepted."),
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/email/verify": {
      post: {
        tags: ["Authentication"],
        summary: "Verify an email address",
        operationId: "verifyEmail",
        requestBody: jsonBody({ $ref: "#/components/schemas/ActionTokenInput" }),
        responses: {
          "200": success("Email verified.", { $ref: "#/components/schemas/UserEnvelope" }),
          "400": { $ref: "#/components/responses/BadRequest" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/auth/email/resend": {
      post: {
        tags: ["Authentication"],
        summary: "Request another verification email",
        operationId: "resendVerificationEmail",
        requestBody: jsonBody({ $ref: "#/components/schemas/EmailInput" }),
        responses: { "202": success("Request accepted.") },
      },
    },
    "/auth/password/forgot": {
      post: {
        tags: ["Authentication"],
        summary: "Request a password-reset email",
        operationId: "requestPasswordReset",
        requestBody: jsonBody({ $ref: "#/components/schemas/EmailInput" }),
        responses: { "202": success("Request accepted.") },
      },
    },
    "/auth/password/reset": {
      post: {
        tags: ["Authentication"],
        summary: "Reset a password using a one-time token",
        operationId: "resetPassword",
        requestBody: jsonBody({ $ref: "#/components/schemas/ResetPasswordInput" }),
        responses: {
          "202": success("Password reset accepted."),
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
  },
  components: {
    schemas: {
      EmailInput: {
        type: "object",
        additionalProperties: false,
        required: ["email"],
        properties: { email: { type: "string", format: "email", maxLength: 320 } },
      },
      RegisterInput: {
        type: "object",
        additionalProperties: false,
        required: ["email", "name", "password"],
        properties: {
          email: { type: "string", format: "email", maxLength: 320 },
          name: { type: "string", minLength: 2, maxLength: 100 },
          password: newPasswordSchema,
        },
      },
      LoginInput: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
      },
      ActionTokenInput: {
        type: "object",
        additionalProperties: false,
        required: ["token"],
        properties: { token: { type: "string", minLength: 16 } },
      },
      ResetPasswordInput: {
        type: "object",
        additionalProperties: false,
        required: ["token", "password"],
        properties: {
          token: { type: "string", minLength: 16 },
          password: newPasswordSchema,
        },
      },
      AuthSessionEnvelope: {
        type: "object",
        required: ["success", "data", "requestId"],
        properties: {
          success: { type: "boolean", const: true },
          data: {
            type: "object",
            required: ["user", "accessToken", "refreshTokenExpiresAt"],
            properties: {
              user: { $ref: "#/components/schemas/User" },
              accessToken: { type: "string" },
              refreshTokenExpiresAt: { type: "string", format: "date-time" },
            },
          },
          requestId: { type: "string" },
        },
      },
    },
  },
};
