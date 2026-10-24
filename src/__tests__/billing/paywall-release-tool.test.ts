/* eslint-disable @typescript-eslint/no-explicit-any -- injected fake I/O for a plain ESM script */
/**
 * Enable/disable tool: fail-closed preflights, project identity, pinned Production origin, dry-run with zero
 * mutation, exact-SHA Git deployment, Production-only scope, VERIFIED compensation on every failure path, secret
 * hygiene. Stateful fakes only: nothing here contacts Vercel, Paddle or a database.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import * as tool from "../../../scripts/release/lib/paywall-release.mjs";

const SHA = "a".repeat(40);
const PRICE = "pri_01live";
const TOKEN = "tok_secret_value_123";
const ORIGIN = "https://opsiq.solutions";
const goodManifest = { paddleDomainApproved: true, paddleApprovalEvidence: "ticket-1", approvedBy: "owner", approvedAt: "2026-10-24T00:00:00Z", expectedMainSha: SHA, livePriceId: PRICE, ownerDecisionsResolved: true, knownReleaseBlockers: [] };

interface Rec { id: string; key: string; target: string[]; value: string; type?: string }

function makeIo(over: any = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const httpCalls: string[] = [];
  const store: Rec[] = [
    { id: "e1", key: "PADDLE_ENV", target: ["production"], value: "live" },
    { id: "e2", key: "PADDLE_API_KEY", target: ["production"], value: "" },
    { id: "e3", key: "PADDLE_PRICE_ID", target: ["production"], value: PRICE },
    { id: "e4", key: "PADDLE_WEBHOOK_SECRET", target: ["production"], value: "" },
    { id: "e5", key: "PADDLE_CLIENT_TOKEN", target: ["production"], value: "" },
    ...(over.flagRecords ?? []),
    ...(over.envRecords ?? []),
  ];
  for (const r of over.removeEnv ?? []) store.splice(store.findIndex((x) => x.key === r), 1);
  const project = over.project ?? { id: tool.PROJECT_ID, name: tool.PROJECT_NAME, link: { type: "github", org: "arnab-netizen", repo: "OPsIq" } };
  const domains = over.domains ?? [{ name: "opsiq.solutions", verified: true }];
  let deployFailureAfterEnvSet = false;
  const io: any = {
    env: { VERCEL_TOKEN: TOKEN, DATABASE_URL: `postgresql://u:pw@${tool.EXPECTED_PRODUCTION_DB_HOST}/db`, ...(over.env ?? {}) },
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
      httpCalls.push(url);
      if (new URL(url).origin !== ORIGIN) throw new Error(`request outside the pinned origin: ${url}`);
      if (url.endsWith("/api/health")) return { status: 200, text: "{}" };
      if (url.endsWith("/api/readiness")) return { status: 200, text: JSON.stringify({ is_ready: over.ready ?? true, startup_complete: true, database_healthy: true }) };
      if (url.endsWith("/api/internal/build-info")) return { status: 200, text: JSON.stringify({ commit: over.servedSha ?? SHA, environment: "production" }) };
      if (url.endsWith("/pricing")) return { status: 200, text: over.pricingText ?? "US$ 19 per month" };
      if (url.endsWith("/pay")) return { status: 200, text: over.payText ?? "Checkout" };
      return { status: 404, text: "" };
    },
    vercel: async (method: string, path: string, body?: any) => {
      calls.push({ method, path, body });
      const url = new URL(`https://x${path}`);
      const p = url.pathname;
      if (method === "GET" && p === `/v9/projects/${tool.PROJECT_ID}`) return { status: 200, json: project };
      if (method === "GET" && p === `/v9/projects/${tool.PROJECT_ID}/domains`) return { status: 200, json: { domains } };
      if (method === "GET" && p === `/v10/projects/${tool.PROJECT_ID}/env`) {
        if (over.failListAfterMutation && calls.some((c) => c.method !== "GET")) return { status: 500, json: null };
        return { status: 200, json: { envs: store.map(({ id, key, target }) => ({ id, key, target })) } };
      }
      let m = /^\/v1\/projects\/[^/]+\/env\/([^/]+)$/.exec(p);
      if (method === "GET" && m) { const r = store.find((x) => x.id === m![1]); return r ? { status: 200, json: { value: r.value } } : { status: 404, json: null }; }
      if (method === "POST" && p === `/v10/projects/${tool.PROJECT_ID}/env`) {
        if (over.failEnvCreate) return { status: 500, json: null };
        const rec = { id: "newflag", key: body.key, target: body.target, value: body.value, type: body.type };
        store.push(rec);
        return { status: 200, json: { created: { id: rec.id, key: rec.key, type: rec.type, visibility: "config" }, failed: [] } };
      }
      m = /^\/v9\/projects\/[^/]+\/env\/([^/]+)$/.exec(p);
      if (method === "PATCH" && m) {
        if (over.failPatchOn && over.failPatchOn(body, calls)) return { status: 500, json: null };
        const r = store.find((x) => x.id === m![1]);
        if (!r) return { status: 404, json: null };
        r.value = body.value ?? r.value;
        if (body.target) r.target = body.target;
        return { status: 200, json: {} };
      }
      if (method === "DELETE" && m) {
        if (over.failDelete) return { status: 500, json: null };
        const i = store.findIndex((x) => x.id === m![1]);
        if (i >= 0 && !over.silentDeleteNoop) store.splice(i, 1);
        return { status: 200, json: {} };
      }
      if (method === "POST" && p === "/v13/deployments") {
        deployFailureAfterEnvSet = true;
        return over.deployCreate ?? { status: 200, json: { id: "dpl_1" } };
      }
      if (method === "GET" && p.startsWith("/v13/deployments/")) return { status: 200, json: over.deployState ?? { readyState: "READY", target: "production", gitSource: { sha: SHA }, meta: { githubCommitSha: SHA } } };
      void deployFailureAfterEnvSet;
      return { status: 200, json: {} };
    },
    db: async () => over.dbRows ?? [{ active: true }],
  };
  return { io, calls, httpCalls, store, mutations: () => calls.filter((c) => c.method !== "GET") };
}
const flag = (store: Rec[]) => store.filter((r) => r.key === tool.FLAG);
const onRecord = (value: string): Rec => ({ id: "f1", key: tool.FLAG, target: ["production"], value });
const enableArgs = (extra: any = {}) => tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.enable}`, "--manifest=m.json", ...(extra.dry ? ["--dry-run"] : [])]);
const disableArgs = (dry = false) => tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.disable}`, ...(dry ? ["--dry-run"] : [])]);

describe("argument validation", () => {
  it("requires an exact 40-hex SHA and the exact confirmation phrase", () => {
    expect(tool.validateArgs("enable", tool.parseArgs(["--expected-main-sha=abc", "--confirm=nope"]))).toHaveLength(3);
    expect(tool.validateArgs("enable", enableArgs())).toEqual([]);
    expect(tool.validateArgs("disable", disableArgs())).toEqual([]);
    expect(tool.validateArgs("disable", tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.enable}`]))).toHaveLength(1);
    expect(tool.validateArgs("enable", tool.parseArgs([`--expected-main-sha=${SHA.toUpperCase()}`, `--confirm=${tool.CONFIRM.enable}`, "--manifest=m"]))).toHaveLength(1);
  });
  it("rejects unknown arguments and a missing manifest for enable", () => {
    expect(tool.validateArgs("enable", tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.enable}`, "--force"]))).toHaveLength(2);
  });
  it("the Production origin is pinned: any other --production-url is rejected, the pinned one is accepted", () => {
    for (const bad of ["https://app.example.test", "https://opsiq.solutions.evil.test", "http://opsiq.solutions", "https://www.opsiq.solutions", "https://opsiq.solutions@evil.test"]) {
      const a = tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.disable}`, `--production-url=${bad}`]);
      expect(tool.validateArgs("disable", a).join(" "), bad).toMatch(/pinned/);
    }
    const ok = tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.disable}`, `--production-url=${ORIGIN}/`]);
    expect(tool.validateArgs("disable", ok)).toEqual([]);
  });
  it("there is no --project-id override on the Production activation interface", () => {
    const a = tool.parseArgs([`--expected-main-sha=${SHA}`, `--confirm=${tool.CONFIRM.disable}`, "--project-id=prj_other"]);
    expect(tool.validateArgs("disable", a).join(" ")).toMatch(/unknown arguments/);
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

describe("request shapes (current Vercel REST contract)", () => {
  it("deploys the exact commit from Git, production target, never uploaded files", () => {
    const r = tool.buildDeploymentRequest({ projectId: tool.PROJECT_ID, teamSlug: "t", sha: SHA });
    expect(r.method).toBe("POST");
    expect(r.path).toMatch(/^\/v13\/deployments\?/);
    expect(r.path).toContain("forceNew=1");
    expect(r.body.target).toBe("production");
    expect(r.body.gitSource).toEqual({ type: "github", org: "arnab-netizen", repo: "OPsIq", ref: "main", sha: SHA });
    expect(r.body.files).toBeUndefined();
    expect(r.body.project).toBe(tool.PROJECT_ID);
    expect(r.body.name).toBe(tool.PROJECT_NAME);
  });
  it("creates the flag as an encrypted (Config) variable scoped to Production only, never sensitive/write-only", () => {
    const r = tool.buildEnvRequest({ projectId: "p", teamSlug: "t", existing: null, value: "on" });
    expect(r.method).toBe("POST");
    expect(r.path).toMatch(/^\/v10\/projects\/p\/env\?/);
    expect(r.body).toMatchObject({ key: tool.FLAG, value: "on", type: "encrypted", target: ["production"] });
  });
  it("edits by id on v9, keeps the record's own type, pins the target; deletes on v9", () => {
    const patch = tool.buildEnvRequest({ projectId: "p", teamSlug: "t", existing: { id: "e9" }, value: "off" });
    expect(patch.method).toBe("PATCH");
    expect(patch.path).toMatch(/^\/v9\/projects\/p\/env\/e9\?/);
    expect(patch.body).toEqual({ value: "off", target: ["production"] });
    const del = tool.buildEnvDeleteRequest({ projectId: "p", teamSlug: "t", id: "e9" });
    expect(del.method).toBe("DELETE");
    expect(del.path).toMatch(/^\/v9\/projects\/p\/env\/e9\?/);
  });
});

describe("project identity guard", () => {
  const refuses = async (over: any, re: RegExp) => {
    const { io, mutations } = makeIo(over);
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(out.lines.join("\n")).toMatch(re);
    expect(mutations()).toHaveLength(0);
  };
  it("refuses a project with a different id", () => refuses({ project: { id: "prj_other", name: tool.PROJECT_NAME, link: { type: "github", org: "arnab-netizen", repo: "OPsIq" } } }, /FAIL .*4 Vercel project identity.*id mismatch/));
  it("refuses a project with a different name", () => refuses({ project: { id: tool.PROJECT_ID, name: "someone-elses", link: { type: "github", org: "arnab-netizen", repo: "OPsIq" } } }, /name mismatch/));
  it("refuses a project linked to a different Git repository", () => refuses({ project: { id: tool.PROJECT_ID, name: tool.PROJECT_NAME, link: { type: "github", org: "evil", repo: "OPsIq" } } }, /linked Git repository mismatch/));
  it("refuses a project without link metadata", () => refuses({ project: { id: tool.PROJECT_ID, name: tool.PROJECT_NAME } }, /linked Git repository mismatch/));
  it("refuses when the pinned host is not a verified Production domain of the project", () => refuses({ domains: [{ name: "other.example", verified: true }] }, /not a verified Production domain/));
  it("refuses when the domain is unverified", () => refuses({ domains: [{ name: "opsiq.solutions", verified: false }] }, /not a verified Production domain/));
  it("refuses with no Vercel token", () => refuses({ env: { VERCEL_TOKEN: "" } }, /FAIL .*4 Vercel project identity.*VERCEL_TOKEN/));
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
  it("missing commercial config", () => refuses({ removeEnv: ["PADDLE_API_KEY", "PADDLE_CLIENT_TOKEN"] }, /FAIL .*11 commercial config/));
  it("PADDLE_ENV sandbox", async () => {
    const { io, store, mutations } = makeIo({});
    store.find((r) => r.key === "PADDLE_ENV")!.value = "sandbox";
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(out.lines.join("\n")).toMatch(/FAIL .*13 PADDLE_ENV/);
    expect(mutations()).toHaveLength(0);
  });
  it("price id differs from the approved manifest", async () => {
    const { io, store, mutations } = makeIo({});
    store.find((r) => r.key === "PADDLE_PRICE_ID")!.value = "pri_other";
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.lines.join("\n")).toMatch(/FAIL .*14 live PADDLE_PRICE_ID/);
    expect(mutations()).toHaveLength(0);
  });
  it("plan not seeded", () => refuses({ dbRows: [] }, /FAIL .*15 Plan seeded/));
  it("database host is not Production", () => refuses({ env: { DATABASE_URL: "postgresql://u:pw@ep-empty-dream-b42d996f.example/db" } }, /FAIL .*15 Plan seeded/));
  it("open release blockers", () => refuses({ blockers: ["owner decision"] }, /FAIL .*16 no known release blocker/));
  it("paywall already ON", () => refuses({ flagRecords: [onRecord("on")] }, /FAIL .*5 flag state/));
  it("flag present on a non-production target", () => refuses({ flagRecords: [{ ...onRecord("off"), target: ["production", "preview"] }] }, /FAIL .*5 flag state/));
  it("incomplete manifest", () => refuses({ manifest: { ...goodManifest, paddleDomainApproved: false } }, /FAIL .*12 Paddle approval manifest/));
  it("every HTTP check stays on the pinned origin", async () => {
    const { io, httpCalls } = makeIo({});
    await tool.execute("enable", enableArgs({ dry: true }), io);
    expect(httpCalls.length).toBeGreaterThan(0);
    expect(httpCalls.every((u) => new URL(u).origin === ORIGIN)).toBe(true);
  });
});

describe("dry run", () => {
  it("performs zero mutations and zero compensation, prints the exact two planned requests without any secret", async () => {
    const { io, calls, mutations } = makeIo();
    const out = await tool.execute("enable", enableArgs({ dry: true }), io);
    const text = out.lines.join("\n");
    expect(mutations()).toHaveLength(0);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(text).toMatch(/DRY RUN: zero mutations/);
    expect(text).toContain(SHA);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect((text.match(/^\s+[12]\. (POST|PATCH) /gm) ?? []).length).toBe(2);
    expect(text).toMatch(/delete the newly created record/);
  });
  it("describes restoring the previous value when the flag already exists", async () => {
    const { io } = makeIo({ flagRecords: [onRecord("off")] });
    const out = await tool.execute("enable", enableArgs({ dry: true }), io);
    expect(out.lines.join("\n")).toMatch(/restore the exact previous value/);
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

describe("enable: success path", () => {
  it("makes exactly two Production mutations in order, deploys the exact commit and verifies it is served", async () => {
    const { io, mutations, store } = makeIo();
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(0);
    const m = mutations();
    expect(m).toHaveLength(2);
    expect(m[0].path).toMatch(/\/env/);
    expect(m[0].body).toMatchObject({ value: "on", type: "encrypted", target: ["production"] });
    expect(m[1].path).toMatch(/\/v13\/deployments/);
    expect(m[1].body.gitSource.sha).toBe(SHA);
    expect(flag(store)).toMatchObject([{ value: "on" }]);
    expect(out.lines.join("\n")).toMatch(/PRODUCTION_PAYMENT_GATE_ENABLED=YES/);
    expect(out.lines.join("\n")).not.toContain(TOKEN);
  });
  it("a READY deployment of a different commit is a failure, never a success", async () => {
    const { io } = makeIo({ deployState: { readyState: "READY", target: "production", gitSource: { sha: "d".repeat(40) } } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(out.lines.join("\n")).toMatch(/not the exact production commit/);
    expect(out.lines.join("\n")).not.toMatch(/PRODUCTION_PAYMENT_GATE_ENABLED=YES/);
  });
  it("a deployment whose reported commits disagree is a failure", async () => {
    const { io } = makeIo({ deployState: { readyState: "READY", target: "production", gitSource: { sha: SHA }, meta: { githubCommitSha: "e".repeat(40) } } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
  });
  it("a READY deployment that does not report any commit is a failure", async () => {
    const { io } = makeIo({ deployState: { readyState: "READY", target: "production" } });
    expect((await tool.execute("enable", enableArgs(), io)).exitCode).toBe(1);
  });
  it("a READY deployment that is not the production target is a failure", async () => {
    const { io } = makeIo({ deployState: { readyState: "READY", target: "preview", gitSource: { sha: SHA } } });
    expect((await tool.execute("enable", enableArgs(), io)).exitCode).toBe(1);
  });
});

describe("enable: failure injection, compensation is verified and never leaves a latent ON", () => {
  const noLatentOn = (store: Rec[]) => expect(flag(store).every((r) => r.value !== "on")).toBe(true);

  it("A. existing flag = off, env update succeeds, deployment creation fails => restored to off", async () => {
    const { io, store, mutations } = makeIo({ flagRecords: [onRecord("off")], deployCreate: { status: 500, json: null } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toMatchObject([{ id: "f1", value: "off" }]);
    expect(out.lines.join("\n")).toMatch(/COMPENSATED: restored to its previous value \(off\)/);
    expect(out.lines.join("\n")).not.toMatch(/PRODUCTION_PAYMENT_GATE_ENABLED=YES/);
    expect(mutations().map((c) => c.method)).toEqual(["PATCH", "POST", "PATCH"]);
  });

  it("B. flag initially absent, created as on, deployment creation fails => the new record is deleted and verified absent", async () => {
    const { io, store, mutations } = makeIo({ deployCreate: { status: 500, json: null } });
    expect(flag(store)).toHaveLength(0);
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toHaveLength(0);
    expect(out.lines.join("\n")).toMatch(/COMPENSATED: the newly created Production record was deleted \(verified absent\)/);
    expect(mutations().map((c) => c.method)).toEqual(["POST", "POST", "DELETE"]);
    noLatentOn(store);
  });

  it("B2. deletion fails => falls back to setting off, verified", async () => {
    const { io, store } = makeIo({ deployCreate: { status: 500, json: null }, failDelete: true });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toMatchObject([{ value: "off" }]);
    expect(out.lines.join("\n")).toMatch(/COMPENSATED: the created record was set to "off" \(verified\)/);
    noLatentOn(store);
  });

  it("B3. deletion reports success but does not take effect => verification catches it and falls back to off", async () => {
    const { io, store } = makeIo({ deployCreate: { status: 500, json: null }, silentDeleteNoop: true });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toMatchObject([{ value: "off" }]);
    noLatentOn(store);
  });

  it("C. deployment created but becomes ERROR => same compensation", async () => {
    const { io, store } = makeIo({ deployState: { readyState: "ERROR" } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toHaveLength(0);
    expect(out.lines.join("\n")).toMatch(/FAILED step 2: deployment ERROR/);
    expect(out.lines.join("\n")).toMatch(/COMPENSATED/);
  });

  it("C2. deployment CANCELED with an existing off flag => restored to off", async () => {
    const { io, store } = makeIo({ flagRecords: [onRecord("off")], deployState: { readyState: "CANCELED" } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toMatchObject([{ value: "off" }]);
  });

  it("D. deployment READY but exact-SHA verification fails => same compensation", async () => {
    const { io, store } = makeIo({ deployState: { readyState: "READY", target: "production", gitSource: { sha: "d".repeat(40) } } });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toHaveLength(0);
    expect(out.lines.join("\n")).toMatch(/COMPENSATED/);
  });

  it("D2. deployment is the right commit but Production does not serve it => same compensation", async () => {
    const { io, store } = makeIo();
    let served = false;
    const base = io.http;
    io.http = async (u: string) => {
      if (u.endsWith("/api/internal/build-info") && store.some((r) => r.key === tool.FLAG)) { served = true; return { status: 200, text: JSON.stringify({ commit: "f".repeat(40), environment: "production" }) }; }
      return base(u);
    };
    const out = await tool.execute("enable", enableArgs(), io);
    expect(served).toBe(true);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toHaveLength(0);
  });

  it("E. compensation itself fails (delete and off both fail) => exit 3, UNCOMPENSATED_DANGER, no success message", async () => {
    const { io, store } = makeIo({ deployCreate: { status: 500, json: null }, failDelete: true, failPatchOn: () => true });
    const out = await tool.execute("enable", enableArgs(), io);
    const text = out.lines.join("\n");
    expect(out.exitCode).toBe(3);
    expect(text).toMatch(/UNCOMPENSATED_DANGER/);
    expect(text).not.toMatch(/COMPENSATED:/);
    expect(text).not.toMatch(/PRODUCTION_PAYMENT_GATE_ENABLED=YES/);
    expect(flag(store)).toMatchObject([{ value: "on" }]); // the danger is real and is reported, not hidden
  });

  it("E2. read-back is impossible after the failure => exit 3, not a false 'compensated'", async () => {
    const { io } = makeIo({ deployCreate: { status: 500, json: null }, failListAfterMutation: true });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(3);
    expect(out.lines.join("\n")).toMatch(/UNCOMPENSATED_DANGER/);
  });

  it("E3. existing flag: restoring fails => exit 3", async () => {
    const { io } = makeIo({ flagRecords: [onRecord("off")], deployCreate: { status: 500, json: null }, failPatchOn: (_b: any, calls: any[]) => calls.filter((c) => c.method === "PATCH").length >= 2 });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(3);
    expect(out.lines.join("\n")).toMatch(/UNCOMPENSATED_DANGER/);
  });

  it("env creation fails => nothing else is changed and no deployment is attempted", async () => {
    const { io, calls, store } = makeIo({ failEnvCreate: true });
    const out = await tool.execute("enable", enableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(calls.some((c) => c.path.startsWith("/v13/deployments") && c.method === "POST")).toBe(false);
    expect(flag(store)).toHaveLength(0);
  });

  it("F. dry run never compensates: zero mutations of any kind, even with a failing deployment configured", async () => {
    const { io, mutations, store } = makeIo({ deployCreate: { status: 500, json: null } });
    await tool.execute("enable", enableArgs({ dry: true }), io);
    expect(mutations()).toHaveLength(0);
    expect(flag(store)).toHaveLength(0);
  });
});

describe("disable (emergency rollback)", () => {
  // a fresh record per test: the fake store mutates records in place
  const mkOn = () => ({ flagRecords: [onRecord("on")] });
  it("needs no Paddle manifest, price or database; flips the flag off and redeploys the exact SHA", async () => {
    const { io, mutations, store } = makeIo({ ...mkOn(), env: { DATABASE_URL: "" } });
    const out = await tool.execute("disable", disableArgs(), io);
    expect(out.exitCode).toBe(0);
    const m = mutations();
    expect(m).toHaveLength(2);
    expect(m[0].body).toMatchObject({ value: "off", target: ["production"] });
    expect(m[1].body.gitSource.sha).toBe(SHA);
    expect(flag(store)).toMatchObject([{ value: "off" }]);
    expect(out.lines.join("\n")).toMatch(/PRODUCTION_PAYMENT_GATE_ENABLED=NO/);
  });
  it("refuses when the paywall is not on", async () => {
    const { io, mutations } = makeIo({ flagRecords: [onRecord("off")] });
    const out = await tool.execute("disable", disableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(mutations()).toHaveLength(0);
  });
  it("refuses a SHA that is not on origin/main", async () => {
    const { io, mutations } = makeIo(mkOn());
    io.git = (a: string[]) => { if (a[0] === "merge-base") throw new Error("not ancestor"); return a.join(" ") === "remote get-url origin" ? "https://github.com/arnab-netizen/OPsIq" : a.join(" ") === "status --porcelain" ? "" : `${SHA}\n`; };
    const out = await tool.execute("disable", disableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(mutations()).toHaveLength(0);
  });
  it("if its deploy fails the flag stays OFF (safe direction), a redeploy is demanded, and it is never re-enabled", async () => {
    const { io, store } = makeIo({ ...mkOn(), deployCreate: { status: 500, json: null } });
    const out = await tool.execute("disable", disableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(flag(store)).toMatchObject([{ value: "off" }]);
    expect(out.lines.join("\n")).toMatch(/REDEPLOY_REQUIRED/);
    expect(out.lines.join("\n")).not.toMatch(/PRODUCTION_PAYMENT_GATE_ENABLED=NO/);
  });
  it("also needs the project identity proof", async () => {
    const { io, mutations } = makeIo({ ...mkOn(), project: { id: tool.PROJECT_ID, name: "other", link: { type: "github", org: "arnab-netizen", repo: "OPsIq" } } });
    const out = await tool.execute("disable", disableArgs(), io);
    expect(out.exitCode).toBe(1);
    expect(mutations()).toHaveLength(0);
  });
  it("dry run changes nothing", async () => {
    const { io, mutations } = makeIo(mkOn());
    const out = await tool.execute("disable", disableArgs(true), io);
    expect(mutations()).toHaveLength(0);
    expect(out.lines.join("\n")).toMatch(/DRY RUN: zero mutations/);
  });
});

describe("secret hygiene", () => {
  it("redact removes tokens, bearer headers and connection strings", () => {
    const t = tool.redact(`Authorization: Bearer ${TOKEN} url postgresql://u:pw@h/db ${TOKEN}`, [TOKEN]);
    expect(t).not.toContain(TOKEN);
    expect(t).not.toMatch(/postgresql:\/\/u:pw/);
  });
  it("no output line of any run contains the token", async () => {
    for (const over of [{}, { deployCreate: { status: 500, json: null } }, { deployCreate: { status: 500, json: null }, failDelete: true, failPatchOn: () => true }]) {
      const { io } = makeIo(over);
      const out = await tool.execute("enable", enableArgs(), io);
      expect(out.lines.join("\n")).not.toContain(TOKEN);
    }
  });
});
