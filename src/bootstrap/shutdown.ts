import type { Server } from "node:http";
import { performance } from "node:perf_hooks";

import type { Logger } from "../platform/observability/index.js";

export interface GracefulShutdownOptions {
  readonly server: Server;
  readonly timeoutMs: number;
  readonly logger: Logger;
  readonly closeResources: () => Promise<void>;
  readonly forceExit?: (exitCode: number) => void;
}

export function createGracefulShutdown(options: GracefulShutdownOptions) {
  let shutdownPromise: Promise<void> | undefined;

  return (reason: string): Promise<void> => {
    if (shutdownPromise === undefined) {
      shutdownPromise = performShutdown(reason, options).catch((error: unknown) => {
        shutdownPromise = undefined;
        throw error;
      });
    }

    return shutdownPromise;
  };
}

async function performShutdown(reason: string, options: GracefulShutdownOptions): Promise<void> {
  options.logger.info("Graceful shutdown started", { reason });

  const deadline = performance.now() + options.timeoutMs;
  // Reserve half of the total budget for workers and infrastructure. If HTTP
  // drains sooner, resources automatically receive the unused time.
  const httpDrainBudgetMs = Math.max(1, Math.floor(options.timeoutMs / 2));
  const httpClose = await closeHttpServerWithinDeadline(options, httpDrainBudgetMs);
  const errors: unknown[] = [];
  let timedOut = false;

  if (httpClose.status === "failed") {
    errors.push(httpClose.error);
  } else if (httpClose.status === "timed_out") {
    timedOut = true;
    errors.push(new Error("HTTP server shutdown exceeded its deadline"));
    if (httpClose.forceCloseError !== undefined) {
      errors.push(httpClose.forceCloseError);
    }
  }

  const resourceClose = await closeResourcesWithinDeadline(
    options.closeResources,
    Math.max(0, deadline - performance.now()),
  );
  if (resourceClose.status === "failed") {
    errors.push(resourceClose.error);
  } else if (resourceClose.status === "timed_out") {
    timedOut = true;
    options.logger.error("Resource shutdown exceeded the graceful-shutdown deadline");
    errors.push(new Error("Resource shutdown exceeded the graceful-shutdown deadline"));
  }

  if (timedOut) {
    try {
      (options.forceExit ?? process.exit)(1);
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more graceful shutdown steps failed");
  }

  options.logger.info("Graceful shutdown completed");
}

const closeHttpServer = (server: Server): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
    server.closeIdleConnections();
  });

type HttpServerCloseResult =
  | { readonly status: "closed" }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "timed_out"; readonly forceCloseError?: unknown };

const closeHttpServerWithinDeadline = async (
  options: GracefulShutdownOptions,
  timeoutMs: number,
): Promise<HttpServerCloseResult> => {
  const closeResult: Promise<HttpServerCloseResult> = closeHttpServer(options.server).then(
    (): HttpServerCloseResult => ({ status: "closed" }),
    (error: unknown): HttpServerCloseResult => ({ status: "failed", error }),
  );
  let timeout: NodeJS.Timeout | undefined;
  const timeoutResult = new Promise<HttpServerCloseResult>((resolve) => {
    timeout = setTimeout(() => {
      options.logger.error("Graceful shutdown timed out; closing active connections");

      try {
        options.server.closeAllConnections();
        resolve({ status: "timed_out" });
      } catch (forceCloseError) {
        resolve({ status: "timed_out", forceCloseError });
      }
    }, timeoutMs);
  });

  try {
    return await Promise.race([closeResult, timeoutResult]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};

type ResourceCloseResult =
  | { readonly status: "closed" }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "timed_out" };

const closeResourcesWithinDeadline = async (
  closeResources: () => Promise<void>,
  timeoutMs: number,
): Promise<ResourceCloseResult> => {
  let closePromise: Promise<void>;
  try {
    closePromise = closeResources();
  } catch (error) {
    return { status: "failed", error };
  }

  const closeResult: Promise<ResourceCloseResult> = closePromise.then(
    (): ResourceCloseResult => ({ status: "closed" }),
    (error: unknown): ResourceCloseResult => ({ status: "failed", error }),
  );

  if (timeoutMs <= 0) {
    return { status: "timed_out" };
  }

  let timeout: NodeJS.Timeout | undefined;
  const timeoutResult = new Promise<ResourceCloseResult>((resolve) => {
    timeout = setTimeout(() => resolve({ status: "timed_out" }), timeoutMs);
  });

  try {
    return await Promise.race([closeResult, timeoutResult]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
};
