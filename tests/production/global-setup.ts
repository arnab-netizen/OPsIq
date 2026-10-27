import { performSingleProductionLogin } from "./helpers/shared-auth";

/**
 * Fail-closed guard for the live-production acceptance lane, and the ONE place the suite logs in. Runs once
 * before any test. Never logs the values of the required variables --
 * only whether they are present.
 *
 * The single login is performed here (not in each spec) so the suite spends one login from the production
 * login limiter regardless of how many spec files run or how many times Playwright restarts a worker. See
 * helpers/shared-auth.ts.
 */
async function globalSetup() {
  const required = ["BASE_URL", "PRODUCTION_ACCEPTANCE_EMAIL", "PRODUCTION_ACCEPTANCE_PASSWORD"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to run the live-production acceptance suite: missing required environment variable(s): ${missing.join(", ")}.`
    );
  }
  if (!/^https:\/\//.test(process.env.BASE_URL as string)) {
    throw new Error(
      `Refusing to run the live-production acceptance suite: BASE_URL must be an https:// URL, got a value that is not (value withheld from this error to avoid accidental disclosure of internal URLs in logs).`
    );
  }
  await performSingleProductionLogin(process.env.BASE_URL as string);
}

export default globalSetup;
