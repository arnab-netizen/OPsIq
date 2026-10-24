/**
 * Machine-checked scope boundaries for the QuickBooks Online V1 integration.
 * V1 is READ-ONLY: these fail if a later change adds a QuickBooks write, a second QuickBooks architecture, secrets/PII in
 * logs, a second crypto implementation, or widens the owner surface without its own reviewed change.
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
  return readdirSync(abs).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx")).map((f) => join(dir, f));
}
const qboFiles = QBO_DIRS.flatMap(sourceFiles);

/** Source with comments removed, so documentation can describe what the code must NOT do. */
function code(path: string): string {
  return readFileSync(join(ROOT, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
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

describe("QuickBooks V1 boundaries", () => {
  it("the QuickBooks code exists (guards the scans below against matching nothing)", () => {
    expect(qboFiles.length).toBeGreaterThanOrEqual(20);
  });

  it("QBO_CLIENT_WRITE_SURFACE=NONE: the API client issues only GET and exposes only read methods", () => {
    const clientSrc = code("src/services/quickbooks/qbo-client.ts");
    expect(clientSrc).toMatch(/method:\s*"GET"/);
    expect(clientSrc).not.toMatch(/method:\s*["'`](POST|PUT|PATCH|DELETE)/i);
    expect(clientSrc).not.toMatch(/operation=(delete|void|update)|sparse|\/batch|requestid/i);

    const r = resolveQboConfig({
      QUICKBOOKS_CLIENT_ID: "id", QUICKBOOKS_CLIENT_SECRET: "secret", QUICKBOOKS_REDIRECT_URI: "https://app.opsiq.example/cb", QUICKBOOKS_ENVIRONMENT: "sandbox",
    });
    if (!r.available) throw new Error("config");
    const client = createQboReadClient({ config: r.config, realmId: "123456", getAccessToken: async () => "t" });
    expect(Object.keys(client).sort()).toEqual(["companyInfo", "paginate", "query", "readEntity", "realmId", "report", "reportWithMeta"]);
    expect(Object.keys(client).some((k) => /create|update|delete|void|post|put|patch|write|batch|upsert/i.test(k))).toBe(false);
  });

  it("NO_QBO_WRITE_BACK: the only provider POSTs in the whole QuickBooks code are the OAuth token/revoke calls", () => {
    for (const f of qboFiles) {
      const src = code(f);
      expect(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(src), f).toBe(f.endsWith("qbo-oauth.service.ts"));
      expect(src, f).not.toMatch(/fetch\(\s*[^)]*method:\s*["'](PUT|PATCH|DELETE)/);
    }
    const oauth = code("src/services/quickbooks/qbo-oauth.service.ts");
    expect(oauth).toContain("config.tokenUrl");
    expect(oauth).toContain("config.revokeUrl");
    // sync/materialization reach QuickBooks only through the read client
    expect(code("src/services/quickbooks/qbo-sync.service.ts")).not.toMatch(/\bfetch\(|qboHttp\(/);
    expect(code("src/services/quickbooks/qbo-sync.service.ts")).toContain("createQboReadClient");
  });

  it("GENERIC_OAUTH_CRYPTO_REUSED=YES: no second encryption implementation", () => {
    for (const f of qboFiles) {
      expect(code(f), f).not.toMatch(/createCipheriv|createDecipheriv|hkdfSync|aes-256|scryptSync|pbkdf2/i);
    }
    expect(code("src/services/quickbooks/qbo-connection.service.ts")).toContain('from "@/services/external-systems/oauth-token.service"');
  });

  it("no source treats a 20-character / digits-only identifier as an Intuit rule", () => {
    for (const f of qboFiles) expect(code(f), f).not.toMatch(/\{1,\s*20\s*\}/);
    const ids = code("src/domain/quickbooks/qbo-identifiers.ts");
    expect(ids).toContain("OPSIQ_DEFENSIVE_BOUND");
    expect(ids).not.toContain("INTUIT_PROVIDER_MAX\"");
  });

  it("the domain is pure (no DB, network, env, clock-free logging) and the provider protocol modules are persistence-free", () => {
    for (const f of sourceFiles("src/domain/quickbooks")) {
      const src = code(f);
      expect(src, f).not.toMatch(/@\/lib\/db|@\/generated\/prisma|@prisma\/client|\bfetch\(|process\.env|\bconsole\.|logger\./);
    }
    for (const f of ["qbo-client.ts", "qbo-http.ts", "qbo-oauth.service.ts", "qbo-rate-limiter.ts", "qbo-connect-callback.service.ts"]) {
      expect(code(`src/services/quickbooks/${f}`), f).not.toMatch(/@\/lib\/db|@\/generated\/prisma|@prisma\/client|\bdb\.\w+\.|\$queryRaw|\$executeRaw|\$transaction/);
    }
  });

  it("no QuickBooks module reads process.env itself (callers pass the env) or uses console", () => {
    for (const f of qboFiles) {
      expect(code(f), f).not.toMatch(/process\.env/);
      expect(code(f), f).not.toMatch(/\bconsole\./);
    }
  });

  it("logs carry identifiers, counts and bounded codes only — never tokens, report values or provider bodies", () => {
    for (const f of qboFiles) {
      const src = code(f);
      for (const m of src.matchAll(/logger\.\w+\(([\s\S]*?)\);/g)) {
        expect(m[1], f).not.toMatch(/accessToken|refreshToken|clientSecret|bodyText|\.values\b|ColData|authorization/i);
      }
    }
  });

  it("OWNER_QBO_SURFACE: exactly the reviewed routes and pages (connect, callback API + callback page, status, disconnect, sync, webhook) and no other QuickBooks page/component", () => {
    const offenders = [...walk("src/app"), ...walk("src/ui"), ...walk("src/components")]
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => /quickbooks|qbo/i.test(p));
    expect(offenders.sort()).toEqual([
      "src/app/(authenticated)/owner/integrations/quickbooks/callback/page.tsx",
      "src/app/api/owner/integrations/quickbooks/callback/route.ts",
      "src/app/api/owner/integrations/quickbooks/connect/route.ts",
      "src/app/api/owner/integrations/quickbooks/disconnect/route.ts",
      "src/app/api/owner/integrations/quickbooks/status/route.ts",
      "src/app/api/owner/integrations/quickbooks/sync/route.ts",
      "src/app/api/webhooks/quickbooks/route.ts",
      "src/components/owner/QuickBooksConnectionCard.tsx",
    ]);
  });

  it("SYNC_REGISTERED: the single existing scheduler runs QuickBooks sync (handler + producer), with no second scheduler", () => {
    expect(readFileSync(join(ROOT, "src/infra/scheduler-handlers.ts"), "utf8")).toContain("TASK_NAME_QBO_SYNC");
    expect(readFileSync(join(ROOT, "src/app/api/internal/cron/scheduler/route.ts"), "utf8")).toContain("enqueueDueQboSyncTasks");
    for (const f of qboFiles) {
      expect(code(f), f).not.toMatch(/setInterval|node-cron|new CronJob|class \w*Scheduler\b/);
    }
  });

  it("LEGACY_QBO_PATH_CLOSED: the generic connector layer holds no QuickBooks connector registration", () => {
    const registry = readFileSync(join(ROOT, "src/domain/external-systems/provider-registry.ts"), "utf8");
    // The legacy CSV-export import template is the only QuickBooks reference allowed there, and it is an import template, not a connection.
    expect(registry).not.toMatch(/QUICKBOOKS:\s*\{[^}]*oauth/i);
  });

  it("PRISMA_SCHEMA: no legacy workspace-scoped QuickBooks persistence names", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    for (const forbidden of ["external_account_id", "externalAccountId", "oauthStateHash", "oauth_state_hash", "refreshLockedUntil", "OwnerConnectorRecord", "OwnerConnectorWrite", "syncLeaseExpiresAt"]) {
      expect(schema, forbidden).not.toContain(forbidden);
    }
  });

  describe("ONE_QBO_RUNTIME_PATH: nothing outside the governed flow can create or drive a QuickBooks connection", () => {
    const runtimeFiles = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("src/__tests__") && !f.startsWith("src/generated") && !/\.test\.tsx?$/.test(f));
    const filesMatching = (re: RegExp) => runtimeFiles.filter((f) => re.test(code(f))).sort();

    it("only the connection service writes qbo_connections / qbo_connection_tokens", () => {
      expect(filesMatching(/\bqboConnection\.(create|createMany|upsert)\b/)).toEqual(["src/services/quickbooks/qbo-connection.service.ts"]);
      expect(filesMatching(/\bqboConnectionToken\.(create|createMany|upsert|update|updateMany)\b/)).toEqual(["src/services/quickbooks/qbo-connection.service.ts"]);
    });

    it("the generic connector layer has exactly one write site and it refuses QuickBooks", () => {
      expect(filesMatching(/\bownerConnector\.(create|createMany|upsert)\b/)).toEqual(["src/services/integration-fabric/connector-registry.service.ts"]);
      const registry = code("src/services/integration-fabric/connector-registry.service.ts");
      expect(registry).toMatch(/isRetiredConnectorProvider/);
    });

    it("the Intuit read client is constructed only inside the QuickBooks services", () => {
      for (const f of filesMatching(/\bcreateQboReadClient\s*\(/)) expect(f.startsWith("src/services/quickbooks/"), f).toBe(true);
    });

    it("OAuth token/refresh/revoke calls to Intuit are made only by the QuickBooks OAuth service", () => {
      // the endpoint constants live in the QuickBooks domain config and nowhere else
      expect(filesMatching(/oauth\.platform\.intuit\.com|\/oauth2\/v1\/tokens/)).toEqual(["src/domain/quickbooks/qbo-config.ts"]);
      expect(filesMatching(/\brefreshQboTokens\s*\(|\bexchangeQboAuthorizationCode\s*\(|\brevokeQboToken\s*\(/).every((f) => f.startsWith("src/services/quickbooks/"))).toBe(true);
    });
  });

  it("WEBHOOK_ACK_FAST: the webhook route makes no provider call and imports neither the Intuit client nor the OAuth service", () => {
    const route = code("src/app/api/webhooks/quickbooks/route.ts");
    expect(route).not.toMatch(/qbo-client|qbo-oauth|qbo-http|\bfetch\s*\(/);
    const service = code("src/services/quickbooks/qbo-webhook.service.ts");
    expect(service).not.toMatch(/qbo-client|qbo-oauth|qbo-http|\bfetch\s*\(/);
  });
});
