/**
 * QuickBooks Online — governed write service (LAYER 2).
 *
 * Every OpsIQ → QuickBooks mutation goes through executeGovernedQboWrite. It
 * enforces, in order:
 *
 *  1. workspace scope — the connector is resolved from the verified workspace,
 *     never from caller input, and must be ACTIVE;
 *  2. entity-specific semantics — the operation must be supported by the
 *     entity (QBO_ENTITIES matrix: e.g. name-list entities are inactivated,
 *     never deleted; Bill cannot be voided);
 *  3. material-write governance — delete / void / inactivate and every write
 *     to a high-risk entity (JournalEntry, Payment, BillPayment, Deposit,
 *     Transfer, Purchase, RefundReceipt, Account) require explicit
 *     confirmation;
 *  4. accounting validity — the final body is validated against QBO rules
 *     (validateQboWrite) with the company's home currency / multicurrency
 *     preference and the ACTIVE state of every referenced record; an invalid
 *     transaction is rejected, never "fixed up";
 *  5. idempotency — (workspaceId, idempotencyKey) is unique in the durable
 *     OwnerConnectorWrite ledger. The QBO `requestid` is derived
 *     deterministically from it and re-sent unchanged on every retry, so a
 *     request that timed out after QBO committed it resolves to the ORIGINAL
 *     record instead of a duplicate. A reused key with a different payload is
 *     rejected. Concurrent submissions of one key are serialized by a CAS lock;
 *  6. SyncToken concurrency — updates/deletes/voids always fetch the CURRENT
 *     remote record first. If the record changed in QuickBooks since OpsIQ last
 *     saw it (mirror SyncToken differs) and the change touches what we intend
 *     to modify — or the operation is destructive — the write stops with a
 *     CONFLICT instead of overwriting. A 5010 Stale Object race between read
 *     and write is re-read and re-evaluated once, then reported as CONFLICT;
 *  7. audit — requested / committed / failed / conflict / ambiguous events;
 *  8. provenance — the committed remote state is written to the mirror
 *     (OwnerConnectorRecord) together with the OpsIQ record it came from.
 *
 * No remote call happens inside a DB transaction. This module never builds
 * bodies from browser input: product-level callers (qbo-write-actions.service)
 * construct bodies from governed OpsIQ records.
 */
import { createHash } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  AppError,
  ConflictError,
  DuplicateSubmissionError,
  ForbiddenError,
  NotFoundError,
  PolicyViolationError,
  ServiceUnavailableError,
  ValidationError,
} from "@/infra/errors";
import { QBO_PROVIDER, isValidQboEntityId } from "@/domain/quickbooks/qbo-config";
import {
  QBO_ENTITIES,
  isHighRiskOperation,
  isQboOperationSupported,
  type QboEntityName,
  type QboEntityOperation,
} from "@/domain/quickbooks/qbo-entities";
import { QboApiError, type QboClient, type QboEntityBody } from "@/domain/quickbooks/qbo-contracts";
import { validateQboWrite } from "@/domain/quickbooks/qbo-accounting-validation";
import { createQboClient } from "@/services/quickbooks/qbo-client";
import { createQboTokenProvider } from "@/services/quickbooks/qbo-token.service";

export type QboWriteOperation = QboEntityOperation;

export interface GovernedQboWriteInput {
  workspaceId: string;
  actorId: string;
  /** Caller-stable key: the same logical request must always reuse it. */
  idempotencyKey: string;
  entity: QboEntityName;
  operation: QboWriteOperation;
  /** create: the full entity body. update: ONLY the fields to change (no Id/SyncToken). */
  body?: QboEntityBody;
  /** Required for update / delete / void / inactivate. */
  remoteId?: string;
  /** Explicit owner confirmation for material writes. */
  confirm?: boolean;
  /** The governed OpsIQ record this write originates from (provenance link). */
  opsiqLink?: { entityType: string; entityId: string };
  deps?: {
    createClient?: (ids: { workspaceId: string; connectorId: string }) => Promise<QboClient>;
    now?: () => Date;
  };
}

