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
