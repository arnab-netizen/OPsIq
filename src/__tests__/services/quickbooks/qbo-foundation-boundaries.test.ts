/**
 * Machine-checked scope boundaries for the QuickBooks READ-ONLY integration (OAuth foundation + read-only sync slice).
 * These fail if a later change quietly widens the slice (provider writes, persistence outside the two reviewed
 * modules, extra routes, UI, a second crypto implementation, a new sync source or scheduler registration) instead of
 * doing it in its own reviewed PR. The read-only sync (V26) is the one reviewed widening recorded here: the permitted
 * surface is now enumerated EXACTLY, and every prohibition on QuickBooks writes is unchanged or stronger.
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

  it("no source treats a 20-character / digits-only identifier as an Intuit rule", () => {
    for (const f of qboFiles) {
      expect(code(f), f).not.toMatch(/\{1,\s*20\s*\}/);
    }
    const ids = code("src/domain/quickbooks/qbo-identifiers.ts");
    expect(ids).toContain("OPSIQ_DEFENSIVE_BOUND");
    expect(ids).not.toContain("INTUIT_PROVIDER_MAX\"");
  });

  // Exactly TWO QuickBooks modules may touch the database: connection/OAuth/token persistence and sync persistence.
  // Every provider, OAuth, client, normalization, orchestration and webhook module stays persistence-free.
  const PERSISTENCE_MODULES = ["qbo-connection.service.ts", "qbo-sync-store.service.ts"];
  const isPersistence = (f: string) => PERSISTENCE_MODULES.some((m) => f.endsWith(m));

  it("NO persistence outside the two reviewed persistence services", () => {
    const persisting = qboFiles.filter((f) => /@\/lib\/db/.test(code(f)));
    expect(persisting.filter((f) => !isPersistence(f))).toEqual([]);
    expect(persisting.filter(isPersistence).sort()).toHaveLength(2);
    for (const f of qboFiles.filter((f) => !isPersistence(f))) {
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

  it("OWNER_QBO_SURFACE is exactly connect + callback + sync + status + the Intuit webhook receiver; no owner pages or UI components", () => {
    const offenders = [...walk("src/app"), ...walk("src/ui")]
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => /quickbooks|qbo/i.test(p));
    expect(offenders.sort()).toEqual([
      "src/app/api/integrations/quickbooks/webhook/route.ts",
      "src/app/api/owner/integrations/quickbooks/callback/route.ts",
      "src/app/api/owner/integrations/quickbooks/connect/route.ts",
      "src/app/api/owner/integrations/quickbooks/status/route.ts",
      "src/app/api/owner/integrations/quickbooks/sync/route.ts",
    ]);
  });

  it("SYNC_SCOPE: the QuickBooks files are an exact reviewed set (adding a source or module is a reviewed change)", () => {
    expect(qboFiles.map((f) => f.replace(/\\/g, "/")).sort()).toEqual([
      "src/domain/quickbooks/qbo-config.ts",
      "src/domain/quickbooks/qbo-connect-outcomes.ts",
      "src/domain/quickbooks/qbo-connection-model.ts",
      "src/domain/quickbooks/qbo-errors.ts",
      "src/domain/quickbooks/qbo-identifiers.ts",
      "src/domain/quickbooks/qbo-normalize.ts",
      "src/domain/quickbooks/qbo-provenance-policy.ts",
      "src/domain/quickbooks/qbo-read-catalog.ts",
      "src/domain/quickbooks/qbo-request-url.ts",
      "src/domain/quickbooks/qbo-sync-model.ts",
      "src/domain/quickbooks/qbo-sync-outcomes.ts",
      "src/domain/quickbooks/qbo-webhook.ts",
      "src/services/quickbooks/qbo-client.ts",
      "src/services/quickbooks/qbo-connect-callback.service.ts",
      "src/services/quickbooks/qbo-connection.service.ts",
      "src/services/quickbooks/qbo-http.ts",
      "src/services/quickbooks/qbo-oauth.service.ts",
      "src/services/quickbooks/qbo-rate-limiter.ts",
      "src/services/quickbooks/qbo-sync-status.service.ts",
      "src/services/quickbooks/qbo-sync-store.service.ts",
      "src/services/quickbooks/qbo-sync.service.ts",
      "src/services/quickbooks/qbo-token-access.service.ts",
      "src/services/quickbooks/qbo-webhook.service.ts",
    ]);
  });

  it("QBO_PROVIDER_WRITE_SURFACE=NONE for the sync path: it reaches QuickBooks only through the GET-only read client", () => {
    const syncPath = [
      "src/services/quickbooks/qbo-sync.service.ts",
      "src/services/quickbooks/qbo-token-access.service.ts",
      "src/services/quickbooks/qbo-sync-store.service.ts",
      "src/services/quickbooks/qbo-webhook.service.ts",
      "src/services/quickbooks/qbo-sync-status.service.ts",
      "src/domain/quickbooks/qbo-sync-model.ts",
      "src/domain/quickbooks/qbo-normalize.ts",
      "src/domain/quickbooks/qbo-webhook.ts",
      "src/domain/quickbooks/qbo-provenance-policy.ts",
    ];
    for (const f of syncPath) {
      const src = code(f);
      // No HTTP of its own: no fetch, no verb, no body, no raw HTTP primitive.
      expect(src, f).not.toMatch(/\bfetch\s*\(|\bmethod\s*:|qboHttp|XMLHttpRequest|axios|https?\.request/);
      expect(src, f).not.toMatch(/["'`](POST|PUT|PATCH|DELETE)["'`]/);
    }
    const sync = code("src/services/quickbooks/qbo-sync.service.ts");
    expect(sync).toContain("createQboReadClient");
    // The only provider calls are read-client methods (keyset pages use query, deletion confirmation uses readEntity).
    const providerCalls = [...sync.matchAll(/\bclient\.(\w+)\(/g)].map((m) => m[1]);
    expect([...new Set(providerCalls)].sort()).toEqual(["companyInfo", "query", "readEntity", "report"]);
    expect(sync).not.toMatch(/qbo-oauth\.service|qbo-http/);
    // Only the token-access service refreshes tokens (the separately reviewed OAuth POST), never the sync loop.
    expect(code("src/services/quickbooks/qbo-token-access.service.ts")).toContain("refreshQboTokens");
    expect(sync).not.toMatch(/refreshQboTokens|revokeQboToken|exchangeQboAuthorizationCode/);
    // The webhook receiver can only schedule work; it never calls QuickBooks.
    expect(code("src/services/quickbooks/qbo-webhook.service.ts")).not.toMatch(/createQboReadClient|qbo-client|qbo-oauth/);
  });

  it("SYNC_SCOPE: the supported sources are exactly the documented read-only list", async () => {
    const { SUPPORTED_QBO_READ_ENTITIES } = await import("@/domain/quickbooks/qbo-sync-model");
    expect([...SUPPORTED_QBO_READ_ENTITIES]).toEqual([
      "CompanyInfo", "Customer", "Invoice", "Bill",
      "ProfitAndLoss(report)", "BalanceSheet(report)", "AgedReceivables(report)", "AgedPayables(report)",
    ]);
  });

  it("scheduler: exactly ONE QuickBooks task (the read-only sync) is registered and produced", () => {
    const handlers = code("src/infra/scheduler-handlers.ts");
    expect([...handlers.matchAll(/TASK_NAME_QBO\w*\s*=\s*"([^"]+)"/g)].map((m) => m[1])).toEqual(["qbo-read-sync"]);
    const producers = code("src/services/scheduler/scheduler-producers.ts");
    expect([...producers.matchAll(/export async function (enqueue\w*Qbo\w*)/g)].map((m) => m[1])).toEqual(["enqueueDueQboReadSyncTasks"]);
  });

  it("schema: QuickBooks tables hold no token material outside qbo_connection_tokens and no forbidden legacy columns", () => {
    const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
    for (const forbidden of ["external_account_id", "externalAccountId", "oauthStateHash", "oauth_state_hash", "refreshLockedUntil", "OwnerConnectorRecord", "OwnerConnectorWrite", "syncLeaseExpiresAt"]) {
      expect(schema, forbidden).not.toContain(forbidden);
    }
    const models = [...schema.matchAll(/^model (Qbo\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({ name: m[1], body: m[2] }));
    expect(models.map((m) => m.name).sort()).toEqual([
      "QboConnection", "QboConnectionToken", "QboOAuthState", "QboReportObservation", "QboSyncRun", "QboSyncState", "QboSyncedRecord", "QboWebhookEvent",
    ]);
    for (const m of models.filter((m) => m.name !== "QboConnectionToken")) {
      expect(m.body, m.name).not.toMatch(/ciphertext|accessToken|refreshToken|clientSecret|verifierToken/i);
    }
  });
});