export interface GovernedQboWriteResult {
  writeId: string;
  remoteId: string;
  remoteSyncToken: string | null;
  /** True when this call returned an earlier committed result for the same key. */
  replayed: boolean;
}

const WRITE_LOCK_MS = 90_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:._-]{8,200}$/;

/** Ref field → the mirrored entity it points at. */
const REF_ENTITY: Record<string, QboEntityName> = {
  CustomerRef: "Customer",
  VendorRef: "Vendor",
  ItemRef: "Item",
  ClassRef: "Class",
  DepartmentRef: "Department",
  SalesTermRef: "Term",
  PaymentMethodRef: "PaymentMethod",
  AccountRef: "Account",
  APAccountRef: "Account",
  ARAccountRef: "Account",
  BankAccountRef: "Account",
  CCAccountRef: "Account",
  DepositToAccountRef: "Account",
  FromAccountRef: "Account",
  ToAccountRef: "Account",
  IncomeAccountRef: "Account",
  ExpenseAccountRef: "Account",
  AssetAccountRef: "Account",
};

type LedgerRow = {
  id: string;
  status: string;
  attempts: number;
  payloadHash: string;
  providerRequestId: string;
  remoteId: string | null;
  remoteSyncToken: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastAmbiguousAt: Date | null;
};

// ─── Pure helpers (exported for tests) ──────────────────────────────────────

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function hashWritePayload(input: Pick<GovernedQboWriteInput, "entity" | "operation" | "remoteId" | "body">): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({ e: input.entity, o: input.operation, r: input.remoteId ?? null, b: input.body ?? null })))
    .digest("hex");
}

