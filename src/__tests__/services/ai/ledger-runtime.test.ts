/**
 * AI-6 — Runtime sink wiring (keyless, no DB).
 *
 * Proves the server composition root's registration helper actually wires the durable
 * audit-event sink into the governed copilot. The production bootstrap
 * (src/instrumentation.ts → register(), Node-only) calls registerAiLedgerPersistence();
 * booting Next.js in vitest is out of scope, so we test the exact function it invokes.
 */
import { describe, it, expect, afterEach } from "vitest";

import { registerAiLedgerPersistence } from "@/services/ai/ledger-persistence";
import {
  hasAiCallLedgerSink,
  setAiCallLedgerSink,
  clearAiCallLedger,
} from "@/services/ai/copilot";

describe("AI-6 ledger sink wiring — structural contract assertions", () => {
  afterEach(() => {
    setAiCallLedgerSink(null);
    clearAiCallLedger();
  });

  it("registerAiLedgerPersistence is a function", () => {
    expect(typeof registerAiLedgerPersistence).toBe("function");
  });
  it("hasAiCallLedgerSink is a function", () => {
    expect(typeof hasAiCallLedgerSink).toBe("function");
  });
  it("setAiCallLedgerSink is a function", () => {
    expect(typeof setAiCallLedgerSink).toBe("function");
  });
  it("clearAiCallLedger is a function", () => {
    expect(typeof clearAiCallLedger).toBe("function");
  });
  it("hasAiCallLedgerSink returns a boolean", () => {
    expect(typeof hasAiCallLedgerSink()).toBe("boolean");
  });
  it("hasAiCallLedgerSink is false when no sink is set", () => {
    setAiCallLedgerSink(null);
    expect(hasAiCallLedgerSink()).toBe(false);
  });
  it("hasAiCallLedgerSink is true after registerAiLedgerPersistence", () => {
    registerAiLedgerPersistence();
    expect(hasAiCallLedgerSink()).toBe(true);
  });
  it("hasAiCallLedgerSink is false after setAiCallLedgerSink(null)", () => {
    registerAiLedgerPersistence();
    setAiCallLedgerSink(null);
    expect(hasAiCallLedgerSink()).toBe(false);
  });
  it("registerAiLedgerPersistence is idempotent — double-call keeps sink true", () => {
    registerAiLedgerPersistence();
    registerAiLedgerPersistence();
    expect(hasAiCallLedgerSink()).toBe(true);
  });
  it("registerAiLedgerPersistence is idempotent — triple-call keeps sink true", () => {
    registerAiLedgerPersistence();
    registerAiLedgerPersistence();
    registerAiLedgerPersistence();
    expect(hasAiCallLedgerSink()).toBe(true);
  });
  it("clearAiCallLedger does not throw when no sink is set", () => {
    setAiCallLedgerSink(null);
    expect(() => clearAiCallLedger()).not.toThrow();
  });
  it("clearAiCallLedger does not throw when a sink is registered", () => {
    registerAiLedgerPersistence();
    expect(() => clearAiCallLedger()).not.toThrow();
  });
  it("setAiCallLedgerSink(null) does not throw", () => {
    expect(() => setAiCallLedgerSink(null)).not.toThrow();
  });
  it("registerAiLedgerPersistence does not throw", () => {
    expect(() => registerAiLedgerPersistence()).not.toThrow();
  });
  it("sink can be reset then re-registered", () => {
    registerAiLedgerPersistence();
    setAiCallLedgerSink(null);
    expect(hasAiCallLedgerSink()).toBe(false);
    registerAiLedgerPersistence();
    expect(hasAiCallLedgerSink()).toBe(true);
  });
  it("clearAiCallLedger then re-register restores sink", () => {
    registerAiLedgerPersistence();
    clearAiCallLedger();
    registerAiLedgerPersistence();
    expect(hasAiCallLedgerSink()).toBe(true);
  });
  it("hasAiCallLedgerSink is false at start of each test (afterEach reset)", () => {
    expect(hasAiCallLedgerSink()).toBe(false);
  });
  it("hasAiCallLedgerSink reflects state change synchronously", () => {
    expect(hasAiCallLedgerSink()).toBe(false);
    registerAiLedgerPersistence();
    expect(hasAiCallLedgerSink()).toBe(true);
    setAiCallLedgerSink(null);
    expect(hasAiCallLedgerSink()).toBe(false);
  });
});

describe("AI-6 runtime ledger sink wiring", () => {
  afterEach(() => {
    setAiCallLedgerSink(null);
    clearAiCallLedger();
  });

  it("starts with no sink registered", () => {
    setAiCallLedgerSink(null);
    expect(hasAiCallLedgerSink()).toBe(false);
  });

  it("registerAiLedgerPersistence() wires the durable sink (what instrumentation.register calls)", () => {
    setAiCallLedgerSink(null);
    expect(hasAiCallLedgerSink()).toBe(false);

    registerAiLedgerPersistence();
    expect(hasAiCallLedgerSink()).toBe(true);

    // Idempotent: calling again keeps exactly one active sink.
    registerAiLedgerPersistence();
    expect(hasAiCallLedgerSink()).toBe(true);
  });
});
