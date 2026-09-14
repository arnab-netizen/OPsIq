/**
 * [db] Platform settings bootstrap — preview/confirm, idempotency, and the
 * concurrent-bootstrap race (Postgres PK uniqueness as the race-safety
 * mechanism, no separate lock needed for a single-row create).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/beta/platform-settings-bootstrap.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  previewPlatformSettingsBootstrap,
  confirmPlatformSettingsBootstrap,
} from "@/services/beta/platform-settings-bootstrap.service";
// PUBLIC_BETA_WORKSPACE_CAP is a module-load-time IIFE (the exact frozen-value
// bug this mission fixes) — it cannot be overridden per-test without
// vi.resetModules()+dynamic re-import, so these tests assert against its
// REAL, already-frozen value rather than trying to mutate it, which is
// sufficient to prove the bootstrap logic (capture-verbatim, idempotent)
// without needing that machinery.
import { PUBLIC_BETA_WORKSPACE_CAP } from "@/lib/beta";

const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const ORIGINAL_PUBLIC_BETA_ENABLED = process.env.PUBLIC_BETA_ENABLED;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] platform settings bootstrap", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ACTOR_ID },
      update: {},
      create: { id: ACTOR_ID, email: `bootstrap-actor-${ACTOR_ID}@example.com`, updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: ACTOR_ID } }).catch(() => undefined);
    await db.user.delete({ where: { id: ACTOR_ID } }).catch(() => undefined);
  });

  beforeEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    process.env.PUBLIC_BETA_ENABLED = "false"; // isPublicBetaEnabled() is read fresh every call, safe to mutate per-test
  });

  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    // "global" is a fixed, reused entityId across every test in this file —
    // without this, audit rows accumulate across tests and corrupt the
    // per-test event-count assertions below.
    await db.auditEvent.deleteMany({ where: { entityId: "global", eventName: "platform_settings.initialized" } });
    if (ORIGINAL_PUBLIC_BETA_ENABLED === undefined) delete process.env.PUBLIC_BETA_ENABLED;
    else process.env.PUBLIC_BETA_ENABLED = ORIGINAL_PUBLIC_BETA_ENABLED;
  });

  it("[db] preview returns the live-resolved legacy values without writing anything", async () => {
    const preview = await previewPlatformSettingsBootstrap();
    expect(preview).toEqual({ admissionMode: "INVITE_ONLY", capacityLimit: PUBLIC_BETA_WORKSPACE_CAP, alreadyInitialized: false, qaContaminationDetected: false });
    const row = await db.platformSetting.findUnique({ where: { id: "global" } });
    expect(row).toBeNull(); // preview never writes
  });

  it("[db] confirm writes EXACTLY the previewed values and audits them", async () => {
    const preview = await previewPlatformSettingsBootstrap();
    const result = await confirmPlatformSettingsBootstrap(ACTOR_ID);
    expect(result).toEqual({ admissionMode: preview.admissionMode, capacityLimit: preview.capacityLimit, created: true });

    const row = await db.platformSetting.findUniqueOrThrow({ where: { id: "global" } });
    expect(row.admissionMode).toBe("INVITE_ONLY");
    expect(row.capacityLimit).toBe(PUBLIC_BETA_WORKSPACE_CAP);
    expect(row.updatedBy).toBe(ACTOR_ID);

    const events = await db.auditEvent.findMany({ where: { entityId: "global", eventName: "platform_settings.initialized" } });
    expect(events).toHaveLength(1);
    expect((events[0].payload as Record<string, unknown>).capturedCapacityLimit).toBe(PUBLIC_BETA_WORKSPACE_CAP);
  });

  it("[db] confirm is idempotent: a second call does not overwrite the existing row", async () => {
    await confirmPlatformSettingsBootstrap(ACTOR_ID);
    // Change legacy admission-mode env after first confirm — a naive
    // re-capture would show this; idempotent confirm must not.
    process.env.PUBLIC_BETA_ENABLED = "true"; // would mean OPEN_BETA if re-captured
    const second = await confirmPlatformSettingsBootstrap(ACTOR_ID);
    expect(second.created).toBe(false);
    expect(second.admissionMode).toBe("INVITE_ONLY"); // unchanged, not re-captured as OPEN_BETA

    const events = await db.auditEvent.findMany({ where: { entityId: "global", eventName: "platform_settings.initialized" } });
    expect(events).toHaveLength(1); // no second audit event
  });

  it("[db] preview after bootstrap reports alreadyInitialized and the real DB values, not the legacy env", async () => {
    await confirmPlatformSettingsBootstrap(ACTOR_ID);
    process.env.PUBLIC_BETA_ENABLED = "true"; // legacy env changes, must be irrelevant now
    const preview = await previewPlatformSettingsBootstrap();
    expect(preview).toEqual({ admissionMode: "INVITE_ONLY", capacityLimit: PUBLIC_BETA_WORKSPACE_CAP, alreadyInitialized: true, qaContaminationDetected: false });
  });

  it("[db] concurrent bootstrap: N simultaneous confirm calls create exactly one singleton row", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => confirmPlatformSettingsBootstrap(ACTOR_ID)));
    const createdCount = results.filter((r) => r.created).length;
    expect(createdCount).toBe(1); // exactly one winner
    expect(results.every((r) => r.admissionMode === "INVITE_ONLY" && r.capacityLimit === PUBLIC_BETA_WORKSPACE_CAP)).toBe(true);

    const rows = await db.platformSetting.findMany({ where: { id: "global" } });
    expect(rows).toHaveLength(1);

    const events = await db.auditEvent.findMany({ where: { entityId: "global", eventName: "platform_settings.initialized" } });
    expect(events).toHaveLength(1); // only the winner audits
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] platform settings bootstrap — QA contamination detection", () => {
  const ORIGINAL_ACCEPTANCE_EMAIL = process.env.PRODUCTION_ACCEPTANCE_EMAIL;
  const qaUserId = "66666666-6666-4666-8666-666666666666";
  const qaWorkspaceId = "77777777-7777-4777-8777-777777777777";
  const qaEmail = `qa-acceptance-${qaUserId}@example.com`;

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: ACTOR_ID },
      update: {},
      create: { id: ACTOR_ID, email: `bootstrap-actor-contam-${ACTOR_ID}@example.com`, updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: ACTOR_ID } }).catch(() => undefined);
    await db.user.delete({ where: { id: ACTOR_ID } }).catch(() => undefined);
  });

  beforeEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    process.env.PRODUCTION_ACCEPTANCE_EMAIL = qaEmail;
    await db.user.create({ data: { id: qaUserId, email: qaEmail, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({
      data: { id: qaWorkspaceId, name: "QA Acceptance WS", slug: `qa-ws-${qaWorkspaceId.slice(0, 8)}`, signupSource: "PUBLIC_BETA" },
    });
    await db.workspaceMembership.create({ data: { workspaceId: qaWorkspaceId, userId: qaUserId, role: "owner", isActive: true } });
  });

  afterEach(async () => {
    await db.platformSetting.deleteMany({ where: { id: "global" } });
    await db.auditEvent.deleteMany({ where: { entityId: "global", eventName: "platform_settings.initialized" } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId: qaWorkspaceId } });
    await db.workspace.deleteMany({ where: { id: qaWorkspaceId } });
    await db.user.deleteMany({ where: { id: qaUserId } });
    if (ORIGINAL_ACCEPTANCE_EMAIL === undefined) delete process.env.PRODUCTION_ACCEPTANCE_EMAIL;
    else process.env.PRODUCTION_ACCEPTANCE_EMAIL = ORIGINAL_ACCEPTANCE_EMAIL;
  });

  it("[db] preview reports qaContaminationDetected=true when the known acceptance account owns a beta-tagged workspace", async () => {
    const preview = await previewPlatformSettingsBootstrap();
    expect(preview.qaContaminationDetected).toBe(true);
  });

  it("[db] preview never reveals the acceptance email itself", async () => {
    const preview = await previewPlatformSettingsBootstrap();
    expect(JSON.stringify(preview)).not.toContain(qaEmail);
  });

  it("[db] confirm refuses when contamination is detected and not acknowledged", async () => {
    await expect(confirmPlatformSettingsBootstrap(ACTOR_ID)).rejects.toThrow();
    const row = await db.platformSetting.findUnique({ where: { id: "global" } });
    expect(row).toBeNull(); // refused before writing
  });

  it("[db] confirm succeeds when contamination is explicitly acknowledged, and the acknowledgement is audited", async () => {
    const result = await confirmPlatformSettingsBootstrap(ACTOR_ID, { acknowledgeQaContamination: true });
    expect(result.created).toBe(true);
    const events = await db.auditEvent.findMany({ where: { entityId: "global", eventName: "platform_settings.initialized" } });
    expect((events[0].payload as Record<string, unknown>).qaContaminationAcknowledged).toBe(true);
  });

  it("[db] preview reports qaContaminationDetected=false when PRODUCTION_ACCEPTANCE_EMAIL is unset (default everywhere)", async () => {
    delete process.env.PRODUCTION_ACCEPTANCE_EMAIL;
    const preview = await previewPlatformSettingsBootstrap();
    expect(preview.qaContaminationDetected).toBe(false);
  });
});