/** Deterministic, UUID-shaped QBO requestid (36 chars ≤ 50) bound to workspace + key. */
export function deriveProviderRequestId(workspaceId: string, idempotencyKey: string): string {
  const h = createHash("sha256").update(`opsiq-qbo-write|${workspaceId}|${idempotencyKey}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Collect every { XRef: { value } } reference in a QBO body, grouped by mirrored entity. */
export function collectBodyRefs(body: unknown): Map<QboEntityName, Set<string>> {
  const out = new Map<QboEntityName, Set<string>>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const target = REF_ENTITY[k];
      const ref = v as { value?: unknown } | null;
      if (target && ref && typeof ref === "object" && typeof ref.value === "string") {
        if (!out.has(target)) out.set(target, new Set());
        out.get(target)!.add(ref.value);
      } else {
        walk(v);
      }
    }
  };
  walk(body);
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/**
 * The remote record changed since OpsIQ last saw it. For a sparse update, a
 * conflict exists only if one of the fields we intend to change was itself
 * changed remotely (someone else edited the same fact). Returns the
 * conflicting field names.
 */
export function detectUpdateConflict(
  mirrorData: Record<string, unknown>,
  current: Record<string, unknown>,
  changes: Record<string, unknown>,
): string[] {
  return Object.keys(changes).filter((k) => !deepEqual(mirrorData[k], current[k]));
}

function ownerSafe(message: string): string {
  return message.length > 480 ? `${message.slice(0, 477)}...` : message;
}

// ─── Ledger ─────────────────────────────────────────────────────────────────

const ledgerSelect = {
  id: true,
  status: true,
  attempts: true,
  payloadHash: true,
  providerRequestId: true,
  remoteId: true,
  remoteSyncToken: true,
  errorCode: true,
  errorMessage: true,
  lastAmbiguousAt: true,
} as const;

async function openLedger(args: {
  workspaceId: string;
  businessId: string | null;
  connectorId: string;
  input: GovernedQboWriteInput;
  payloadHash: string;
}): Promise<{ row: LedgerRow; created: boolean }> {
  const { workspaceId, businessId, connectorId, input, payloadHash } = args;
  try {
    const row = await db.ownerConnectorWrite.create({
      data: {
        workspaceId,
        businessId,
        connectorId,
        idempotencyKey: input.idempotencyKey,
        operation: input.operation,
        entityType: input.entity,
        payloadHash,
        providerRequestId: deriveProviderRequestId(workspaceId, input.idempotencyKey),
        status: "PENDING",
        opsiqEntityType: input.opsiqLink?.entityType ?? null,
        opsiqEntityId: input.opsiqLink?.entityId ?? null,
        requestedBy: input.actorId,
      },
      select: ledgerSelect,
    });
    return { row: row as LedgerRow, created: true };
  } catch (err) {
    if ((err as { code?: string })?.code !== "P2002") throw err;
    const existing = await db.ownerConnectorWrite.findFirst({
      where: { workspaceId, idempotencyKey: input.idempotencyKey },
      select: ledgerSelect,
    });
    if (!existing) throw err;
    return { row: existing as LedgerRow, created: false };
  }
}

async function acquireLedgerLock(rowId: string, now: Date): Promise<boolean> {
  const res = await db.ownerConnectorWrite.updateMany({
    where: {
      id: rowId,
      status: { in: ["PENDING", "AMBIGUOUS"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lockedUntil: new Date(now.getTime() + WRITE_LOCK_MS), attempts: { increment: 1 } },
  });
  return res.count === 1;
}

async function finishLedger(
  rowId: string,
  data: {
    status: "PENDING" | "COMMITTED" | "FAILED" | "CONFLICT" | "AMBIGUOUS";
    remoteId?: string | null;
    remoteSyncToken?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const c = tx ?? db;
  await c.ownerConnectorWrite.update({
    where: { id: rowId },
    data: {
      ...data,
      lockedUntil: null,
      // Durable: once QuickBooks may hold this requestid, it stays pinned (see reopen below).
      ...(data.status === "AMBIGUOUS" ? { lastAmbiguousAt: new Date() } : {}),
      completedAt: data.status === "COMMITTED" || data.status === "FAILED" || data.status === "CONFLICT" ? new Date() : null,
    },
  });
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function executeGovernedQboWrite(input: GovernedQboWriteInput): Promise<GovernedQboWriteResult> {
  const now = input.deps?.now ?? (() => new Date());
  const { workspaceId, actorId, entity, operation } = input;

  // ── Input & policy validation (before any side effect) ──
  if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    throw new ValidationError("A valid idempotency key (8–200 chars: letters, digits, : . _ -) is required for QuickBooks writes.");
  }
  if (!QBO_ENTITIES[entity]) throw new ValidationError(`Unsupported QuickBooks entity: ${String(entity)}`);
  if (!isQboOperationSupported(entity, operation)) {
    throw new PolicyViolationError("QUICKBOOKS_WRITE_GOVERNANCE", `QuickBooks does not support "${operation}" for ${entity}.`);
  }
  if (operation === "create") {
    if (!input.body || typeof input.body !== "object") throw new ValidationError(`A ${entity} body is required.`);
    if (input.remoteId) throw new ValidationError("remoteId must not be supplied for create.");
    if ("Id" in input.body || "SyncToken" in input.body) throw new ValidationError("Create bodies must not carry Id or SyncToken.");
  } else {
    if (!isValidQboEntityId(input.remoteId)) throw new ValidationError("A valid QuickBooks record id is required.");
    if (operation === "update") {
      if (!input.body || Object.keys(input.body).length === 0) throw new ValidationError("An update needs at least one field to change.");
      if ("Id" in input.body || "SyncToken" in input.body || "sparse" in input.body) {
        throw new ValidationError("Update bodies carry only the fields to change; Id and SyncToken are resolved server-side.");
      }
    } else if (input.body) {
      throw new ValidationError(`A body must not be supplied for ${operation}.`);
    }
  }
  if (isHighRiskOperation(entity, operation) && input.confirm !== true) {
    throw new PolicyViolationError("QUICKBOOKS_WRITE_GOVERNANCE", `This QuickBooks ${operation} of a ${entity} is a material accounting change and requires explicit confirmation.`);
  }

  // ── Workspace-scoped connector ──
  const connector = await db.ownerConnector.findFirst({
    where: { workspaceId, provider: QBO_PROVIDER },
    select: { id: true, status: true, businessId: true, externalAccountId: true },
  });
  if (!connector || connector.status !== "ACTIVE" || !connector.externalAccountId) {
    throw new ConflictError("QuickBooks is not connected for this workspace. Connect or reconnect QuickBooks first.");
  }

  // ── Durable idempotency ledger ──
  const payloadHash = hashWritePayload(input);
  const { row, created } = await openLedger({
    workspaceId,
    businessId: connector.businessId,
    connectorId: connector.id,
    input,
    payloadHash,
  });
  let ledger = row;
  if (!created) {
    if (row.status === "COMMITTED" && row.remoteId) {
      if (row.payloadHash !== payloadHash) {
        throw new ConflictError("This idempotency key was already used for a different QuickBooks request.");
      }
      return { writeId: row.id, remoteId: row.remoteId, remoteSyncToken: row.remoteSyncToken, replayed: true };
    }
    if (row.status === "FAILED" || row.status === "CONFLICT") {
      if (row.lastAmbiguousAt && row.payloadHash !== payloadHash) {
        // F29: the pinned requestid belongs to the ORIGINAL payload, which
        // QuickBooks may already have committed. Sending a different payload
        // under it could return the original result and look like the new
        // intent was applied; a new requestid could duplicate the original.
        // Neither is safe, so the changed intent is refused and the ledger
        // row (requestid, payload hash, ambiguity marker) is left untouched.
        throw new ConflictError(
          "An earlier attempt of this QuickBooks change may already have been recorded in QuickBooks. Sync QuickBooks and check that record before submitting a different version of this change.",
        );
      }
      // Definitively NOT committed in QuickBooks (rejected by QBO or by OpsIQ
      // before sending). Intent-derived keys (e.g. one bill per PO) must stay
      // retryable after the owner corrects the record, so the row is reopened
      // under a NEW generation-derived requestid: the old requestid's rejected
      // response can never be replayed onto the corrected request, and no
      // committed record exists that a new requestid could duplicate.
      // EXCEPT when an earlier attempt was AMBIGUOUS: QuickBooks may already
      // hold a committed record under that requestid, so it stays pinned and
      // the retry re-sends it — QBO's requestid de-duplication then returns the
      // committed record instead of creating a second one.
      // Compare-and-set so two concurrent retries cannot both reopen it.
      const reopened = await db.ownerConnectorWrite.updateMany({
        where: {
          id: row.id,
          status: row.status,
          providerRequestId: row.providerRequestId,
          payloadHash: row.payloadHash,
          // A row that turned AMBIGUOUS concurrently must not be reopened on this stale read.
          lastAmbiguousAt: row.lastAmbiguousAt,
        },
        data: {
          status: "PENDING",
          // Pinned rows only reach here with an unchanged payload (checked above).
          payloadHash,
          providerRequestId: row.lastAmbiguousAt
            ? row.providerRequestId
            : deriveProviderRequestId(workspaceId, `${input.idempotencyKey}#${row.attempts}`),
          errorCode: null,
          errorMessage: null,
          completedAt: null,
        },
      });
      if (reopened.count !== 1) throw new DuplicateSubmissionError(input.idempotencyKey);
      const fresh = await db.ownerConnectorWrite.findUnique({ where: { id: row.id }, select: ledgerSelect });
      if (!fresh) throw new NotFoundError("OwnerConnectorWrite", row.id);
      ledger = fresh as LedgerRow;
    } else if (row.payloadHash !== payloadHash) {
      // PENDING / AMBIGUOUS: QuickBooks may already hold the original request
      // under this requestid — a different payload must never ride on it.
      throw new ConflictError("This idempotency key is still resolving a different QuickBooks request.");
    }
  }
  if (!(await acquireLedgerLock(ledger.id, now()))) {
    throw new DuplicateSubmissionError(input.idempotencyKey);
  }

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.QUICKBOOKS_WRITE_REQUESTED,
    entityType: "OwnerConnectorWrite",
    entityId: ledger.id,
    payload: {
      entity,
      operation,
      remoteId: input.remoteId ?? null,
      resumed: !created,
      requestIdPinned: ledger.lastAmbiguousAt !== null,
      opsiqLink: input.opsiqLink ?? null,
    },
  });

  const requestId = ledger.providerRequestId;
  const makeClient = input.deps?.createClient ??
    ((ids: { workspaceId: string; connectorId: string }) => createQboClient({ tokenProvider: createQboTokenProvider(ids) }));

  try {
    const client = await makeClient({ workspaceId, connectorId: connector.id });
    const committed = await performWrite({ client, input, connectorId: connector.id, requestId });
    const remoteId = String(committed.Id ?? input.remoteId ?? "");
    if (!remoteId) throw new QboApiError({ kind: "MALFORMED", message: "QuickBooks response did not include a record id." });
    const remoteSyncToken = typeof committed.SyncToken === "string" ? committed.SyncToken : null;
    const remoteStatus =
      operation === "delete" ? "DELETED" : operation === "void" ? "VOIDED" : operation === "inactivate" ? "INACTIVE" : committed.Active === false ? "INACTIVE" : "ACTIVE";

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await finishLedger(ledger.id, { status: "COMMITTED", remoteId, remoteSyncToken, errorCode: null, errorMessage: null }, tx);
      const lastUpdated = committed.MetaData?.LastUpdatedTime ? new Date(committed.MetaData.LastUpdatedTime) : now();
      await tx.ownerConnectorRecord.upsert({
        where: { connectorId_entityType_remoteId: { connectorId: connector.id, entityType: entity, remoteId } },
        create: {
          workspaceId,
          businessId: connector.businessId,
          connectorId: connector.id,
          provider: QBO_PROVIDER,
          externalAccount: connector.externalAccountId!,
          entityType: entity,
          remoteId,
          remoteSyncToken,
          remoteUpdatedAt: lastUpdated,
          remoteStatus,
          data: committed as Prisma.InputJsonValue,
          opsiqEntityType: input.opsiqLink?.entityType ?? null,
          opsiqEntityId: input.opsiqLink?.entityId ?? null,
          ingestedAt: now(),
          lastSyncRunId: `write:${ledger.id}`,
        },
        update: {
          remoteSyncToken,
          remoteUpdatedAt: lastUpdated,
          remoteStatus,
          data: committed as Prisma.InputJsonValue,
          ...(input.opsiqLink ? { opsiqEntityType: input.opsiqLink.entityType, opsiqEntityId: input.opsiqLink.entityId } : {}),
          ingestedAt: now(),
          lastSyncRunId: `write:${ledger.id}`,
        },
      });
      await emitAuditEvent(
        {
          workspaceId,
          actorId,
          eventName: AUDIT_EVENTS.QUICKBOOKS_WRITE_COMMITTED,
          entityType: "OwnerConnectorWrite",
          entityId: ledger.id,
          payload: { entity, operation, remoteId, opsiqLink: input.opsiqLink ?? null },
        },
        tx,
      );
    });

    return { writeId: ledger.id, remoteId, remoteSyncToken, replayed: false };
  } catch (err) {
    await recordWriteFailure({ rowId: ledger.id, workspaceId, actorId, entity, operation, err });
    throw translateWriteError(err);
  }
}

