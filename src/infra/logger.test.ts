import { describe, it, expect, vi } from "vitest";
import { createLogger } from "./logger";

describe("Structured logger", () => {
  it("creates a logger with correlation and request IDs", () => {
    const log = createLogger("corr-1", "req-1");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    log.info("test message", { key: "value" });

    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.correlationId).toBe("corr-1");
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.message).toBe("test message");
    expect(parsed.level).toBe("info");
    expect(parsed.context.key).toBe("value");
    expect(parsed.timestamp).toBeDefined();

    spy.mockRestore();
  });

  it("child logger inherits parent IDs", () => {
    const parent = createLogger("corr-parent");
    const child = parent.child({ requestId: "req-child" });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    child.info("child message");

    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.correlationId).toBe("corr-parent");
    expect(parsed.requestId).toBe("req-child");

    spy.mockRestore();
  });

  it("error level uses console.error", () => {
    const log = createLogger();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    log.error("fail");

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("warn level uses console.warn", () => {
    const log = createLogger();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    log.warn("caution");

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("omits empty context from output", () => {
    const log = createLogger();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    log.info("no context");

    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.context).toBeUndefined();

    spy.mockRestore();
  });
});
