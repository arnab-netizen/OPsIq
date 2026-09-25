import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyQboWebhookSignature, parseQboWebhookPayload } from "@/domain/quickbooks/qbo-webhook";

const VERIFIER = "test-verifier-token";

function sign(body: string, key = VERIFIER): string {
  return createHmac("sha256", key).update(body, "utf8").digest("base64");
}

describe("verifyQboWebhookSignature", () => {
  it("accepts a valid signature", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyQboWebhookSignature(body, sign(body), VERIFIER)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = sign(body);
    const tampered = JSON.stringify({ hello: "mallory" });
    expect(verifyQboWebhookSignature(tampered, signature, VERIFIER)).toBe(false);
  });

  it("rejects a signature computed with the wrong key", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyQboWebhookSignature(body, sign(body, "wrong-key"), VERIFIER)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyQboWebhookSignature("{}", null, VERIFIER)).toBe(false);
    expect(verifyQboWebhookSignature("{}", "", VERIFIER)).toBe(false);
  });

  it("rejects when the decoded signature length differs from the expected digest length", () => {
    const body = "{}";
    // Valid base64, but far too short to be a 32-byte SHA-256 digest.
    expect(verifyQboWebhookSignature(body, Buffer.from("short").toString("base64"), VERIFIER)).toBe(false);
  });

  it("rejects an empty verifier token", () => {
    const body = "{}";
    expect(verifyQboWebhookSignature(body, sign(body), "")).toBe(false);
  });
});

describe("parseQboWebhookPayload — CloudEvents format", () => {
  it("parses a valid single-event array", () => {
    const payload = [
      {
        specversion: "1.0",
        id: "evt-123",
        source: "https://quickbooks.api.intuit.com",
        type: "qbo.invoice.updated.v1",
        datacontenttype: "application/json",
        time: "2026-09-25T10:00:00.000Z",
        intuitentityid: "456",
        intuitaccountid: "789012345",
        data: {},
      },
    ];
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      dedupKey: "evt-123",
      realmId: "789012345",
      entity: "Invoice",
      entityId: "456",
      operation: "updated",
      occurredAt: "2026-09-25T10:00:00.000Z",
    });
  });

  it("handles multiple events across multiple realms in one delivery", () => {
    const payload = [
      { specversion: "1.0", id: "e1", type: "qbo.customer.created.v1", time: "2026-09-25T10:00:00.000Z", intuitentityid: "1", intuitaccountid: "111111111" },
      { specversion: "1.0", id: "e2", type: "qbo.bill.voided.v1", time: "2026-09-25T10:01:00.000Z", intuitentityid: "2", intuitaccountid: "222222222" },
    ];
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications.map((n) => n.realmId)).toEqual(["111111111", "222222222"]);
    expect(result.notifications[1].operation).toBe("voided");
  });

  it("drops notifications for an unrecognized entity name", () => {
    const payload = [
      { specversion: "1.0", id: "e1", type: "qbo.notarealentity.created.v1", time: "2026-09-25T10:00:00.000Z", intuitentityid: "1", intuitaccountid: "111111111" },
    ];
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(0);
  });

  it("drops notifications with an invalid realm id (no error leaked)", () => {
    const payload = [
      { specversion: "1.0", id: "e1", type: "qbo.customer.created.v1", time: "2026-09-25T10:00:00.000Z", intuitentityid: "1", intuitaccountid: "not-a-realm" },
    ];
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(0);
  });

  it("reports malformed for an array missing required CloudEvents fields", () => {
    const payload = [{ specversion: "1.0", id: "e1" }];
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(false);
  });
});

describe("parseQboWebhookPayload — legacy format", () => {
  it("parses a valid legacy notification", () => {
    const payload = {
      eventNotifications: [
        {
          realmId: "789012345",
          dataChangeEvent: {
            entities: [{ name: "Invoice", id: "456", operation: "Update", lastUpdated: "2026-09-25T10:00:00Z" }],
          },
        },
      ],
    };
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      realmId: "789012345",
      entity: "Invoice",
      entityId: "456",
      operation: "updated",
    });
    expect(result.notifications[0].dedupKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a stable dedupKey for identical legacy notifications and a different one for a different operation", () => {
    const base = {
      eventNotifications: [
        { realmId: "789012345", dataChangeEvent: { entities: [{ name: "Customer", id: "9", operation: "Create", lastUpdated: "2026-09-25T10:00:00Z" }] } },
      ],
    };
    const other = {
      eventNotifications: [
        { realmId: "789012345", dataChangeEvent: { entities: [{ name: "Customer", id: "9", operation: "Update", lastUpdated: "2026-09-25T10:00:00Z" }] } },
      ],
    };
    const r1 = parseQboWebhookPayload(base);
    const r2 = parseQboWebhookPayload(base);
    const r3 = parseQboWebhookPayload(other);
    if (!r1.ok || !r2.ok || !r3.ok) throw new Error("expected ok");
    expect(r1.notifications[0].dedupKey).toBe(r2.notifications[0].dedupKey);
    expect(r1.notifications[0].dedupKey).not.toBe(r3.notifications[0].dedupKey);
  });

  it("handles multiple entities across multiple notifications", () => {
    const payload = {
      eventNotifications: [
        { realmId: "111111111", dataChangeEvent: { entities: [{ name: "Customer", id: "1", operation: "Create", lastUpdated: "2026-09-25T10:00:00Z" }, { name: "Invoice", id: "2", operation: "Delete", lastUpdated: "2026-09-25T10:01:00Z" }] } },
        { realmId: "222222222", dataChangeEvent: { entities: [{ name: "Bill", id: "3", operation: "Merge", lastUpdated: "2026-09-25T10:02:00Z" }] } },
      ],
    };
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(3);
    expect(result.notifications.map((n) => n.operation)).toEqual(["created", "deleted", "merged"]);
  });

  it("drops an unrecognized entity but keeps siblings", () => {
    const payload = {
      eventNotifications: [
        { realmId: "111111111", dataChangeEvent: { entities: [{ name: "TaxAgency", id: "1", operation: "Create", lastUpdated: "2026-09-25T10:00:00Z" }, { name: "Customer", id: "2", operation: "Create", lastUpdated: "2026-09-25T10:00:00Z" }] } },
      ],
    };
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].entity).toBe("Customer");
  });

  it("drops a notification with an invalid realm id", () => {
    const payload = {
      eventNotifications: [
        { realmId: "abc", dataChangeEvent: { entities: [{ name: "Customer", id: "1", operation: "Create", lastUpdated: "2026-09-25T10:00:00Z" }] } },
      ],
    };
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(0);
  });

  it("reports malformed for a legacy payload missing dataChangeEvent", () => {
    const payload = { eventNotifications: [{ realmId: "789012345" }] };
    const result = parseQboWebhookPayload(payload);
    expect(result.ok).toBe(false);
  });
});

describe("parseQboWebhookPayload — malformed input", () => {
  it("rejects null", () => {
    expect(parseQboWebhookPayload(null).ok).toBe(false);
  });

  it("rejects a string", () => {
    expect(parseQboWebhookPayload("not json").ok).toBe(false);
  });

  it("rejects an object that matches neither envelope", () => {
    expect(parseQboWebhookPayload({ foo: "bar" }).ok).toBe(false);
  });

  it("rejects an empty array", () => {
    expect(parseQboWebhookPayload([]).ok).toBe(false);
  });
});
