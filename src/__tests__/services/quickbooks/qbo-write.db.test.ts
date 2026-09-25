/**
 * Real-DB tests for the governed QuickBooks write path
 * (qbo-write.service + qbo-write-actions.service).
 *
 * Everything is real (Postgres, ledger, mirror, audit, validation) except the
 * QuickBooks HTTP client, which is a deterministic in-memory fake that models
 * QBO's requestid de-duplication and SyncToken concurrency.
 * Run only via /tmp/claude-0/vt.sh --db (local disposable Postgres).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { QboApiError, type QboClient, type QboEntityBody } from "@/domain/quickbooks/qbo-contracts";
import type { QboEntityName } from "@/domain/quickbooks/qbo-entities";
import { executeGovernedQboWrite, deriveProviderRequestId } from "@/services/quickbooks/qbo-write.service";
import {
  pushVendorToQuickBooks,
  pushPurchaseOrderToQuickBooks,
  recordBillForPurchaseOrder,
  inactivatePartyInQuickBooks,
} from "@/services/quickbooks/qbo-write-actions.service";

const actorId = randomUUID();
const REALM = "9130350000000001";

/** In-memory QBO: requestid dedup, SyncToken increments, stale-token 5010. */
class FakeQbo {
  store = new Map<string, QboEntityBody>();
  byRequestId = new Map<string, QboEntityBody>();
  calls: Array<{ op: string; entity: string; requestId?: string }> = [];
  nextId = 100;
  failNextWriteAmbiguous = false;
  failNextWriteAmbiguousAfterCommit = false;
  /** Thrown before QBO processes the request (e.g. an expired token) — nothing is committed. */
  failNextWriteWith: QboApiError | null = null;

  key(entity: string, id: string) { return `${entity}:${id}`; }
  seed(entity: QboEntityName, body: QboEntityBody) { this.store.set(this.key(entity, body.Id!), body); }

  private commit(requestId: string, fn: () => QboEntityBody): QboEntityBody {
    if (this.failNextWriteWith) {
      const e = this.failNextWriteWith;
      this.failNextWriteWith = null;
      throw e;
    }
    const prior = this.byRequestId.get(requestId);
    if (prior) return prior; // QBO requestid de-duplication
    if (this.failNextWriteAmbiguous) {
      this.failNextWriteAmbiguous = false;
      throw new QboApiError({ kind: "TIMEOUT", message: "timeout", ambiguous: true });
    }
    const out = fn();
    this.byRequestId.set(requestId, out);
    if (this.failNextWriteAmbiguousAfterCommit) {
      this.failNextWriteAmbiguousAfterCommit = false;
      throw new QboApiError({ kind: "TIMEOUT", message: "lost response", ambiguous: true });
    }
    return out;
  }

  client(): QboClient {
    const bump = (e: string, ref: { Id: string; SyncToken: string }, patch: Record<string, unknown>) => {
      const cur = this.store.get(this.key(e, ref.Id));
      if (!cur) throw new QboApiError({ kind: "NOT_FOUND", message: "Object Not Found", httpStatus: 400 });
      if (cur.SyncToken !== ref.SyncToken) {
        throw new QboApiError({ kind: "STALE_OBJECT", message: "Stale Object Error", httpStatus: 400 });
      }
      const next = { ...cur, ...patch, SyncToken: String(Number(cur.SyncToken) + 1), MetaData: { LastUpdatedTime: new Date().toISOString() } };
      this.store.set(this.key(e, ref.Id), next);
      return next;
    };
    return {
      realmId: REALM,
      environment: "sandbox",
      companyInfo: async () => ({}),
      preferences: async () => ({}),
      query: async () => { throw new Error("unused"); },
      cdc: async () => { throw new Error("unused"); },
      report: async () => { throw new Error("unused"); },
      read: async (entity, id) => {
        this.calls.push({ op: "read", entity });
        const cur = this.store.get(this.key(entity, id));
        if (!cur) throw new QboApiError({ kind: "NOT_FOUND", message: "Object Not Found", httpStatus: 400 });
        return cur;
      },
      create: async (entity, body, { requestId }) => {
        this.calls.push({ op: "create", entity, requestId });
        return this.commit(requestId, () => {
          const created = { ...body, Id: String(this.nextId++), SyncToken: "0", MetaData: { LastUpdatedTime: new Date().toISOString() } };
          this.store.set(this.key(entity, created.Id!), created);
          return created;
        });
      },
      update: async (entity, body, { requestId }) => {
        this.calls.push({ op: "update", entity, requestId });
        return this.commit(requestId, () => { const { Id, SyncToken, ...rest } = body; return bump(entity, { Id, SyncToken }, rest); });
      },
      delete: async (entity, ref, { requestId }) => {
        this.calls.push({ op: "delete", entity, requestId });
        return this.commit(requestId, () => bump(entity, ref, { status: "Deleted" }));
      },
      void: async (entity, ref, { requestId }) => {
        this.calls.push({ op: "void", entity, requestId });
        return this.commit(requestId, () => bump(entity, ref, {}));
      },
      inactivate: async (entity, ref, { requestId }) => {
        this.calls.push({ op: "inactivate", entity, requestId });
        return this.commit(requestId, () => bump(entity, ref, { Active: false }));
      },
    };
  }
}

