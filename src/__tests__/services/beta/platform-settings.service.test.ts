/**
 * platform-settings.service.ts — read-with-fallback, validation, ceiling,
 * "not below current usage" boundary. Mocked (no live database); the
 * real-Postgres locking/concurrency proof lives in
 * platform-capacity-locking.db.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readEffectiveSettings,
  countExternalBetaWorkspaces,
  updatePlatformSettings,
  PlatformSettingsUnavailableError,
  ADMIN_CAPACITY_ABSOLUTE_CEILING,
} from "@/services/beta/platform-settings.service";
import { ValidationError } from "@/infra/errors";
import { PUBLIC_BETA_WORKSPACE_CAP } from "@/lib/beta";

vi.mock("@/infra/audit", () => ({ emitAuditEvent: vi.fn().mockResolvedValue("evt-id") }));

const ORIGINAL_PUBLIC_BETA_ENABLED = process.env.PUBLIC_BETA_ENABLED;
afterEach(() => {
  if (ORIGINAL_PUBLIC_BETA_ENABLED === undefined) delete process.env.PUBLIC_BETA_ENABLED;
  else process.env.PUBLIC_BETA_ENABLED = ORIGINAL_PUBLIC_BETA_ENABLED;
});

function fakeClient(row: { admissionMode: string; capacityLimit: number; version: number } | null) {
  return {
    platformSetting: {
      findUnique: vi.fn(async () => row),
    },
    workspace: {
      count: vi.fn(async () => 0),
    },
  } as unknown as Parameters<typeof readEffectiveSettings>[0];
}

describe("readEffectiveSettings", () => {
  it("falls back to legacy env-derived behavior when no row exists — OPEN_BETA leg", async () => {
    process.env.PUBLIC_BETA_ENABLED = "true";
    const result = await readEffectiveSettings(fakeClient(null));
    expect(result).toEqual({ admissionMode: "OPEN_BETA", capacityLimit: PUBLIC_BETA_WORKSPACE_CAP, source: "legacy" });
  });

  it("falls back to legacy env-derived behavior when no row exists — INVITE_ONLY leg", async () => {
    process.env.PUBLIC_BETA_ENABLED = "false";
    const result = await readEffectiveSettings(fakeClient(null));
    expect(result).toEqual({ admissionMode: "INVITE_ONLY", capacityLimit: PUBLIC_BETA_WORKSPACE_CAP, source: "legacy" });
  });

  it("is authoritative once the row exists, regardless of legacy env values", async () => {
    process.env.PUBLIC_BETA_ENABLED = "true"; // would mean OPEN_BETA under legacy fallback
    const result = await readEffectiveSettings(fakeClient({ admissionMode: "CLOSED", capacityLimit: 7, version: 3 }));
    expect(result).toEqual({ admissionMode: "CLOSED", capacityLimit: 7, source: "database" });
  });

  it("fails closed (throws) when the settings read itself errors — never silently unlimited/any-mode", async () => {
    const client = {
      platformSetting: { findUnique: vi.fn(async () => { throw new Error("connection lost"); }) },
      workspace: { count: vi.fn() },
    } as unknown as Parameters<typeof readEffectiveSettings>[0];
    await expect(readEffectiveSettings(client)).rejects.toBeInstanceOf(PlatformSettingsUnavailableError);
  });

  it("fails closed on a malformed admission_mode value rather than guessing", async () => {
    const client = fakeClient({ admissionMode: "NOT_A_REAL_MODE", capacityLimit: 10, version: 0 });
    await expect(readEffectiveSettings(client)).rejects.toBeInstanceOf(PlatformSettingsUnavailableError);
  });
});

describe("countExternalBetaWorkspaces", () => {
  it("counts workspaces tagged with either PUBLIC_BETA or CONTROLLED_BETA_INVITE", async () => {
    const countSpy = vi.fn(async () => 3);
    const client = { workspace: { count: countSpy } } as unknown as Parameters<typeof countExternalBetaWorkspaces>[0];
    const result = await countExternalBetaWorkspaces(client);
    expect(result).toBe(3);
    expect(countSpy).toHaveBeenCalledWith({
      where: { signupSource: { in: ["PUBLIC_BETA", "CONTROLLED_BETA_INVITE"] } },
    });
  });
});

describe("updatePlatformSettings — validation", () => {
  it("rejects an invalid admission mode", async () => {
    await expect(
      updatePlatformSettings({ actorId: "a1", admissionMode: "NOPE" as never })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-positive capacity", async () => {
    await expect(updatePlatformSettings({ actorId: "a1", capacityLimit: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(updatePlatformSettings({ actorId: "a1", capacityLimit: -5 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a capacity above the absolute ceiling", async () => {
    await expect(
      updatePlatformSettings({ actorId: "a1", capacityLimit: ADMIN_CAPACITY_ABSOLUTE_CEILING + 1 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects when nothing is provided to update", async () => {
    await expect(updatePlatformSettings({ actorId: "a1" })).rejects.toBeInstanceOf(ValidationError);
  });
});
