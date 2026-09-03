/**
 * Stage 7 — owner email is never written into signed evidence.
 *
 * S7-I4, S7-I5 and S7-I10-LANE_C authenticate as the owner to make their
 * observations. Wiring PROBE_OWNER_EMAIL (PR-G2) made that address reachable, and
 * three of the probes printed it verbatim:
 *
 *   console.log(`PROBE_OWNER_EMAIL: ${OWNER_EMAIL || "(not set)"}`)          x3
 *   record("login_response_user_email", body.user?.email, …)                 S7-I4
 *
 * Everything a probe prints becomes the raw observation, which is hashed, signed,
 * committed to the artifacts directory and carried in an evidence PR. So the
 * owner's address would have been permanently embedded in signed governance
 * evidence — a disclosure none of the three invariants requires.
 *
 * Owner decision: DO_NOT_INCLUDE_OWNER_EMAIL_VERBATIM_IN_SIGNED_EVIDENCE.
 *
 * The assertion S7-I4 actually needs is "the account that logged in is the
 * configured owner". That is a comparison, and a comparison is evidenced by its
 * outcome, so the binding is still asserted — it is the identifier that is gone.
 * These tests pin both halves: the address never appears, and the binding still
 * fails when identity does not match.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const PROBES = {
  "S7-I4": "scripts/stage7-probes/s7-i4-auth-check.mjs",
  "S7-I5": "scripts/stage7-probes/s7-i5-boundary-check.mjs",
  "S7-I10-LANE_C": "scripts/stage7-probes/s7-i10-audit-check-lane-c.mjs",
} as const;

const SENTINEL_EMAIL = "sentinel-owner-stage7@example.invalid";
const SENTINEL_PASSWORD = "SENTINEL_PW_redaction_zz9";

/** A stub deployment. `returnedEmail` is what /api/auth/login reports back. */
const STUB = `
import { createServer } from "node:http";
const RETURNED = process.env.STUB_RETURNED_EMAIL;
const srv = createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const j = (o, c = 200, h = {}) => {
      res.writeHead(c, { "content-type": "application/json", ...h });
      res.end(JSON.stringify(o));
    };
    if (req.url.startsWith("/api/auth/login")) {
      let p = {};
      try { p = JSON.parse(b); } catch {}
      if (p.password && p.password.startsWith("wrong")) return j({ error: "Invalid" }, 401);
      return j(
        { user: { id: "u1", email: RETURNED, workspaceId: "w1" } },
        200,
        { "set-cookie": "opsiq_session=tok_abcdef123456; HttpOnly; SameSite=Lax; Path=/" },
      );
    }
    if (req.url.startsWith("/api/health"))
      return j({ status: "healthy", timestamp: "t", checks: { database: { status: "healthy" } } });
    if (req.url.startsWith("/api/auth/logout")) return j({ success: true });
    return j({ error: "not found" }, 404);
  });
});
srv.listen(0, "127.0.0.1", () => console.log("PORT=" + srv.address().port));
`;

let stub: ReturnType<typeof spawn>;
let baseUrl = "";

async function startStub(returnedEmail: string): Promise<void> {
  stub = spawn("node", ["--input-type=module", "-e", STUB], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, STUB_RETURNED_EMAIL: returnedEmail },
  });
  baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stub did not start")), 20000);
    stub.stdout?.on("data", (chunk: Buffer) => {
      const m = /PORT=(\d+)/.exec(chunk.toString());
      if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); }
    });
  });
}

function runProbe(probe: string): string {
  const r = spawnSync("node", [join(REPO_ROOT, probe)], {
    encoding: "utf-8",
    timeout: 60000,
    env: {
      PATH: process.env.PATH ?? "",
      DEPLOYMENT_ID: "dpl_fixture",
      PROBE_BASE_URL: baseUrl,
      PROBE_OWNER_EMAIL: SENTINEL_EMAIL,
      PROBE_OWNER_PASSWORD: SENTINEL_PASSWORD,
    },
  });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

beforeAll(async () => { await startStub(SENTINEL_EMAIL); }, 30000);
afterAll(() => { stub?.kill(); });

describe("owner email never reaches the observation", () => {
  it.each(Object.entries(PROBES))(
    "%s emits no owner identifier",
    (_invariant, probe) => {
      const out = runProbe(probe);
      // The whole address, its local part, and its domain are all identifiers.
      expect(out).not.toContain(SENTINEL_EMAIL);
      expect(out).not.toContain("sentinel-owner-stage7");
      expect(out).not.toContain("@example.invalid");
      // The password was never printed and must stay that way.
      expect(out).not.toContain(SENTINEL_PASSWORD);
    },
  );

  it.each(Object.entries(PROBES))(
    "%s still reports whether the owner credential is configured",
    (_invariant, probe) => {
      expect(runProbe(probe)).toMatch(/PROBE_OWNER_EMAIL: (set|not set)/);
    },
  );

  it("no probe source prints the owner email value", () => {
    for (const probe of Object.values(PROBES)) {
      const src = readFileSync(join(REPO_ROOT, probe), "utf-8");
      // Forbid interpolations that can evaluate TO the address —
      // `${OWNER_EMAIL}` and `${OWNER_EMAIL || "…"}`. A presence-only ternary
      // such as `${OWNER_EMAIL ? "set" : "not set"}` discloses nothing and is
      // how the probes report configuration, so it stays allowed.
      expect(src, probe).not.toMatch(/\$\{\s*OWNER_EMAIL\s*(\}|\|\|)/);
      expect(src, probe).not.toMatch(/record\([^)]*,\s*OWNER_EMAIL\b/);
      expect(src, probe).not.toMatch(/record\([^)]*body\.user\?\.email\s*\?\?/);
    }
  });
});

describe("the owner-identity assertion is preserved, not dropped", () => {
  it("S7-I4 asserts the logged-in account matches the configured owner", async () => {
    const out = runProbe(PROBES["S7-I4"]);
    expect(out).toContain("login_response_user_has_email");
    expect(out).toContain("login_response_user_matches_configured_owner");
    expect(out).toMatch(/\[PASS\] login_response_user_matches_configured_owner: true/);
  });

  it("S7-I4 fails that assertion when the account is a different identity", async () => {
    stub?.kill();
    await startStub("someone-else@example.invalid");
    const out = runProbe(PROBES["S7-I4"]);
    expect(out).toMatch(/\[FAIL\] login_response_user_matches_configured_owner: false/);
    // The mismatching identity must not be disclosed either.
    expect(out).not.toContain("someone-else@example.invalid");
    stub?.kill();
    await startStub(SENTINEL_EMAIL);
  }, 60000);
});
