/* eslint-disable @typescript-eslint/no-explicit-any -- injected fake I/O for a plain ESM script */
/**
 * Enable/disable tool: fail-closed preflights, dry-run with zero mutations, exact-SHA Git deployment,
 * Production-only scope, secret hygiene. Pure fakes only: nothing here contacts Vercel, Paddle or a database.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import * as tool from "../../../scripts/release/lib/paywall-release.mjs";

const SHA = "a".repeat(40);
const PRICE = "pri_01live";
const goodManifest = { paddleDomainApproved: true, paddleApprovalEvidence: "ticket-1", approvedBy: "owner", approvedAt: "2026-10-24T00:00:00Z", expectedMainSha: SHA, livePriceId: PRICE, ownerDecisionsResolved: true, knownReleaseBlockers: [] };

function makeIo(over: any = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const envRecords = over.envRecords ?? [
    { id: "e1", key: "PADDLE_ENV", target: ["production"] },
    { id: "e2", key: "PADDLE_API_KEY", target: ["production"] },
    { id: "e3", key: "PADDLE_PRICE_ID", target: ["production"] },
    { id: "e4", key: "PADDLE_WEBHOOK_SECRET", target: ["production"] },
    { id: "e5", key: "PADDLE_CLIENT_TOKEN", target: ["production"] },
  ];
  const values: Record<string, string> = { e1: "live", e3: PRICE, ...(over.values ?? {}) };
  const io: any = {
    env: { VERCEL_TOKEN: "tok_secret_value_123", DATABASE_URL: `postgresql://u:pw@${tool.EXPECTED_PRODUCTION_DB_HOST}/db`, ...(over.env ?? {}) },
    state: {},
    git: (a: string[]) => {
      const k = a.join(" ");
      if (over.git?.[k] !== undefined) return over.git[k];
      if (k === "remote get-url origin") return "https://github.com/arnab-netizen/OPsIq";
      if (k === "status --porcelain") return "";
      if (k === "rev-parse HEAD" || k === "rev-parse origin/main") return `${SHA}\n`;
      return "";
    },
    readFile: (p: string) => (p === "m.json" ? JSON.stringify(over.manifest ?? goodManifest) : p.endsWith("RELEASE_BLOCKERS.json") ? JSON.stringify({ open: over.blockers ?? [] }) : null),
    sleep: async () => undefined,
    http: async (url: string) => {
      if (url.endsWith("/api/health")) return { status: 200, text: "{}" };
      if (url.endsWith("/api/readiness")) return { status: 200, text: JSON.stringify({ is_ready: over.ready ?? true, startup_complete: true, database_healthy: true }) };
      if (url.endsWith("/api/internal/build-info")) return { status: 200, text: JSON.stringify({ commit: over.servedSha ?? SHA, environment: "production" }) };
      if (url.endsWith("/pricing")) return { status: 200, text: over.pricingText ?? "US$ 19 per month" };
      if (url.endsWith("/pay")) return { status: 200, text: over.payText ?? "Checkout" };
      return { status: 404, text: "" };
    },
    vercel: async (method: string, path: string, body?: any) => {
      calls.push({ method, path, body });
      if (method === "GET" && path.startsWith("/v10/projects/") && path.includes("/env?")) {
        return { status: 200, json: { envs: [...envRecords, ...(over.flagRecords ?? [])] } };
      }
      const m = /\/v1\/projects\/[^/]+\/env\/([^?]+)/.exec(path);
      if (method === "GET" && m) return { status: 200, json: { value: values[m[1]] ?? "" } };
      if (method === "POST" && path.startsWith("/v13/deployments")) return over.deployCreate ?? { status: 200, json: { id: "dpl_1" } };
      if (method === "GET" && path.startsWith("/v13/deployments/")) return { status: 200, json: over.deployState ?? { readyState: "READY", target: "production", gitSource: { sha: SHA } } };
      return { status: 200, json: {} };
    },
    db: async () => over.dbRows ?? [{ active: true }],
  };
  return { io, calls, mutations: () => calls.filter((c) => c.method !== "GET") };
}
const enableArgs = (extra: any = {}) => tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.enable}`, "--production-url=https://app.example.test", "--manifest=m.json", ...(extra.dry ? ["--dry-run"] : [])]);
const disableArgs = (dry = false) => tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.disable}`, "--production-url=https://app.example.test", ...(dry ? ["--dry-run"] : [])]);

describe("argument validation", () => {
  it("requires an exact 40-hex SHA and the exact confirmation phrase", () => {
    expect(tool.validateArgs("enable", tool.parseArgs(["--expected-main-sha=abc", "--confirm=nope", "--production-url=https://x.test"]))).toHaveLength(3);
    expect(tool.validateArgs("enable", enableArgs())).toEqual([]);
    expect(tool.validateArgs("disable", disableArgs())).toEqual([]);
    expect(tool.validateArgs("disable", tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.enable}`, "--production-url=https://x.test"]))).toHaveLength(1);
    expect(tool.validateArgs("enable", tool.parseArgs([`--expected-main-sha=${SHA.toUpperCase()}`, `--confirm=${tool.CONFIRM.enable}`, "--production-url=https://x.test", "--manifest=m"]))).toHaveLength(1);
  });
  it("rejects unknown arguments and a missing manifest for enable", () => {
    expect(tool.validateArgs("enable", tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.enable}`, "--production-url=https://x.test", "--force"]))).toHaveLength(2);
  });
});

describe("manifest", () => {
  it("accepts a complete approval record and rejects each missing proof", () => {
    expect(tool.validateManifest(goodManifest, { expectedSha: SHA })).toEqual([]);
    for (const [k, v] of [["paddleDomainApproved", false], ["paddleApprovalEvidence", ""], ["approvedBy", ""], ["approvedAt", "x"], ["expectedMainSha", "b".repeat(40)], ["livePriceId", "sandbox"], ["ownerDecisionsResolved", false], ["knownReleaseBlockers", ["x"]]] as const) {
      expect(tool.validateManifest({ ...goodManifest, [k]: v }, { expectedSha: SHA }).length, k).toBeGreaterThan(0);
    }
  });
});

describe("request construction", () => {
  it("deploys the exact commit from Git, production target, never uploaded files", () => {
    const r = tool.buildDeploymentRequest({ projectId: "prj_1", teamSlug: "t", sha: SHA });
    expect(r.body.target).toBe("production");
    expect(r.body.gitSource).toEqual({ type: "github", org: "arnab-netizen", repo: "OPsIq", ref: "main", sha: SHA });
    expect(r.body.files).toBeUndefined();
  });
  it("scopes the flag to Production only", () => {
    expect(tool.buildEnvRequest({ projectId: "p", teamSlug: "t", existing: null, value: "on" }).body.target).toEqual(["production"]);
    const patch = tool.buildEnvRequest({ projectId: "p", teamSlug: "t", existing: { id: "e9" }, value: "off" });
    expect(patch.method).toBe("PATCH");
    expect(patch.body.target).toEqual(["production"]);
  });
});

describe("enable: preflights fail closed", () => {
  const refuses = async (over: any, id: RegExp, args = enableArgs()) => {
    const { io, mutations } = makeIo(over);
    const out = await tool.execute("enable", args, io);
    expect(out.exitCode).toBe(1);
    expect(out.lines.join("\n")).toMatch(id);
    expect(out.lines.join("\n")).toMatch(/REFUSED/);
    expect(mutations()).toHaveLength(0);
  };
  it("wrong repository", () => refuses({ git: { "remote get-url origin": "https://github.com/evil/OPsIq" } }, /FAIL .*1 repository identity/));
  it("dirty tree", () => refuses({ git: { "status --porcelain": " M a.ts\n" } }, /FAIL .*2 clean working tree/));
  it("origin/main moved", () => refuses({ git: { "rev-parse origin/main": `${"b".repeat(40)}\n` } }, /FAIL .*3 origin\/main/));
  it("Production not ready (readiness includes migration currency)", () => refuses({ ready: false }, /FAIL .*7 production readiness/));
  it("Production serving a different commit", () => refuses({ servedSha: "c".repeat(40) }, /FAIL .*8 deployment corresponds/));
  it("price still to be announced", () => refuses({ pricingText: "The price is to be announced." }, /FAIL .*9 pricing/));
  it("/pay unavailable", () => refuses({ payText: "Payments are not available right now." }, /FAIL .*10 \/pay/));
  it("missing commercial config", () => refuses({ envRecords: [{ id: "e1", key: "PADDLE_ENV", target: ["production"] }] }, /FAIL .*11 commercial config/));
  it("PADDLE_ENV not live", () => refuses({ values: { e1: "sandbox" } }, /FAIL .*13 PADDLE_ENV/));
  it("price id differs from the approved manifest", () => refuses({ values: { e3: "pri_other" } }, /FAIL .*14 live PADDLE_PRICE_ID/));
  it("plan not seeded", () => refuses({ dbRows: [] }, /FAIL .*15 Plan seeded/));
  it("database host is not Production", () => refuses({ env: { DATABASE_URL: "postgresql://u:pw@ep-empty-dream-b42d996f.example/db" } }, /FAIL .*15 Plan seeded/));
  it("open release blockers", () => refuses({ blockers: ["owner decision"] }, /FAIL .*16 no known release blocker/));
  it("paywall already ON", () => refuses({ flagRecords: [{ id: "f1", key: tool.FLAG, target: ["production"] }], values: { f1: "on" } }, /FAIL .*5 flag state/));
  it("flag present on a non-production target", () => refuses({ flagRecords: [{ id: "f1", key: tool.FLAG, target: ["production", "preview"] }], values: { f1: "off" } }, /FAIL .*5 flag state/));
  it("no Vercel token", () => refuses({ env: { VERCEL_TOKEN: "" } }, /FAIL .*4 Vercel project reachable/));
  it("incomplete manifest", () => refuses({ manifest: { ...goodManifest, paddleDomainApproved: false } }, /FAIL .*12 Paddle approval manifest/));
});

describe("dry run", () => {
  it("performs zero mutations and prints the exact two planned requests without any secret", async () => {
    const { io, calls, mutations } = makeIo();
    const out = await tool.execute("enable", enableArgs({ dry: true }), io);
    const text = out.lines.join("\n");
    expect(mutations()).toHaveLength(0);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(text).toMatch(/DRY RUN: zero mutations/);
    expect(text).toContain(SHA);
    expect(text).not.toContain("tok_secret_value_123");
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect((text.match(/^\s+[12]\. (POST|PATCH) /gm) ?? []).length).toBe(2);
  });
  it("without a token it skips Vercel-backed checks, reports them, still mutates nothing", async () => {
    const { io, mutations } = makeIo({ env: { VERCEL_TOKEN: "", DATABASE_URL: "" } });
    const out = await tool.execute("enable", enableArgs({ dry: true }), io);
    expect(out.lines.join("\n")).toMatch(/SKIPPED/);
    expect(mutations()).toHaveLength(0);
  });
  it("a real run never proceeds while any check is skipped", async () => {
    const { io, mutations } = makeIo({ env: { DATABASE_URL: "" } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(mutations()).toHaveLength(0);
  });
});

describe("enable: execution", () => {
  it("makes exactly two Production mutations in order, deploys the exact commit and verifies it is served", async () => {
    const { io, mutations } = makeIo();
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(0);
    const m = mutations();
    expect(m).toHaveLength(2);
    expect(m[0].path).toMatch(/\/env/);
    expect(m[0].body).toMatchObject({ value: "on", target: ["production"] });
    expect(m[1].path).toMatch(/\/v13\/deployments/);
    expect(m[1].body.gitSource.sha).toBe(SHA);
    expect(out.lines.join("\n")).toMatch(/PRODUCTION_PAYMENT_GATE_ENABLED=YES/);
    expect(out.lines.join("\n")).not.toContain("tok_secret_value_123");
  });
  it("if the deployment fails after the flag was set, the flag is restored (compensation)", async () => {
    const { io, mutations } = makeIo({ flagRecords: [{ id: "f1", key: tool.FLAG, target: ["production"] }], values: { f1: "off" }, deployCreate: { status: 500, json: null } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    const m = mutations();
    expect(m.filter((c) => c.path.includes("/env/f1"))).toHaveLength(2);
    expect(m[m.length - 1].body.value).toBe("off");
    expect(out.lines.join("\n")).toMatch(/COMPENSATED/);
  });
  it("a READY deployment of a different commit is a failure, not a success", async () => {
    const { io } = makeIo({ deployState: { readyState: "READY", target: "production", gitSource: { sha: "d".repeat(40) } } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(out.lines.join("\n")).toMatch(/not the exact production commit/);
  });
});

describe("disable (emergency rollback)", () => {
  const on = { flagRecords: [{ id: "f1", key: tool.FLAG, target: ["production"] }], values: { f1: "on" } };
  it("needs no Paddle manifest, price or database; flips the flag off and redeploys the exact SHA", async () => {
    const { io, mutations } = makeIo({ ...on, env: { DATABASE_URL: "" } });
    const out = await tool.execute("disable", disableArgs(), io);
    expect(out.exitCode).toBe(0);
    const m = mutations();
    expect(m).toHaveLength(2);
    expect(m[0].body).toMatchObject({ value: "off", target: ["production"] });
    expect(m[1].body.gitSource.sha).toBe(SHA);
    expect(out.lines.join("\n")).toMatch(/PRODUCTION_PAYMENT_GATE_ENABLED=NO/);
  });
  it("refuses when the paywall is not on", async () => {
    const { io, mutations } = makeIo({ flagRecords: [{ id: "f1", key: tool.FLAG, target: ["production"] }], values: { f1: "off" } });
    const out = await tool.execute("disable", disableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(mutations()).toHaveLength(0);
  });
  it("refuses a SHA that is not on origin/main", async () => {
    const { io, mutations } = makeIo(on);
    io.git = (a: string[]) => { if (a[0] === "merge-base") throw new Error("not ancestor"); return a.join(" ") === "remote get-url origin" ? "https://github.com/arnab-netizen/OPsIq" : a.join(" ") === "status --porcelain" ? "" : `${SHA}\n`; };
    const out = await tool.execute("disable", disableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(mutations()).toHaveLength(0);
  });
  it("dry run changes nothing", async () => {
    const { io, mutations } = makeIo(on);
    const out = await tool.execute("disable", disableArgs(true), io);
    expect(mutations()).toHaveLength(0);
    expect(out.lines.join("\n")).toMatch(/DRY RUN: zero mutations/);
  });
});

describe("secret hygiene", () => {
  it("redact removes tokens, bearer headers and connection strings", () => {
    const t = tool.redact("Authorization: Bearer tok_secret_value_123 url postgresql://u:pw@h/db tok_secret_value_123", ["tok_secret_value_123"]);
    expect(t).not.toContain("tok_secret_value_123");
    expect(t).not.toMatch(/postgresql:\/\/u:pw/);
  });
});
