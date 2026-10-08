/**
 * READ-ONLY database proof for the PR #601 Intuit Sandbox OAuth test. Prints counts and booleans only —
 * never a token, ciphertext, state hash, realm id or secret.
 *
 *   DATABASE_URL=<qbo_sandbox_601 direct url> npx tsx scripts/qbo-sandbox-601/verify-db.ts
 */
import { assertSandboxDatabase } from "./guard";

async function main(): Promise<void> {
  const databaseUrl = assertSandboxDatabase(process.env.DATABASE_URL);
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const [conns, prodConns, states, tokens] = await Promise.all([
      prisma.qboConnection.findMany({ where: { environment: "sandbox" }, select: { id: true, status: true } }),
      prisma.qboConnection.count({ where: { environment: "production" } }),
      prisma.qboOAuthState.findMany({ select: { consumedAt: true, finalizedAt: true } }),
      prisma.qboConnectionToken.findMany({ select: { accessTokenCiphertext: true, refreshTokenCiphertext: true, revision: true } }),
    ]);
    const ok = (b: boolean) => (b ? "PASS" : "FAIL");
    console.log(`sandboxConnections      : ${conns.length}  (${ok(conns.length === 1)})`);
    console.log(`connectionStatusActive  : ${conns.every((c) => c.status === "ACTIVE")}`);
    console.log(`productionConnections   : ${prodConns}  (${ok(prodConns === 0)})`);
    console.log(`oauthStates             : ${states.length}`);
    console.log(`statesConsumed          : ${states.filter((s) => s.consumedAt).length}`);
    console.log(`statesFinalized         : ${states.filter((s) => s.finalizedAt).length}`);
    console.log(`tokenRows               : ${tokens.length}  (${ok(tokens.length === 1)})`);
    console.log(`ciphertextEnvelopeV1gcm : ${tokens.every((t) => t.accessTokenCiphertext.startsWith("v1gcm.") && t.refreshTokenCiphertext.startsWith("v1gcm."))}`);
    console.log(`tokenRevisions          : ${tokens.map((t) => t.revision).join(",") || "none"}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.name : "error");
  process.exit(1);
});
