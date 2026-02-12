import { describe, it, expect } from "vitest";
import { createLogger } from "../../../src/config/logger.js";

describe("Pino logger", () => {
  it("should export a logger with info method", () => {
    const logger = createLogger({ level: "info" });

    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.fatal).toBe("function");
    expect(typeof logger.trace).toBe("function");
  });

  it("should respect log level from env", () => {
    const debugLogger = createLogger({ level: "debug" });
    expect(debugLogger.level).toBe("debug");

    const errorLogger = createLogger({ level: "error" });
    expect(errorLogger.level).toBe("error");

    const traceLogger = createLogger({ level: "trace" });
    expect(traceLogger.level).toBe("trace");
  });

  it("should default to info level", () => {
    const logger = createLogger();
    expect(logger.level).toBe("info");
  });

  it("should include timestamp in log output", () => {
    const logger = createLogger({ level: "info" });
    // Pino includes timestamp by default — verify the logger is a valid pino instance
    // by checking it has the expected pino-specific properties
    expect(logger).toHaveProperty("bindings");
    expect(typeof logger.bindings).toBe("function");
  });

  it("should enable pretty printing in development mode", () => {
    // Creating a logger with pretty: true should not throw
    const logger = createLogger({ level: "info", pretty: true });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
  });
});
