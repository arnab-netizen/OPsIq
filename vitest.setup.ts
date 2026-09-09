import { vi, afterEach, beforeAll } from "vitest";
import dotenv from "dotenv";
import path from "path";
import "@testing-library/jest-dom/vitest";

// next/font/google self-hosts a font at Next.js build time via a bundler-specific transform;
// outside that build pipeline (jsdom/Vitest) the real package has no font files to resolve and
// no network access to fall back on, so any loader (e.g. Source_Serif_4) is undefined here. This
// stub returns the same shape every real loader returns (className/style/variable), stable and
// deterministic, so components that apply those fields render as normal without needing network
// or a production-code workaround. It does not remove or alter the real font import in app code.
vi.mock("next/font/google", () => ({
  Source_Serif_4: () => ({
    className: "__mocked_next_font__",
    variable: "--font-display",
    style: { fontFamily: "__mocked_next_font__" },
  }),
}));

// Load test environment first — override:true ensures that if globalSetup wrote a
// .env.test with the direct Neon URL (no -pooler suffix), it wins over any pooler
// URL that was baked into the worker's process.env copy at thread-creation time.
dotenv.config({ path: path.resolve(process.cwd(), ".env.test"), override: true });

// Fallback: ensure test database is configured
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/opsiq_dev?schema=public";
}

// OAuth token encryption fails closed without a key (AES-256-GCM, no insecure
// fallback). Configure a synthetic, NON-secret 32-byte key for tests so
// encrypt/decrypt round-trips (storeOAuthToken/retrieveOAuthToken, sync-manager)
// work. Tests that assert the fail-closed behaviour override or unset this
// locally within their own try/finally, so this default does not mask them.
if (!process.env.OAUTH_TOKEN_ENCRYPTION_KEY) {
  process.env.OAUTH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
}

// PUBLIC_BETA_ENABLED fails closed (default false) so the signup route
// refuses registration unless explicitly turned on. Every pre-existing test
// that exercises POST /api/auth/signup predates the open-beta gate and
// expects signup to just work, so default the flag "on" for the whole test
// environment — exactly the same override-if-you-need-the-other-behavior
// pattern as OAUTH_TOKEN_ENCRYPTION_KEY above. Tests that specifically assert
// the disabled/closed-beta behavior set process.env.PUBLIC_BETA_ENABLED to
// "false" locally within their own try/finally, so this default never masks them.
if (!process.env.PUBLIC_BETA_ENABLED) {
  process.env.PUBLIC_BETA_ENABLED = "true";
}

// Ensure database is initialized before tests run (only if TEST_WITH_DB=true)
beforeAll(async () => {
  if (process.env.TEST_WITH_DB !== "true") {
    return; // Skip DB initialization if not in DB test mode
  }
  try {
    const { getDbInstance } = await import("./src/lib/db");
    await getDbInstance();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[vitest]")) {
      // Test file mocks @/lib/db without getDbInstance — unit test, DB init skipped.
      return;
    }
    console.error("Failed to initialize database in test setup:", error);
    throw error;
  }
});

afterEach(() => {
  // Clean up mocks after each test
  vi.clearAllMocks();
});