// ─── Remote execution ───────────────────────────────────────────────────────

async function loadMirror(connectorId: string, entity: QboEntityName, remoteId: string) {
  return db.ownerConnectorRecord.findUnique({
    where: { connectorId_entityType_remoteId: { connectorId, entityType: entity, remoteId } },
    select: { remoteSyncToken: true, data: true, remoteStatus: true },
  });
}

async function buildValidationContext(connectorId: string, body: QboEntityBody) {
  const prefs = await db.ownerConnectorRecord.findFirst({
    where: { connectorId, entityType: "Preferences" },
    select: { data: true },
  });
  if (!prefs) {
    throw new ConflictError("QuickBooks company preferences have not been synced yet. Run a QuickBooks sync before writing.");
  }
  const p = prefs.data as {
    CurrencyPrefs?: { HomeCurrency?: { value?: string }; MultiCurrencyEnabled?: boolean };
  };
  const homeCurrency = p.CurrencyPrefs?.HomeCurrency?.value;
  if (!homeCurrency) throw new ConflictError("QuickBooks home currency is unknown. Run a QuickBooks sync before writing.");

  const refs = collectBodyRefs(body);
  const resolved = new Map<string, { active: boolean; accountType?: string; accountSubType?: string }>();
  for (const [refEntity, ids] of refs) {
    const rows = await db.ownerConnectorRecord.findMany({
      where: { connectorId, entityType: refEntity, remoteId: { in: Array.from(ids) } },
      select: { remoteId: true, remoteStatus: true, data: true },
    });
    for (const r of rows) {
      const d = r.data as { Active?: boolean; AccountType?: string; AccountSubType?: string };
      resolved.set(`${refEntity}:${r.remoteId}`, {
        active: r.remoteStatus === "ACTIVE" && d.Active !== false,
        accountType: d.AccountType,
        accountSubType: d.AccountSubType,
      });
    }
  }
  return {
    homeCurrency,
    multiCurrencyEnabled: p.CurrencyPrefs?.MultiCurrencyEnabled === true,
    resolveRef: (refEntity: string, id: string) => resolved.get(`${refEntity}:${id}`) ?? null,
  };
}

