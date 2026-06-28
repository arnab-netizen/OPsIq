/**
 * Jarvis 360 Slice 5 — SOP document lifecycle (pure) + service (DI). No DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import {
  planSopTransition,
  hashSopContent,
  isSopReusable,
  isSopStale,
  isMaterialSopChange,
} from "@/domain/owner-mode/sop-document";
import {
  createSopDraft,
  approveSopDocument,
  reviseSopDocument,
  retireSopDocument,
  SopUnauthorizedError,
  SopTransitionError,
  type SopDeps,
} from "@/services/owner-mode/sop-document.service";

const NOW = new Date("2026-06-28T00:00:00Z");

beforeEach(() => emitAuditEvent.mockClear());

describe("SOP lifecycle rules (pure)", () => {
  it("allows draft→approved→retired but not approved→draft", () => {
    expect(planSopTransition("draft", "approved").allowed).toBe(true);
    expect(planSopTransition("approved", "retired").allowed).toBe(true);
    expect(planSopTransition("approved", "draft").allowed).toBe(false);
    expect(planSopTransition("retired", "approved").allowed).toBe(false);
  });
  it("reuse requires approved + not stale", () => {
    const base = { status: "approved" as const, version: 1, contentHash: "h", reviewDate: null };
    expect(isSopReusable(base, NOW)).toBe(true);
    expect(isSopReusable({ ...base, status: "draft" }, NOW)).toBe(false);
    expect(isSopReusable({ ...base, reviewDate: new Date("2026-06-01Z") }, NOW)).toBe(false);
  });
  it("stale = approved past review date", () => {
    expect(isSopStale({ status: "approved", version: 1, contentHash: "h", reviewDate: new Date("2026-06-01Z") }, NOW)).toBe(true);
    expect(isSopStale({ status: "approved", version: 1, contentHash: "h", reviewDate: null }, NOW)).toBe(false);
  });
  it("material change detected by content hash", () => {
    const a = hashSopContent({ process: "p", role: "r", steps: ["1"], proofRequirements: [] });
    const b = hashSopContent({ process: "p", role: "r", steps: ["1", "2"], proofRequirements: [] });
    expect(isMaterialSopChange(a, a)).toBe(false);
    expect(isMaterialSopChange(a, b)).toBe(true);
  });
});

function makeDeps(row?: Partial<{ id: string; workspaceId: string; process: string; role: string | null; steps: string[]; proofRequirements: string[]; version: number; status: string; contentHash: string }>) {
  const create = vi.fn(async () => ({ id: "new-sop", version: row?.version ? row.version + 1 : 1 }));
  const update = vi.fn(async () => ({}));
  const full = row
    ? { id: "sop1", workspaceId: "ws1", process: "intake", role: "clerk", steps: ["a"], proofRequirements: ["photo"], version: 1, status: "draft", contentHash: hashSopContent({ process: "intake", role: "clerk", steps: ["a"], proofRequirements: ["photo"] }), ...row }
    : null;
  const deps: SopDeps = {
    now: () => NOW,
    db: { ownerSopDocument: { create, findFirst: vi.fn(async () => full as never), update } },
  };
  return { deps, create, update };
}

describe("SOP service (DI)", () => {
  it("creates a draft and audits", async () => {
    const { deps, create } = makeDeps();
    const id = await createSopDraft({ workspaceId: "ws1", process: "intake", title: "Intake", steps: ["a"], proofRequirements: ["photo"], actorId: "u1" }, deps);
    expect(id).toBe("new-sop");
    expect(create).toHaveBeenCalledTimes(1);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("blocks a non-owner from approving", async () => {
    const { deps } = makeDeps({ status: "draft" });
    await expect(approveSopDocument("sop1", { workspaceId: "ws1", actorId: "u1", actorIsOwner: false }, deps)).rejects.toBeInstanceOf(SopUnauthorizedError);
  });

  it("owner approves a draft", async () => {
    const { deps, update } = makeDeps({ status: "draft" });
    await approveSopDocument("sop1", { workspaceId: "ws1", actorId: "owner", actorIsOwner: true }, deps);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.status).toBe("approved");
  });

  it("revise with no material change returns null (no re-approval)", async () => {
    const { deps, create } = makeDeps({ status: "approved" });
    const res = await reviseSopDocument("sop1", { workspaceId: "ws1", actorId: "u1", steps: ["a"], proofRequirements: ["photo"], role: "clerk" }, deps);
    expect(res).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("revise with a material change forks a new draft version", async () => {
    const { deps, create } = makeDeps({ status: "approved", version: 1 });
    const res = await reviseSopDocument("sop1", { workspaceId: "ws1", actorId: "u1", steps: ["a", "b"], proofRequirements: ["photo"], role: "clerk" }, deps);
    expect(res).toBe("new-sop");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.status).toBe("draft");
    expect(create.mock.calls[0][0].data.version).toBe(2);
  });

  it("cannot retire an already-retired SOP", async () => {
    const { deps } = makeDeps({ status: "retired" });
    await expect(retireSopDocument("sop1", { workspaceId: "ws1", actorId: "owner", actorIsOwner: true }, deps)).rejects.toBeInstanceOf(SopTransitionError);
  });
});
