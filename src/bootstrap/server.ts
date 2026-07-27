import { createServer } from "node:http";
import { loadConfig } from "../platform/config/index.js";
import { registerProcessErrorHandlers } from "../platform/observability/index.js";
import { createCompositionRoot } from "./composition-root.js";
import { createGracefulShutdown } from "./shutdown.js";

const loadLocalEnvironment = (): void => {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
};

async function main(): Promise<void> {
  loadLocalEnvironment();
  const config = loadConfig();
  const runtime = await createCompositionRoot(config);
  const server = createServer(runtime.app);
  const shutdown = createGracefulShutdown({
    server,
    timeoutMs: config.server.shutdownTimeoutMs,
    logger: runtime.logger,
    closeResources: runtime.close,
  });
  let shutdownStarted = false;
  const requestShutdown = (reason: string): Promise<void> => {
    shutdownStarted = true;
    return shutdown(reason);
  };
  const processErrors = registerProcessErrorHandlers({
    logger: runtime.logger,
    async onFatalError(_error, origin): Promise<void> {
      await requestShutdown(origin);
    },
  });
  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  const unregisterShutdownHandlers = (): void => {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
    signalHandlers.clear();
    processErrors.unregister();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = (): void => {
      void requestShutdown(signal)
        .catch((error: unknown) => {
          runtime.logger.error("Graceful shutdown failed", { error, signal });
          process.exitCode = 1;
        })
        .finally(unregisterShutdownHandlers);
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.server.port, config.server.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    unregisterShutdownHandlers();
    try {
      await runtime.close();
    } catch (closeError) {
      console.error("Application startup cleanup failed", closeError);
    }

    throw error;
  }

  if (shutdownStarted) {
    return;
  }

  runtime.logger.info("HTTP server started", {
    host: config.server.host,
    port: config.server.port,
    apiPrefix: config.server.apiPrefix,
    docsPath: config.docs.enabled ? config.docs.path : undefined,
  });
}

void main().catch((error: unknown) => {
  console.error("Application startup failed", error);
  process.exitCode = 1;
});
