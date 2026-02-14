import pino from "pino";

export interface LoggerOptions {
  level?: string;
  pretty?: boolean;
}

/**
 * Create a configured Pino logger instance.
 * Uses pino-pretty transport in development mode for human-readable output.
 */
export function createLogger(options?: LoggerOptions): pino.Logger {
  const level = options?.level ?? "info";
  const pretty = options?.pretty ?? false;

  if (pretty) {
    return pino({
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      },
    });
  }

  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