async function assertValid(connectorId: string, entity: QboEntityName, op: QboWriteOperation, body: QboEntityBody) {
  const ctx = await buildValidationContext(connectorId, body);
  const result = await validateQboWrite(entity, op, body, ctx);
  if (!result.ok) {
    throw new ValidationError(`QuickBooks ${entity} is not valid: ${result.issues.join("; ")}`);
  }
}

async function performWrite(args: {
  client: QboClient;
  input: GovernedQboWriteInput;
  connectorId: string;
  requestId: string;
}): Promise<QboEntityBody> {
  const { client, input, connectorId, requestId } = args;
  const { entity, operation } = input;

  if (operation === "create") {
    await assertValid(connectorId, entity, "create", input.body!);
    return client.create(entity, input.body!, { requestId });
  }

  const remoteId = input.remoteId!;
  const mirror = await loadMirror(connectorId, entity, remoteId);
  if (!mirror) {
    throw new ConflictError(`OpsIQ has no synced copy of QuickBooks ${entity} ${remoteId}. Sync QuickBooks before changing it.`);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await client.read(entity, remoteId);
    const currentToken = typeof current.SyncToken === "string" ? current.SyncToken : null;
    if (!currentToken) throw new QboApiError({ kind: "MALFORMED", message: "QuickBooks record has no SyncToken." });
    const changedRemotely = mirror.remoteSyncToken !== currentToken;

    try {
      if (operation === "update") {
        const changes = input.body!;
        if (changedRemotely) {
          const fields = detectUpdateConflict(mirror.data as Record<string, unknown>, current, changes);
          if (fields.length > 0) {
            throw new ConflictError(
              `QuickBooks ${entity} ${remoteId} was changed in QuickBooks (${fields.join(", ")}) after OpsIQ last synced it. Sync and review before updating.`,
            );
          }
        }
        await assertValid(connectorId, entity, "update", { ...current, ...changes });
        return await client.update(entity, { ...changes, Id: remoteId, SyncToken: currentToken }, { requestId });
      }

      // Destructive / status-changing operations never act on a version OpsIQ has not seen.
      if (changedRemotely) {
        throw new ConflictError(
          `QuickBooks ${entity} ${remoteId} changed in QuickBooks after OpsIQ last synced it. Sync and review before you ${operation} it.`,
        );
      }
      const ref = { Id: remoteId, SyncToken: currentToken };
      if (operation === "delete") return await client.delete(entity, ref, { requestId });
      if (operation === "void") return await client.void(entity, ref, { requestId });
      return await client.inactivate(entity, ref, { requestId });
    } catch (err) {
      // Stale Object race between our read and write: re-read and re-evaluate once.
      if (err instanceof QboApiError && err.kind === "STALE_OBJECT" && attempt === 0) continue;
      throw err;
    }
  }
  throw new ConflictError(`QuickBooks ${entity} ${remoteId} keeps changing in QuickBooks. Sync and try again.`);
}

