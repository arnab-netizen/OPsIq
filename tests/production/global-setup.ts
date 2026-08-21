/**
 * Fail-closed guard for the live-production acceptance lane. Runs once
 * before any test. Never logs the values of the required variables --
 * only whether they are present.
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
}

export default globalSetup;
