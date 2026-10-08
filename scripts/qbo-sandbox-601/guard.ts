/**
 * Shared target guard for the PR #601 Intuit Sandbox verification scripts.
 * These scripts only ever touch the isolated database `qbo_sandbox_601` as role `qbo_sandbox_601_app`.
 * Nothing here prints the connection string, password, host or any secret.
 */
export const SANDBOX_DB_NAME = "qbo_sandbox_601";
export const SANDBOX_DB_ROLE = "qbo_sandbox_601_app";

export function assertSandboxDatabase(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    console.error("REFUSED: DATABASE_URL is required.");
    process.exit(1);
  }
  let u: URL;
  try {
    u = new URL(databaseUrl);
  } catch {
    console.error("REFUSED: DATABASE_URL is not a valid connection string.");
    process.exit(1);
  }
  const db = decodeURIComponent(u.pathname.replace(/^\//, ""));
  const role = decodeURIComponent(u.username);
  if (db !== SANDBOX_DB_NAME || role !== SANDBOX_DB_ROLE) {
    console.error(`REFUSED: this script only runs against database "${SANDBOX_DB_NAME}" as role "${SANDBOX_DB_ROLE}".`);
    process.exit(1);
  }
  return databaseUrl;
}
