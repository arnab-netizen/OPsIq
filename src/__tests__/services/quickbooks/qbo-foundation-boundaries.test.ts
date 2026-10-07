/**
 * Machine-checked scope boundaries for the QuickBooks read-only provider/OAuth foundation.
 * These fail if a later change quietly widens the slice (writes, persistence, routes, UI, a second
 * crypto implementation, sync or scheduler registration) instead of doing it in its own reviewed PR.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createQboReadClient } from "@/services/quickbooks/qbo-client";
import { resolveQboConfig } from "@/domain/quickbooks/qbo-config";

const ROOT = process.cwd();
const QBO_DIRS = ["src/domain/quickbooks", "src/services/quickbooks"];

function sourceFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => join(dir, f));
}
const qboFiles = QBO_DIRS.flatMap(sourceFiles);

/** Source with comments removed, so documentation can describe what the code must NOT do. */
function code(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name === ".next") continue;
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

describe("QuickBooks foundation boundaries", () => {
  it("the provider code exists (guards the scans below against matching nothing)", () => {
    expect(qboFiles.length).toBeGreaterThanOrEqual(7);
  });

  it("QBO_CLIENT_WRITE_SURFACE=NONE: the API client issues only GET and exposes only read methods", () => {
    const clientSrc = code("src/services/quickbooks/qbo-client.ts");
    expect(clientSrc).toMatch(/method:\s*"GET"/);
    expect(clientSrc).not.toMatch(/method:\s*["'`](POST|PUT|PATCH|DELETE)/i);
    expect(clientSrc).not.toMatch(/operation=(delete|void|update)|sparse|\/batch|requestid/i);

    const r = resolveQboConfig({
      QUICKBOOKS_CLIENT_ID: "id",
      QUICKBOOKS_CLIENT_SECRET: "secret",
      QUICKBOOKS_REDIRECT_URI: "https://app.opsiq.example/cb",
      QUICKBOOKS_ENVIRONMENT: "sandbox",
    });
    if (!r.available) throw new Error("config");
    const client = createQboReadClient({ config: r.config, realmId: "123456", getAccessToken: async () => "t" });
    expect(Object.keys(client).sort()).toEqual(["companyInfo", "paginate", "query", "readEntity", "realmId", "report"]);
    expect(Object.keys(client).some((k) => /create|update|delete|void|post|put|patch|write|batch|upsert/i.test(k))).toBe(false);
  });

  it("only the OAuth service performs POSTs, and only to the fixed Intuit OAuth endpoints", () => {
    for (const f of qboFiles) {
      const src = code(f);
      const hasPost = /method:\s*"POST"/.test(src);
      expect(hasPost, f).toBe(f.endsWith("qbo-oauth.service.ts"));
    }
    const oauth = code("src/services/quickbooks/qbo-oauth.service.ts");
    expect(oauth).toContain("config.tokenUrl");
    expect(oauth).toContain("config.revokeUrl");
  });

  it("GENERIC_OAUTH_CRYPTO_REUSED=YES: no second encryption implementation", () => {
    for (const f of qboFiles) {
      expect(code(f), f).not.toMatch(/createCipheriv|createDecipheriv|hkdfSync|aes-256|scryptSync|pbkdf2/i);
    }
    expect(code("src/services/quickbooks/qbo-oauth.service.ts")).toContain('from "@/services/external-systems/oauth-token.service"');
  });

  it("NO persistence: no database, Prisma or ORM access", () => {
    for (const f of qboFiles) {
      const src = code(f);
      expect(src, f).not.toMatch(/@\/lib\/db|@\/generated\/prisma|@prisma\/client|\bdb\.\w+\./);
      expect(src, f).not.toMatch(/\$queryRaw|\$executeRaw|\$transaction/);
    }
  });

  it("config reads no environment itself (callers pass the env), and nothing logs", () => {
    for (const f of qboFiles) {
      expect(code(f), f).not.toMatch(/process\.env/);
      expect(code(f), f).not.toMatch(/\bconsole\.|logger\./);
    }
  });

  it("OWNER_QBO_SURFACE=NONE: no routes, webhooks, owner pages or UI components for QuickBooks", () => {
    const offenders = [...walk("src/app"), ...walk("src/ui")].filter((p) => /quickbooks|qbo/i.test(p));
    expect(offenders).toEqual([]);
  });

  it("SYNC_IMPLEMENTED=NO / no scheduler registration", () => {
    expect(readFileSync(join(ROOT, "src/infra/scheduler-handlers.ts"), "utf8")).not.toMatch(/quickbooks|qbo/i);
    expect(readFileSync(join(ROOT, "src/services/scheduler/scheduler-producers.ts"), "utf8")).not.toMatch(/quickbooks|qbo/i);
    expect(qboFiles.filter((f) => /sync|materializ|evidence|webhook/i.test(f))).toEqual([]);
  });

  it("PRISMA_SCHEMA_CHANGE=NO: the schema carries no QuickBooks-specific persistence", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    for (const forbidden of ["external_account_id", "externalAccountId", "oauthStateHash", "oauth_state_hash", "refreshLockedUntil", "OwnerConnectorRecord", "OwnerConnectorWrite", "syncLeaseExpiresAt"]) {
      expect(schema, forbidden).not.toContain(forbidden);
    }
  });
});
