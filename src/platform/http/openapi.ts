import { apiReference } from "@scalar/express-api-reference";
import { type RequestHandler, Router } from "express";

import { createDocsSecurityMiddleware } from "./middleware/security.js";

export interface OpenApiFragment {
  readonly tags?: readonly Readonly<Record<string, unknown>>[];
  readonly paths?: Readonly<Record<string, unknown>>;
  readonly components?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export interface OpenApiDocument extends OpenApiFragment {
  readonly openapi: "3.1.0";
  readonly info: {
    readonly title: string;
    readonly version: string;
    readonly description?: string;
    readonly license?: {
      readonly name: string;
      readonly url?: string;
    };
  };
  readonly servers: readonly {
    readonly url: string;
    readonly description?: string;
  }[];
}

export interface OpenApiDocumentOptions {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
  readonly serverUrl?: string;
  readonly fragments?: readonly OpenApiFragment[];
}

const mergeComponents = (
  target: Record<string, Record<string, unknown>>,
  source: OpenApiFragment["components"],
): void => {
  if (source === undefined) {
    return;
  }

  for (const [category, definitions] of Object.entries(source)) {
    target[category] = {
      ...(target[category] ?? {}),
      ...definitions,
    };
  }
};

export function createOpenApiDocument(options: OpenApiDocumentOptions): OpenApiDocument {
  const paths: Record<string, unknown> = {};
  const components: Record<string, Record<string, unknown>> = {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    headers: {
      RequestId: {
        description: "Correlation identifier for the request.",
        schema: { type: "string", maxLength: 128 },
      },
    },
    schemas: {
      ApiError: {
        type: "object",
        additionalProperties: false,
        required: ["success", "error", "requestId"],
        properties: {
          success: { type: "boolean", const: false },
          error: {
            type: "object",
            additionalProperties: false,
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
            },
          },
          requestId: { type: "string" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "The request is invalid.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      Unauthorized: {
        description: "Authentication is required.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      Forbidden: {
        description: "The operation is not allowed.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      Conflict: {
        description: "The request conflicts with the current resource state.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      NotFound: {
        description: "The resource was not found.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      InternalServerError: {
        description: "An unexpected server error occurred.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
    },
  };
  const tags: Readonly<Record<string, unknown>>[] = [];

  for (const fragment of options.fragments ?? []) {
    Object.assign(paths, fragment.paths ?? {});
    mergeComponents(components, fragment.components);
    tags.push(...(fragment.tags ?? []));
  }

  return {
    openapi: "3.1.0",
    info: {
      title: options.title,
      version: options.version,
      ...(options.description === undefined ? {} : { description: options.description }),
      license: {
        name: "MIT",
        url: "https://opensource.org/license/mit",
      },
    },
    servers: [
      {
        url: options.serverUrl ?? "/",
        description: "API server",
      },
    ],
    tags,
    paths,
    components,
  };
}

export function createOpenApiRouter(options: {
  readonly document: OpenApiDocument;
  readonly title?: string;
}): Router {
  const router = Router();
  const noStore: RequestHandler = (_request, response, next): void => {
    response.setHeader("Cache-Control", "no-store");
    next();
  };

  router.use(createDocsSecurityMiddleware());
  router.use(noStore);
  router.get("/openapi.json", (_request, response) => {
    response.json(options.document);
  });
  router.get(
    "/",
    apiReference({
      content: options.document,
      pageTitle: options.title ?? options.document.info.title,
      theme: "purple",
      hideModels: false,
      persistAuth: true,
    }),
  );

  return router;
}
