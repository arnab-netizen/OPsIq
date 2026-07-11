/**
 * GET /api/owner/local-mode/status — Local / Private Mode Configuration Status (Module #18).
 *
 * Route-level tests covering:
 * 1. Static enforcement (canonical, OWNER_VIEW, requireWorkspace, GET only)
 * 2. Storage/scheduler provider resolution from environment variables
 * 3. localModeActive flag (true only when both local + in-memory)
 * 4. Capabilities object
 * 5. Tenant isolation (workspaceId from ctx)
 * 6. Secret safety (no credentials, DATABASE_URL, or keys in response)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (
    handler: (ctx: unknown) => unknown,
    options?: Record<string, unknown>
  ) => {
    const wrapped = (ctx: unknown) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

import { GET } from "@/app/api/owner/local-mode/status/route";

const WS = "ws-local-test";

function makeCtx(workspaceId = WS) {
  return {
    verifiedActorId: "actor-1",
    verifiedWorkspaceId: workspaceId,
    request: {
      url: "https://x/api/owner/local-mode/status",
      json: async () => ({}),
    },
  } as const;
}

// Preserve env vars between tests
let savedStorage: string | undefined;
let savedScheduler: string | undefined;

beforeEach(() => {
  savedStorage = process.env.STORAGE_PROVIDER;
  savedScheduler = process.env.SCHEDULER_PROVIDER;
});

afterEach(() => {
  if (savedStorage === undefined) {
    delete process.env.STORAGE_PROVIDER;
  } else {
    process.env.STORAGE_PROVIDER = savedStorage;
  }
  if (savedScheduler === undefined) {
    delete process.env.SCHEDULER_PROVIDER;
  } else {
    process.env.SCHEDULER_PROVIDER = savedScheduler;
  }
});

// ─── 1. Static enforcement ────────────────────────────────────────────────────

describe("[module-18] local-mode/status route — static enforcement", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../../../../app/api/owner/local-mode/status/route.ts"),
    "utf8"
  );

  it("uses withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });

  it("requires OWNER_VIEW capability", () => {
    expect(src).toContain("CAPABILITIES.OWNER_VIEW");
  });

  it("requires workspace", () => {
    expect(src).toContain("requireWorkspace: true");
  });

  it("uses ctx.verifiedWorkspaceId (never env or body)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
  });

  it("exports GET handler only (no POST/DELETE/PATCH)", () => {
    expect(src).toContain("export const GET");
    expect(src).not.toContain("export const POST");
    expect(src).not.toContain("export const DELETE");
    expect(src).not.toContain("export const PATCH");
  });

  it("does not read DATABASE_URL, API keys, or credentials from env", () => {
    // Route should only read STORAGE_PROVIDER and SCHEDULER_PROVIDER
    expect(src).not.toContain('process.env.DATABASE_URL');
    expect(src).not.toContain('process.env.OPENAI_API_KEY');
    expect(src).not.toContain('process.env.ANTHROPIC_API_KEY');
    expect(src).not.toContain('process.env.AUTH_SECRET');
  });
});

// ─── 2. Capability declarations ──────────────────────────────────────────────

describe("[module-18] GET handler — capability declarations", () => {
  it("declares OWNER_VIEW and requireWorkspace", () => {
    const options = (GET as unknown as {
      __options?: { requireCapabilities?: string[]; requireWorkspace?: boolean };
    }).__options;
    expect(options?.requireCapabilities).toContain("owner:view");
    expect(options?.requireWorkspace).toBe(true);
  });
});

// ─── 3. Response shape ────────────────────────────────────────────────────────

describe("[module-18] GET /api/owner/local-mode/status — response shape", () => {
  it("includes all expected top-level keys", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result).toHaveProperty("workspaceId");
    expect(result).toHaveProperty("localModeActive");
    expect(result).toHaveProperty("storageProvider");
    expect(result).toHaveProperty("schedulerProvider");
    expect(result).toHaveProperty("capabilities");
    expect(result).toHaveProperty("notes");
  });

  it("returns workspaceId from ctx.verifiedWorkspaceId", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx("ws-MY-TENANT")) as Record<string, unknown>;
    expect(result.workspaceId).toBe("ws-MY-TENANT");
  });

  it("capabilities is an object with expected keys", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as { capabilities: Record<string, boolean> };
    expect(result.capabilities).toHaveProperty("offlineStorage");
    expect(result.capabilities).toHaveProperty("inMemoryScheduler");
    expect(result.capabilities).toHaveProperty("privateRoleAccess");
  });
});

// ─── 4. Provider resolution ───────────────────────────────────────────────────

describe("[module-18] local-mode/status — storage provider resolution", () => {
  it("resolves 'local' for STORAGE_PROVIDER=local", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.storageProvider).toBe("local");
  });

  it("resolves 's3' for STORAGE_PROVIDER=s3", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.storageProvider).toBe("s3");
  });

  it("resolves 'unknown' for unrecognised STORAGE_PROVIDER", async () => {
    process.env.STORAGE_PROVIDER = "my-custom-storage";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.storageProvider).toBe("unknown");
  });

  it("resolves 'unknown' when STORAGE_PROVIDER is unset", async () => {
    delete process.env.STORAGE_PROVIDER;
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.storageProvider).toBe("unknown");
  });
});

describe("[module-18] local-mode/status — scheduler provider resolution", () => {
  it("resolves 'in-memory' for SCHEDULER_PROVIDER=in-memory", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.schedulerProvider).toBe("in-memory");
  });

  it("resolves 'redis' for SCHEDULER_PROVIDER=redis", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "redis";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.schedulerProvider).toBe("redis");
  });

  it("resolves 'unknown' for unrecognised SCHEDULER_PROVIDER", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "custom-scheduler";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.schedulerProvider).toBe("unknown");
  });

  it("resolves 'unknown' when SCHEDULER_PROVIDER is unset", async () => {
    process.env.STORAGE_PROVIDER = "local";
    delete process.env.SCHEDULER_PROVIDER;
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.schedulerProvider).toBe("unknown");
  });
});

// ─── 5. localModeActive flag ──────────────────────────────────────────────────

describe("[module-18] local-mode/status — localModeActive flag", () => {
  it("true when STORAGE_PROVIDER=local AND SCHEDULER_PROVIDER=in-memory", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.localModeActive).toBe(true);
  });

  it("false when STORAGE_PROVIDER=s3 even if scheduler is in-memory", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.localModeActive).toBe(false);
  });

  it("false when SCHEDULER_PROVIDER=redis even if storage is local", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "redis";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.localModeActive).toBe(false);
  });

  it("false when both providers are unknown (unset)", async () => {
    delete process.env.STORAGE_PROVIDER;
    delete process.env.SCHEDULER_PROVIDER;
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect(result.localModeActive).toBe(false);
  });
});

// ─── 6. Capabilities object ───────────────────────────────────────────────────

describe("[module-18] local-mode/status — capabilities object", () => {
  it("offlineStorage=true when storageProvider=local", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "redis";
    const result = await GET(makeCtx()) as { capabilities: Record<string, boolean> };
    expect(result.capabilities.offlineStorage).toBe(true);
  });

  it("offlineStorage=false when storageProvider=s3", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as { capabilities: Record<string, boolean> };
    expect(result.capabilities.offlineStorage).toBe(false);
  });

  it("inMemoryScheduler=true when schedulerProvider=in-memory", async () => {
    process.env.STORAGE_PROVIDER = "s3";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as { capabilities: Record<string, boolean> };
    expect(result.capabilities.inMemoryScheduler).toBe(true);
  });

  it("inMemoryScheduler=false when schedulerProvider=redis", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "redis";
    const result = await GET(makeCtx()) as { capabilities: Record<string, boolean> };
    expect(result.capabilities.inMemoryScheduler).toBe(false);
  });

  it("privateRoleAccess is always true (DB-backed, always available)", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as { capabilities: Record<string, boolean> };
    expect(result.capabilities.privateRoleAccess).toBe(true);
  });
});

// ─── 7. Tenant isolation ─────────────────────────────────────────────────────

describe("[module-18] local-mode/status — tenant isolation", () => {
  it("different workspace IDs produce different workspaceId in result", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const r1 = await GET(makeCtx("ws-ALICE")) as Record<string, unknown>;
    const r2 = await GET(makeCtx("ws-BOB")) as Record<string, unknown>;
    expect(r1.workspaceId).toBe("ws-ALICE");
    expect(r2.workspaceId).toBe("ws-BOB");
  });

  it("is pure — same env produces same localModeActive every call", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const r1 = await GET(makeCtx()) as Record<string, unknown>;
    const r2 = await GET(makeCtx()) as Record<string, unknown>;
    expect(r1.localModeActive).toBe(r2.localModeActive);
  });
});

// ─── 8. Notes field ──────────────────────────────────────────────────────────

describe("[module-18] local-mode/status — notes field", () => {
  it("notes mentions 'local mode' when localModeActive=true", async () => {
    process.env.STORAGE_PROVIDER = "local";
    process.env.SCHEDULER_PROVIDER = "in-memory";
    const result = await GET(makeCtx()) as Record<string, unknown>;
    expect((result.notes as string).toLowerCase()).toContain("local mode");
  });

  it("notes is non-empty for all configurations", async () => {
    for (const [storage, scheduler] of [["local", "redis"], ["s3", "in-memory"], ["unknown", "unknown"]] as const) {
      process.env.STORAGE_PROVIDER = storage;
      process.env.SCHEDULER_PROVIDER = scheduler;
      const result = await GET(makeCtx()) as Record<string, unknown>;
      expect(typeof result.notes).toBe("string");
      expect((result.notes as string).length).toBeGreaterThan(0);
    }
  });
});