// ─── Failure handling ───────────────────────────────────────────────────────

async function recordWriteFailure(args: {
  rowId: string;
  workspaceId: string;
  actorId: string;
  entity: QboEntityName;
  operation: QboWriteOperation;
  err: unknown;
}): Promise<void> {
  const { rowId, workspaceId, actorId, entity, operation, err } = args;
  let status: "PENDING" | "FAILED" | "CONFLICT" | "AMBIGUOUS";
  let eventName: (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];
  let errorCode: string;

  if (err instanceof QboApiError) {
    errorCode = err.kind;
    if (err.ambiguous) {
      status = "AMBIGUOUS";
      eventName = AUDIT_EVENTS.QUICKBOOKS_WRITE_AMBIGUOUS;
    } else if (err.kind === "STALE_OBJECT") {
      status = "CONFLICT";
      eventName = AUDIT_EVENTS.QUICKBOOKS_WRITE_CONFLICT;
    } else if (err.retryable) {
      // Failed before QuickBooks could commit (e.g. throttled / read failed): safe to retry with the same key.
      status = "PENDING";
      eventName = AUDIT_EVENTS.QUICKBOOKS_WRITE_FAILED;
    } else {
      status = "FAILED";
      eventName = AUDIT_EVENTS.QUICKBOOKS_WRITE_FAILED;
    }
  } else if (err instanceof ConflictError) {
    errorCode = "CONFLICT";
    status = "CONFLICT";
    eventName = AUDIT_EVENTS.QUICKBOOKS_WRITE_CONFLICT;
  } else if (err instanceof ValidationError) {
    errorCode = "VALIDATION";
    status = "FAILED";
    eventName = AUDIT_EVENTS.QUICKBOOKS_WRITE_FAILED;
  } else {
    // Unknown local failure: the remote outcome is unknown only if we may have sent the write.
    errorCode = "INTERNAL";
    status = "AMBIGUOUS";
    eventName = AUDIT_EVENTS.QUICKBOOKS_WRITE_AMBIGUOUS;
  }

  // Provider errors (classified, owner-safe fault text) and OpsIQ's own AppErrors
  // (validation/conflict messages written for owners) are kept verbatim; anything
  // else (e.g. a database error) is governed so internals never reach the owner.
  const message = ownerSafe(
    err instanceof QboApiError || err instanceof AppError
      ? String((err as Error).message)
      : classifyOperatorError(err, { context: "save" }).operatorMessage,
  );
  try {
    await finishLedger(rowId, { status, errorCode, errorMessage: message });
    await emitAuditEvent({
      workspaceId,
      actorId,
      eventName,
      entityType: "OwnerConnectorWrite",
      entityId: rowId,
      payload: { entity, operation, errorCode, ledgerStatus: status },
    });
  } catch {
    // The original error is what the caller must see; a ledger-bookkeeping
    // failure leaves the row PENDING with an expiring lock, which is safe:
    // a retry with the same key re-sends the same requestid.
  }
}

function translateWriteError(err: unknown): Error {
  if (!(err instanceof QboApiError)) return err instanceof Error ? err : new Error(String(err));
  const detail = ownerSafe(err.message);
  switch (err.kind) {
    case "AUTH":
      return new ConflictError("QuickBooks authorization expired or was revoked. Reconnect QuickBooks and retry.");
    case "FORBIDDEN":
      return new ForbiddenError("The connected QuickBooks user is not allowed to make this change.");
    case "NOT_FOUND":
      return new NotFoundError("QuickBooks record", "remote");
    case "STALE_OBJECT":
      return new ConflictError("QuickBooks has a newer version of this record. Sync and review before retrying.");
    case "VALIDATION":
    case "DUPLICATE":
      return new ValidationError(`QuickBooks rejected the change: ${detail}`);
    default:
      if (err.ambiguous) {
        return new ServiceUnavailableError(
          "SYSTEM_DEGRADED",
          "QuickBooks did not confirm the result. Retry the same request — OpsIQ re-sends it with the same request id, so it cannot be recorded twice.",
        );
      }
      return new ServiceUnavailableError("SYSTEM_DEGRADED", "QuickBooks is temporarily unavailable. Retry the same request shortly.");
  }
}
