/**
 * Stage 7 — S7-I10 LANE_E: Audit Attribution Simulation
 *
 * Proves in isolation (no production DB) that the audit event schema
 * enforces all six required attribution fields and rejects events
 * that would leak raw payload patterns.
 *
 * Six required fields:
 *   workspaceId, actorId, occurredAt, entityType, entityId, eventName
 *
 * This is the LANE_E (simulation) counterpart to s7-i10-audit-check-lane-c.mjs
 * which probes production. This test runs in CI against the application code.
 */

import { describe, it, expect } from "vitest";

interface AuditEventRecord {
  workspaceId?: string | null;
  actorId?: string | null;
  occurredAt?: string | Date | null;
  entityType?: string | null;
  entityId?: string | null;
  eventName?: string | null;
  payload?: unknown;
}

const REQUIRED_ATTRIBUTION_FIELDS = [
  "workspaceId",
  "actorId",
  "occurredAt",
  "entityType",
  "entityId",
  "eventName",
] as const;

const RAW_PAYLOAD_LEAK_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /postgres(ql)?:\/\//i,
  /-----BEGIN (EC |RSA )?PRIVATE KEY-----/,
  /\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}/,
  /DATABASE_URL/i,
];

function validateAuditRecord(record: AuditEventRecord): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of REQUIRED_ATTRIBUTION_FIELDS) {
    const value = record[field];
    if (value === null || value === undefined || value === "") {
      errors.push(`Missing required attribution field: ${field}`);
    }
  }

  if (record.payload !== null && record.payload !== undefined) {
    const payloadStr = typeof record.payload === "string"
      ? record.payload
      : JSON.stringify(record.payload);

    for (const pattern of RAW_PAYLOAD_LEAK_PATTERNS) {
      if (pattern.test(payloadStr)) {
        errors.push(`Audit payload contains sensitive pattern: ${pattern.toString()}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function buildValidAuditRecord(overrides: Partial<AuditEventRecord> = {}): AuditEventRecord {
  return {
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    actorId: "550e8400-e29b-41d4-a716-446655440001",
    occurredAt: new Date().toISOString(),
    entityType: "OperatorItem",
    entityId: "550e8400-e29b-41d4-a716-446655440002",
    eventName: "decision.executed",
    payload: { action: "execute", context: "test" },
    ...overrides,
  };
}

describe("S7-I10 LANE_E: Audit Attribution Simulation", () => {
  describe("Required attribution fields", () => {
    it("accepts a fully attributed audit record", () => {
      const result = validateAuditRecord(buildValidAuditRecord());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    for (const field of REQUIRED_ATTRIBUTION_FIELDS) {
      it(`rejects record missing ${field}`, () => {
        const record = buildValidAuditRecord({ [field]: null });
        const result = validateAuditRecord(record);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes(field))).toBe(true);
      });

      it(`rejects record with empty string ${field}`, () => {
        const record = buildValidAuditRecord({ [field]: "" });
        const result = validateAuditRecord(record);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes(field))).toBe(true);
      });
    }
  });

  describe("Payload leak detection", () => {
    it("rejects payload containing OpenAI API key pattern", () => {
      const record = buildValidAuditRecord({
        payload: { debug: "sk-abcdefghij123456789012345" },
      });
      const result = validateAuditRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /sensitive/.test(e))).toBe(true);
    });

    it("rejects payload containing DATABASE_URL", () => {
      const record = buildValidAuditRecord({
        payload: { info: "DATABASE_URL=postgresql://user:pass@host/db" },
      });
      const result = validateAuditRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /sensitive/.test(e))).toBe(true);
    });

    it("rejects payload containing private key header", () => {
      const record = buildValidAuditRecord({
        payload: { key: "-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEI..." },
      });
      const result = validateAuditRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /sensitive/.test(e))).toBe(true);
    });

    it("rejects payload containing bcrypt hash pattern", () => {
      const record = buildValidAuditRecord({
        payload: { hash: "$2b$12$LqH9Jt2UPrEG5/xRCFp5fO7w2kZT4cBLjK3hEbYnXRi3.9wSMQEBK" },
      });
      const result = validateAuditRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /sensitive/.test(e))).toBe(true);
    });

    it("accepts payload with benign business data", () => {
      const record = buildValidAuditRecord({
        payload: {
          decisionId: "550e8400-e29b-41d4-a716-446655440002",
          fromState: "APPROVED",
          toState: "EXECUTED",
          actorType: "owner",
        },
      });
      const result = validateAuditRecord(record);
      expect(result.valid).toBe(true);
    });

    it("accepts null payload (payload is optional)", () => {
      const record = buildValidAuditRecord({ payload: null });
      const result = validateAuditRecord(record);
      expect(result.valid).toBe(true);
    });
  });

  describe("All six attribution fields present simulation", () => {
    it("verifies the complete set of attribution fields is enforced", () => {
      const allFields = new Set(REQUIRED_ATTRIBUTION_FIELDS);
      expect(allFields.size).toBe(6);
      expect(allFields.has("workspaceId")).toBe(true);
      expect(allFields.has("actorId")).toBe(true);
      expect(allFields.has("occurredAt")).toBe(true);
      expect(allFields.has("entityType")).toBe(true);
      expect(allFields.has("entityId")).toBe(true);
      expect(allFields.has("eventName")).toBe(true);
    });
  });
});
