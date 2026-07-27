import type { Logger } from "./logger.js";

export type FatalErrorOrigin = "uncaughtException" | "unhandledRejection";

export interface ProcessErrorHandlerOptions {
  readonly logger: Logger;
  readonly onFatalError?: (error: Error, origin: FatalErrorOrigin) => void | Promise<void>;
}

export interface ProcessErrorHandlers {
  unregister(): void;
}

const toError = (reason: unknown): Error => {
  if (reason instanceof Error) {
    return reason;
  }

  if (typeof reason === "string") {
    return new Error(reason);
  }

  try {
    return new Error(`Unhandled rejection: ${JSON.stringify(reason)}`);
  } catch {
    return new Error("Unhandled rejection with a non-serializable reason");
  }
};

export function registerProcessErrorHandlers(
  options: ProcessErrorHandlerOptions,
): ProcessErrorHandlers {
  let handlingFatalError = false;

  const handleFatalError = (error: Error, origin: FatalErrorOrigin): void => {
    if (handlingFatalError) {
      options.logger.error("A second fatal process error occurred", {
        origin,
        error,
      });
      process.exitCode = 1;
      return;
    }

    handlingFatalError = true;
    options.logger.error("Fatal process error", { origin, error });
    process.exitCode = 1;

    if (options.onFatalError === undefined) {
      return;
    }

    void Promise.resolve(options.onFatalError(error, origin)).catch((shutdownError: unknown) => {
      options.logger.error("Fatal error shutdown hook failed", {
        error: shutdownError,
      });
      process.exitCode = 1;
    });
  };

  const onUncaughtException = (error: Error): void => {
    handleFatalError(error, "uncaughtException");
  };

  const onUnhandledRejection = (reason: unknown): void => {
    handleFatalError(toError(reason), "unhandledRejection");
  };

  process.on("uncaughtException", onUncaughtException);
  process.on("unhandledRejection", onUnhandledRejection);

  return {
    unregister(): void {
      process.off("uncaughtException", onUncaughtException);
      process.off("unhandledRejection", onUnhandledRejection);
    },
  };
}
