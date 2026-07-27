import type { OpenApiFragment } from "../../../platform/http/openapi.js";

const authenticatedOperation = {
  security: [{ bearerAuth: [] }],
  responses: {
    "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" },
  },
};

export const usersOpenApi: OpenApiFragment = {
  tags: [{ name: "Users", description: "User profiles and administration." }],
  paths: {
    "/users": {
      get: {
        ...authenticatedOperation,
        tags: ["Users"],
        summary: "List users (administrator)",
        operationId: "listUsers",
        parameters: [
          { in: "query", name: "page", schema: { type: "integer", minimum: 1 } },
          {
            in: "query",
            name: "pageSize",
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
          { in: "query", name: "search", schema: { type: "string" } },
          { in: "query", name: "role", schema: { type: "string", enum: ["user", "admin"] } },
          {
            in: "query",
            name: "status",
            schema: { type: "string", enum: ["active", "disabled"] },
          },
        ],
      },
    },
    "/users/me": {
      get: {
        ...authenticatedOperation,
        tags: ["Users"],
        summary: "Get the current user",
        operationId: "getCurrentUser",
      },
      patch: {
        ...authenticatedOperation,
        tags: ["Users"],
        summary: "Update the current user's profile",
        operationId: "updateCurrentUser",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateProfileInput" },
            },
          },
        },
      },
    },
    "/users/{userId}": {
      get: {
        ...authenticatedOperation,
        tags: ["Users"],
        summary: "Get a user",
        operationId: "getUser",
        parameters: [{ $ref: "#/components/parameters/UserId" }],
      },
      patch: {
        ...authenticatedOperation,
        tags: ["Users"],
        summary: "Update a user's profile",
        operationId: "updateUser",
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateProfileInput" },
            },
          },
        },
      },
    },
    "/users/{userId}/role": {
      patch: {
        ...authenticatedOperation,
        tags: ["Users"],
        summary: "Change a user's role (administrator)",
        operationId: "changeUserRole",
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["role"],
                properties: { role: { type: "string", enum: ["user", "admin"] } },
              },
            },
          },
        },
      },
    },
    "/users/{userId}/status": {
      patch: {
        ...authenticatedOperation,
        tags: ["Users"],
        summary: "Change a user's status (administrator)",
        operationId: "changeUserStatus",
        parameters: [{ $ref: "#/components/parameters/UserId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: { type: "string", enum: ["active", "disabled"] },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    parameters: {
      UserId: {
        in: "path",
        name: "userId",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      User: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "email",
          "name",
          "role",
          "status",
          "emailVerifiedAt",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          name: { type: "string" },
          role: { type: "string", enum: ["user", "admin"] },
          status: { type: "string", enum: ["active", "disabled"] },
          emailVerifiedAt: {
            oneOf: [{ type: "string", format: "date-time" }, { type: "null" }],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      UpdateProfileInput: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: { name: { type: "string", minLength: 2, maxLength: 100 } },
      },
      UserEnvelope: {
        type: "object",
        required: ["success", "data", "requestId"],
        properties: {
          success: { type: "boolean", const: true },
          data: {
            type: "object",
            required: ["user"],
            properties: { user: { $ref: "#/components/schemas/User" } },
          },
          requestId: { type: "string" },
        },
      },
    },
  },
};