let workspaceId: string;
let businessId: string;
let connectorId: string;
let fake: FakeQbo;
const deps = () => ({ createClient: async () => fake.client() });

async function mirror(entityType: string, remoteId: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  await db.ownerConnectorRecord.create({
    data: {
      workspaceId, businessId, connectorId, provider: "QUICKBOOKS", externalAccount: REALM,
      entityType, remoteId, remoteSyncToken: (data.SyncToken as string) ?? null, remoteStatus: "ACTIVE",
      data: data as object, ...extra,
    },
  });
}

async function seedWorkspace() {
  workspaceId = randomUUID();
  businessId = randomUUID();
  await db.ownerBusiness.create({
    data: { id: businessId, workspaceId, name: "Write Test Co", businessType: "generic_local_service", currency: "USD", createdBy: actorId },
  });
  const c = await db.ownerConnector.create({
    data: { workspaceId, businessId, provider: "QUICKBOOKS", status: "ACTIVE", registeredBy: actorId, externalAccountId: REALM, environment: "sandbox" },
  });
  connectorId = c.id;
  await mirror("Preferences", "preferences", { CurrencyPrefs: { HomeCurrency: { value: "USD" }, MultiCurrencyEnabled: false } });
  await mirror("Account", "60", { Id: "60", Name: "Supplies", AccountType: "Expense", Active: true, SyncToken: "0" });
  await mirror("Account", "61", { Id: "61", Name: "Checking", AccountType: "Bank", Active: true, SyncToken: "0" });
  await mirror("Account", "62", { Id: "62", Name: "Old Expense", AccountType: "Expense", Active: false, SyncToken: "3" }, { remoteStatus: "INACTIVE" });
}

async function cleanupWorkspace() {
  await db.ownerConnectorWrite.deleteMany({ where: { workspaceId } });
  await db.ownerConnectorRecord.deleteMany({ where: { workspaceId } });
  await db.ownerConnector.deleteMany({ where: { workspaceId } });
  await db.purchaseOrder.deleteMany({ where: { workspaceId } });
  await db.vendorRecord.deleteMany({ where: { workspaceId } });
  await db.ownerBusiness.deleteMany({ where: { workspaceId } });
  await db.auditEvent.deleteMany({ where: { workspaceId } });
}

async function seedVendor(approvalStatus = "APPROVED", name = "Acme Supplies") {
  const id = randomUUID();
  await db.vendorRecord.create({ data: { id, workspaceId, businessId, name, approvalStatus } });
  return id;
}

async function seedPo(vendorId: string | null, over: Record<string, unknown> = {}) {
  const po = await db.purchaseOrder.create({
    data: {
      workspaceId, businessId, poNumber: `PO-${randomUUID().slice(0, 6)}`, vendorId, status: "DELIVERED",
      lineItems: [{ description: "Paper", qty: 3, unitPrice: 10.1 }, { description: "Ink", qty: 1, unitPrice: 19.7 }],
      totalAmount: 50, currency: "USD", createdBy: actorId, deliveredAt: new Date("2026-09-01T10:00:00Z"), ...over,
    },
  });
  return po.id;
}

beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.user.upsert({
    where: { id: actorId }, update: {},
    create: { id: actorId, email: `qbo-write-${actorId}@example.com`, name: "QBO Write Test", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] governed QuickBooks writes", () => {
  beforeEach(async () => {
    if (workspaceId) await cleanupWorkspace();
    fake = new FakeQbo();
    await seedWorkspace();
  });
  afterAll(async () => { if (workspaceId) await cleanupWorkspace(); });

  it("vendor push creates once, links provenance, and a repeat is UNCHANGED (no second create)", async () => {
    const vendorId = await seedVendor();
    const first = await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    expect(first.action).toBe("CREATED");
    const again = await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    expect(again.action).toBe("UNCHANGED");
    expect(fake.calls.filter((c) => c.op === "create")).toHaveLength(1);
    const link = await db.ownerConnectorRecord.findFirst({ where: { connectorId, entityType: "Vendor", opsiqEntityId: vendorId } });
    expect(link?.remoteId).toBe(first.remoteId);
    const ledger = await db.ownerConnectorWrite.findMany({ where: { workspaceId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe("COMMITTED");
    const audits = await db.auditEvent.findMany({ where: { workspaceId, eventName: { startsWith: "quickbooks.write" } } });
    expect(audits.map((a: { eventName: string }) => a.eventName).sort()).toEqual(["quickbooks.write_committed", "quickbooks.write_requested"]);
  });

  it("rejects a vendor that is not approved and never calls QuickBooks", async () => {
    const vendorId = await seedVendor("PENDING_REVIEW");
    await expect(pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() })).rejects.toMatchObject({ name: "PolicyViolationError" });
    expect(fake.calls).toHaveLength(0);
  });

  it("links an existing unlinked QBO vendor with the same DisplayName instead of duplicating it", async () => {
    await mirror("Vendor", "77", { Id: "77", DisplayName: "Acme Supplies", Active: true, SyncToken: "2" });
    const vendorId = await seedVendor();
    const r = await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    expect(r).toMatchObject({ action: "LINKED", remoteId: "77" });
    expect(fake.calls).toHaveLength(0);
  });

  it("ambiguous timeout AFTER QBO committed: retry resends the same requestid and records exactly one bill", async () => {
    const vendorId = await seedVendor();
    await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    const poId = await seedPo(vendorId);
    fake.failNextWriteAmbiguousAfterCommit = true;
    await expect(
      recordBillForPurchaseOrder({ workspaceId, actorId, purchaseOrderId: poId, expenseAccountId: "60", confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "ServiceUnavailableError" });
    const pending = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: `po-bill:${poId}` } });
    expect(pending?.status).toBe("AMBIGUOUS");

    const retry = await recordBillForPurchaseOrder({ workspaceId, actorId, purchaseOrderId: poId, expenseAccountId: "60", confirm: true, deps: deps() });
    expect(retry.action).toBe("CREATED");
    const billCreates = fake.calls.filter((c) => c.op === "create" && c.entity === "Bill");
    expect(billCreates).toHaveLength(2);
    expect(new Set(billCreates.map((c) => c.requestId)).size).toBe(1);
    expect(billCreates[0].requestId).toBe(deriveProviderRequestId(workspaceId, `po-bill:${poId}`));
    expect(Array.from(fake.store.keys()).filter((k) => k.startsWith("Bill:"))).toHaveLength(1);
    const done = await db.ownerConnectorWrite.findFirst({ where: { id: pending!.id } });
    expect(done?.status).toBe("COMMITTED");
    expect(done?.attempts).toBe(2);

    // Third call: replay from the link, no QBO call at all.
    const before = fake.calls.length;
    const third = await recordBillForPurchaseOrder({ workspaceId, actorId, purchaseOrderId: poId, expenseAccountId: "60", confirm: true, deps: deps() });
    expect(third.replayed).toBe(true);
    expect(fake.calls.length).toBe(before);
  });

  it("bill body is built from the governed PO: exact cents, expense account, vendor ref", async () => {
    const vendorId = await seedVendor();
    const v = await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    const poId = await seedPo(vendorId);
    const r = await recordBillForPurchaseOrder({ workspaceId, actorId, purchaseOrderId: poId, expenseAccountId: "60", dueDate: "2026-10-01", confirm: true, deps: deps() });
    const bill = fake.store.get(`Bill:${r.remoteId}`)!;
    expect(bill.VendorRef).toEqual({ value: v.remoteId });
    expect(bill.DueDate).toBe("2026-10-01");
    expect(bill.TxnDate).toBe("2026-09-01");
    const lines = bill.Line as Array<{ Amount: number; AccountBasedExpenseLineDetail: { AccountRef: { value: string } } }>;
    expect(lines.map((l) => l.Amount)).toEqual([30.3, 19.7]);
    expect(lines.every((l) => l.AccountBasedExpenseLineDetail.AccountRef.value === "60")).toBe(true);
  });

  it("rejects unsafe accounting instead of synthesizing facts", async () => {
    const vendorId = await seedVendor();
    await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    const call = (poId: string, acct = "60") =>
      recordBillForPurchaseOrder({ workspaceId, actorId, purchaseOrderId: poId, expenseAccountId: acct, confirm: true, deps: deps() });

    await expect(call(await seedPo(vendorId, { lineItems: [{ description: "No price", qty: 2 }], totalAmount: null }))).rejects.toMatchObject({ name: "ValidationError" });
    await expect(call(await seedPo(vendorId, { totalAmount: 51 }))).rejects.toThrow(/does not equal the sum/);
    await expect(call(await seedPo(vendorId, { currency: "EUR" }))).rejects.toThrow(/home currency/);
    await expect(call(await seedPo(vendorId), "61")).rejects.toThrow(/expense/); // bank account, not expense
    await expect(call(await seedPo(vendorId), "62")).rejects.toThrow(/expense/); // inactive account
    await expect(call(await seedPo(null))).rejects.toThrow(/no OpsIQ vendor/);
    await expect(call(await seedPo(await seedVendor("APPROVED", "Unlinked Vendor")))).rejects.toThrow(/not linked/);
    await expect(call(await seedPo(vendorId, { status: "APPROVED" }))).rejects.toMatchObject({ name: "PolicyViolationError" });
    expect(fake.calls.filter((c) => c.entity === "Bill")).toHaveLength(0);
  });

  it("requires explicit confirmation for material writes", async () => {
    const vendorId = await seedVendor();
    await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    const poId = await seedPo(vendorId);
    await expect(
      recordBillForPurchaseOrder({ workspaceId, actorId, purchaseOrderId: poId, expenseAccountId: "60", confirm: false, deps: deps() }),
    ).rejects.toMatchObject({ name: "PolicyViolationError" });
    await expect(
      inactivatePartyInQuickBooks({ workspaceId, actorId, kind: "vendor", recordId: vendorId, confirm: false, deps: deps() }),
    ).rejects.toMatchObject({ name: "PolicyViolationError" });
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: "je-test-0001", entity: "JournalEntry", operation: "create", body: { Line: [] }, deps: deps() }),
    ).rejects.toMatchObject({ name: "PolicyViolationError" });
  });

  it("entity semantics: name-list delete and Bill void are refused before any QBO call", async () => {
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: "vendor-del-0001", entity: "Vendor", operation: "delete", remoteId: "1", confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "PolicyViolationError" });
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: "bill-void-0001", entity: "Bill", operation: "void", remoteId: "1", confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "PolicyViolationError" });
    expect(fake.calls).toHaveLength(0);
  });

  it("JournalEntry must balance: an unbalanced entry is rejected and the ledger records FAILED", async () => {
    const body = {
      Line: [
        { DetailType: "JournalEntryLineDetail", Amount: 100, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "60" } } },
        { DetailType: "JournalEntryLineDetail", Amount: 99.99, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "61" } } },
      ],
    };
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: "je-unbalanced-1", entity: "JournalEntry", operation: "create", body, confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(fake.calls).toHaveLength(0);
    const row = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: "je-unbalanced-1" } });
    expect(row?.status).toBe("FAILED");
    // Same key again → same stored failure, still no QBO call.
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: "je-unbalanced-1", entity: "JournalEntry", operation: "create", body, confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(fake.calls).toHaveLength(0);
  });

  it("a FAILED (never committed) key can be retried after correction, under a NEW requestid", async () => {
    const line = (amt: number, type: "Debit" | "Credit", acct: string) => ({
      DetailType: "JournalEntryLineDetail", Amount: amt, JournalEntryLineDetail: { PostingType: type, AccountRef: { value: acct } },
    });
    const key = "je-correctable-1";
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: key, entity: "JournalEntry", operation: "create", body: { Line: [line(100, "Debit", "60"), line(90, "Credit", "61")] }, confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "ValidationError" });
    const failed = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } });
    expect(failed?.status).toBe("FAILED");

    const ok = await executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: key, entity: "JournalEntry", operation: "create", body: { Line: [line(100, "Debit", "60"), line(100, "Credit", "61")] }, confirm: true, deps: deps() });
    const row = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } });
    expect(row?.status).toBe("COMMITTED");
    expect(row?.remoteId).toBe(ok.remoteId);
    expect(row?.providerRequestId).not.toBe(failed?.providerRequestId);
    expect(fake.calls.filter((c) => c.entity === "JournalEntry" && c.op === "create")).toHaveLength(1);
    // Committed now: the same key replays, and a different payload is refused.
    expect((await executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: key, entity: "JournalEntry", operation: "create", body: { Line: [line(100, "Debit", "60"), line(100, "Credit", "61")] }, confirm: true, deps: deps() })).replayed).toBe(true);
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: key, entity: "JournalEntry", operation: "create", body: { Line: [line(5, "Debit", "60"), line(5, "Credit", "61")] }, confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "ConflictError" });
  });

  it("an AMBIGUOUS key refuses a different payload (it may already be committed under its requestid)", async () => {
    const vendorId = await seedVendor();
    fake.failNextWriteAmbiguous = true;
    await expect(pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() })).rejects.toMatchObject({ name: "ServiceUnavailableError" });
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: `vendor-create:${vendorId}`, entity: "Vendor", operation: "create", body: { DisplayName: "Other" }, deps: deps() }),
    ).rejects.toMatchObject({ name: "ConflictError" });
    // Same request resolves normally.
    const r = await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    expect(r.action).toBe("CREATED");
  });

  it("AMBIGUOUS → FAILED → retry: the requestid stays pinned, so a commit QBO already holds is never duplicated", async () => {
    const line = (type: "Debit" | "Credit", acct: string) => ({
      DetailType: "JournalEntryLineDetail", Amount: 40, JournalEntryLineDetail: { PostingType: type, AccountRef: { value: acct } },
    });
    const key = "je-ambiguous-then-failed-1";
    const write = () =>
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: key, entity: "JournalEntry", operation: "create", body: { Line: [line("Debit", "60"), line("Credit", "61")] }, confirm: true, deps: deps() });

    // 1) QBO commits, but the response is lost.
    fake.failNextWriteAmbiguousAfterCommit = true;
    await expect(write()).rejects.toMatchObject({ name: "ServiceUnavailableError" });
    const ambiguous = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } });
    expect(ambiguous?.status).toBe("AMBIGUOUS");
    expect(ambiguous?.lastAmbiguousAt).not.toBeNull();

    // 2) The retry is rejected before QBO processes it (definitive, non-retryable) → FAILED.
    fake.failNextWriteWith = new QboApiError({ kind: "AUTH", message: "token expired", httpStatus: 401 });
    await expect(write()).rejects.toBeTruthy();
    const failed = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } });
    expect(failed?.status).toBe("FAILED");
    expect(failed?.lastAmbiguousAt).not.toBeNull();

    // 3) Retry after reconnect: reopened under the SAME requestid → QBO dedup returns the first commit.
    const ok = await write();
    const creates = fake.calls.filter((c) => c.op === "create" && c.entity === "JournalEntry");
    expect(new Set(creates.map((c) => c.requestId))).toEqual(new Set([ambiguous!.providerRequestId]));
    expect(Array.from(fake.store.keys()).filter((k) => k.startsWith("JournalEntry:"))).toHaveLength(1);
    const done = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } });
    expect(done?.status).toBe("COMMITTED");
    expect(done?.providerRequestId).toBe(ambiguous!.providerRequestId);
    expect(done?.remoteId).toBe(ok.remoteId);
    const requested = await db.auditEvent.findMany({ where: { workspaceId, eventName: "quickbooks.write_requested", entityId: done!.id }, orderBy: { occurredAt: "asc" } });
    expect((requested.at(-1)?.payload as { requestIdPinned?: boolean }).requestIdPinned).toBe(true);
  });

  it("F29: AMBIGUOUS → FAILED → CHANGED payload is refused; the pinned requestid, payload hash and marker are untouched", async () => {
    const line = (amt: number, type: "Debit" | "Credit", acct: string) => ({
      DetailType: "JournalEntryLineDetail", Amount: amt, JournalEntryLineDetail: { PostingType: type, AccountRef: { value: acct } },
    });
    const key = "je-ambiguous-then-changed-1";
    const write = (amt: number) =>
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: key, entity: "JournalEntry", operation: "create", body: { Line: [line(amt, "Debit", "60"), line(amt, "Credit", "61")] }, confirm: true, deps: deps() });

    // Payload A: QBO commits, response lost → AMBIGUOUS.
    fake.failNextWriteAmbiguousAfterCommit = true;
    await expect(write(40)).rejects.toMatchObject({ name: "ServiceUnavailableError" });
    const ambiguous = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } });
    expect(ambiguous?.status).toBe("AMBIGUOUS");
    // Same payload A retried, rejected before QBO processes it → FAILED.
    fake.failNextWriteWith = new QboApiError({ kind: "AUTH", message: "token expired", httpStatus: 401 });
    await expect(write(40)).rejects.toBeTruthy();
    const failed = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } });
    expect(failed?.status).toBe("FAILED");

    // Payload B (owner changed the data) under the same logical key.
    const callsBefore = fake.calls.length;
    await expect(write(55)).rejects.toMatchObject({ name: "ConflictError" });

    // Rejected before any QBO call — no read, no create, nothing sent with payload B.
    expect(fake.calls.length).toBe(callsBefore);
    const after = await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } });
    expect(after?.status).toBe("FAILED");
    expect(after?.providerRequestId).toBe(ambiguous!.providerRequestId);
    expect(after?.payloadHash).toBe(ambiguous!.payloadHash);
    expect(after?.lastAmbiguousAt).not.toBeNull();
    expect(after?.attempts).toBe(failed!.attempts);
    // Only payload A's single commit exists remotely; no second logical transaction.
    const jes = Array.from(fake.store.entries()).filter(([k]) => k.startsWith("JournalEntry:"));
    expect(jes).toHaveLength(1);
    expect((jes[0][1].Line as Array<{ Amount: number }>).map((l) => l.Amount)).toEqual([40, 40]);
    expect(await db.ownerConnectorWrite.count({ where: { workspaceId, idempotencyKey: key } })).toBe(1);

    // The original intent still resolves through the pinned requestid.
    const ok = await write(40);
    expect((await db.ownerConnectorWrite.findFirst({ where: { workspaceId, idempotencyKey: key } }))?.status).toBe("COMMITTED");
    expect(ok.remoteId).toBe(jes[0][1].Id);
    expect(Array.from(fake.store.keys()).filter((k) => k.startsWith("JournalEntry:"))).toHaveLength(1);
  });

  it("reusing an idempotency key with a different payload is rejected", async () => {
    const vendorId = await seedVendor();
    await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    const poId = await seedPo(vendorId);
    await pushPurchaseOrderToQuickBooks({ workspaceId, actorId, purchaseOrderId: poId, expenseAccountId: "60", confirm: true, deps: deps() });
    // Direct engine call reusing the product key with another body.
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: `po-push:${poId}`, entity: "PurchaseOrder", operation: "create", body: { DocNumber: "X" }, confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "ConflictError" });
  });

  it("concurrent identical submissions create exactly one remote record", async () => {
    const vendorId = await seedVendor();
    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5].map(() => pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() })),
    );
    expect(fake.calls.filter((c) => c.op === "create")).toHaveLength(1);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as Error).name).toBe("DuplicateSubmissionError");
    }
    expect(Array.from(fake.store.keys()).filter((k) => k.startsWith("Vendor:"))).toHaveLength(1);
  });

  it("SyncToken: never overwrites a field changed in QuickBooks; unrelated remote change is applied with the fresh token", async () => {
    await mirror("Vendor", "88", { Id: "88", DisplayName: "Old Name", Active: true, SyncToken: "1", Notes: "a" }, { opsiqEntityType: "VendorRecord" });
    // Remote changed DisplayName since our last sync → our DisplayName update must CONFLICT.
    fake.seed("Vendor", { Id: "88", DisplayName: "Renamed In QBO", Active: true, SyncToken: "2", Notes: "a" });
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: "vendor-upd-conflict-1", entity: "Vendor", operation: "update", remoteId: "88", body: { DisplayName: "OpsIQ Name" }, deps: deps() }),
    ).rejects.toMatchObject({ name: "ConflictError" });
    expect(fake.calls.filter((c) => c.op === "update")).toHaveLength(0);
    expect((await db.ownerConnectorWrite.findFirst({ where: { idempotencyKey: "vendor-upd-conflict-1", workspaceId } }))?.status).toBe("CONFLICT");

    // Remote changed only Notes → our DisplayName update is safe with the CURRENT SyncToken.
    fake.seed("Vendor", { Id: "88", DisplayName: "Old Name", Active: true, SyncToken: "5", Notes: "changed remotely" });
    const r = await executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: "vendor-upd-safe-1", entity: "Vendor", operation: "update", remoteId: "88", body: { DisplayName: "OpsIQ Name" }, deps: deps() });
    expect(r.remoteSyncToken).toBe("6");
    expect(fake.store.get("Vendor:88")).toMatchObject({ DisplayName: "OpsIQ Name", Notes: "changed remotely" });
  });

  it("destructive op on a record changed in QuickBooks since last sync stops with CONFLICT", async () => {
    await mirror("Invoice", "501", { Id: "501", TotalAmt: 10, SyncToken: "0" });
    fake.seed("Invoice", { Id: "501", TotalAmt: 12, SyncToken: "1" });
    await expect(
      executeGovernedQboWrite({ workspaceId, actorId, idempotencyKey: "inv-void-0001", entity: "Invoice", operation: "void", remoteId: "501", confirm: true, deps: deps() }),
    ).rejects.toMatchObject({ name: "ConflictError" });
    expect(fake.calls.filter((c) => c.op === "void")).toHaveLength(0);
  });

  it("inactivate marks the mirror INACTIVE and never deletes the vendor", async () => {
    const vendorId = await seedVendor();
    const v = await pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() });
    const r = await inactivatePartyInQuickBooks({ workspaceId, actorId, kind: "vendor", recordId: vendorId, confirm: true, deps: deps() });
    expect(r.action).toBe("INACTIVATED");
    expect(fake.store.get(`Vendor:${v.remoteId}`)).toMatchObject({ Active: false });
    const rec = await db.ownerConnectorRecord.findFirst({ where: { connectorId, entityType: "Vendor", remoteId: v.remoteId } });
    expect(rec?.remoteStatus).toBe("INACTIVE");
    expect(fake.calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("business isolation: records of another business in the SAME workspace are refused (connector is bound to one business)", async () => {
    const otherBusinessId = randomUUID();
    await db.ownerBusiness.create({
      data: { id: otherBusinessId, workspaceId, name: "Other Co", businessType: "generic_local_service", currency: "USD", createdBy: actorId },
    });
    const vendorId = randomUUID();
    await db.vendorRecord.create({ data: { id: vendorId, workspaceId, businessId: otherBusinessId, name: "Other Vendor", approvalStatus: "APPROVED" } });
    await expect(pushVendorToQuickBooks({ workspaceId, actorId, vendorId, deps: deps() })).rejects.toThrow(/different business/);
    const po = await db.purchaseOrder.create({
      data: { workspaceId, businessId: otherBusinessId, poNumber: "PO-OTHER-1", vendorId, status: "DELIVERED", lineItems: [{ description: "x", qty: 1, unitPrice: 5 }], totalAmount: 5, currency: "USD", createdBy: actorId },
    });
    await expect(
      recordBillForPurchaseOrder({ workspaceId, actorId, purchaseOrderId: po.id, expenseAccountId: "60", confirm: true, deps: deps() }),
    ).rejects.toThrow(/different business/);
    await expect(
      inactivatePartyInQuickBooks({ workspaceId, actorId, kind: "vendor", recordId: vendorId, confirm: true, deps: deps() }),
    ).rejects.toThrow(/different business/);
    expect(fake.calls).toHaveLength(0);
  });

  it("workspace isolation: another workspace cannot write through this connector or reach its records", async () => {
    const vendorId = await seedVendor();
    const otherWs = randomUUID();
    await expect(pushVendorToQuickBooks({ workspaceId: otherWs, actorId, vendorId, deps: deps() })).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(
      executeGovernedQboWrite({ workspaceId: otherWs, actorId, idempotencyKey: "cross-ws-0001", entity: "Vendor", operation: "create", body: { DisplayName: "X" }, deps: deps() }),
    ).rejects.toMatchObject({ name: "ConflictError" });
    expect(fake.calls).toHaveLength(0);
    expect(await db.ownerConnectorWrite.count({ where: { workspaceId: otherWs } })).toBe(0);
  });
});
