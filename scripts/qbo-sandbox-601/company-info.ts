/**
 * ONE-OFF, READ-ONLY proof that the stored Intuit Sandbox grant works: exactly ONE CompanyInfo GET using the
 * released QBO client and the persisted (decrypted server-side) access token. No HTTP route, no sync, no write, no
 * refresh, no retry. Prints only sanitized pass/fail evidence — never a token, the realm id, a secret, or the company record.
 *
 *   DATABASE_URL=<qbo_sandbox_601 direct url> OAUTH_TOKEN_ENCRYPTION_KEY=<preview key> \
 *   QUICKBOOKS_CLIENT_ID=… QUICKBOOKS_CLIENT_SECRET=… QUICKBOOKS_REDIRECT_URI=… QUICKBOOKS_ENVIRONMENT=sandbox \
 *   npx tsx scripts/qbo-sandbox-601/company-info.ts
 */
import { assertSandboxDatabase } from "./guard";

async function main(): Promise<void> {
  assertSandboxDatabase(process.env.DATABASE_URL);
  const { resolveQboConfig } = await import("../../src/domain/quickbooks/qbo-config");
  const { loadQboTokensForUse } = await import("../../src/services/quickbooks/qbo-connection.service");
  const { createQboReadClient } = await import("../../src/services/quickbooks/qbo-client");
  const { isQboProviderError } = await import("../../src/domain/quickbooks/qbo-errors");
  const { db } = await import("../../src/lib/db");

  const resolved = resolveQboConfig(process.env);
  if (!resolved.available) {
    console.error("REFUSED: QuickBooks configuration is incomplete.");
    process.exit(1);
  }
  if (resolved.config.environment !== "sandbox") {
    console.error("REFUSED: this script only runs with QUICKBOOKS_ENVIRONMENT=sandbox.");
    process.exit(1);
  }

  const connections = await db.qboConnection.findMany({ where: { environment: "sandbox", status: "ACTIVE" }, select: { id: true, workspaceId: true } });
  if (connections.length !== 1) {
    console.error(`REFUSED: expected exactly one ACTIVE sandbox connection, found ${connections.length}.`);
    process.exit(1);
  }
  const { id: connectionId, workspaceId } = connections[0];
  const loaded = await loadQboTokensForUse({ workspaceId, connectionId });
  if (!loaded.ok) {
    console.error(`REFUSED: stored grant is not usable (${loaded.reason}).`);
    process.exit(1);
  }
  const { tokens } = loaded;
  if (tokens.accessTokenExpiresAt.getTime() <= Date.now()) {
    console.error("TOKEN_EXPIRED: the access token has expired (about one hour). Re-run the OAuth flow, then this script promptly.");
    process.exit(2);
  }

  const client = createQboReadClient({
    config: resolved.config,
    realmId: tokens.realmId,
    getAccessToken: async () => tokens.accessToken,
    maxRetries: 0, // exactly one GET
  });

  try {
    const info = await client.companyInfo();
    const name = typeof info.CompanyName === "string" ? info.CompanyName : "";
    const after = await db.qboConnectionToken.findFirst({ where: { connectionId, workspaceId }, select: { revision: true } });
    console.log("REAL_SANDBOX_COMPANY_READ=PASS");
    console.log(`  environment            : ${resolved.config.environment}`);
    console.log(`  companyInfoReturned    : true`);
    console.log(`  hasCompanyName         : ${name.length > 0}`);
    console.log(`  responseFieldCount     : ${Object.keys(info).length}`);
    console.log(`  tokenRevisionUnchanged : ${after?.revision === tokens.revision}`);
  } catch (e) {
    console.log("REAL_SANDBOX_COMPANY_READ=FAIL");
    console.log(`  reason : ${isQboProviderError(e) ? e.kind : "UNEXPECTED_ERROR"}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("Failed:", e instanceof Error ? e.name : "error");
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 50));
