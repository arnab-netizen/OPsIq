/**
 * Paddle.js bootstrap for the public /pay checkout page. Browser-side, no secrets: the client-side
 * token is public by design (it can only open checkouts for transactions the SERVER created).
 * Nothing here grants entitlement — payment events are display-only; the verified webhook is the
 * sole authority.
 */

export const PADDLE_JS_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";
const INIT_FLAG = "__opsiqPaddleInitialized";
const SCRIPT_ID = "opsiq-paddle-js";

export type PayConfig =
  | { state: "ready"; environment: "sandbox" | "production"; token: string }
  | { state: "unconfigured" }
  | { state: "token_mismatch" };

/**
 * Server-side resolution of the checkout configuration. PADDLE_ENV=sandbox → sandbox, anything
 * else → production (matching the API client). A sandbox token must be `test_…` and a production
 * token `live_…`; a mismatch is refused rather than silently initializing the wrong environment.
 */
export function resolvePayConfig(env: Record<string, string | undefined>): PayConfig {
  const token = env.PADDLE_CLIENT_TOKEN?.trim();
  if (!token) return { state: "unconfigured" };
  const environment = env.PADDLE_ENV === "production" ? "production" : "sandbox";
  const expectedPrefix = environment === "sandbox" ? "test_" : "live_";
  if (!token.startsWith(expectedPrefix)) return { state: "token_mismatch" };
  return { state: "ready", environment, token };
}

export function isValidTransactionParam(value: string | null | undefined): value is string {
  return typeof value === "string" && /^txn_[a-z0-9]{20,40}$/.test(value);
}

export interface PaddleEventData {
  name?: string;
}
export interface PaddleGlobal {
  Environment: { set(env: "sandbox" | "production"): void };
  Initialize(options: { token: string; eventCallback?: (event: PaddleEventData) => void }): void;
}
type PaddleWindow = Window & { Paddle?: PaddleGlobal; [INIT_FLAG]?: boolean };

/** Loads Paddle.js once (idempotent) and resolves with the global. */
export function loadPaddleJs(win: PaddleWindow = window as PaddleWindow): Promise<PaddleGlobal> {
  if (win.Paddle) return Promise.resolve(win.Paddle);
  return new Promise((resolve, reject) => {
    const existing = win.document.getElementById(SCRIPT_ID);
    const script = (existing as HTMLScriptElement | null) ?? win.document.createElement("script");
    const done = () => (win.Paddle ? resolve(win.Paddle) : reject(new Error("paddle-js-unavailable")));
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("paddle-js-load-failed")), { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = PADDLE_JS_URL;
      script.async = true;
      win.document.head.appendChild(script);
    }
  });
}

/**
 * Environment.set + Initialize, exactly once per page load (React strict-mode double effects and
 * re-renders cannot re-initialize). Paddle.js itself opens the checkout for the `_ptxn` transaction
 * in the URL when initialized.
 */
export function initializePaddleOnce(
  paddle: PaddleGlobal,
  config: { environment: "sandbox" | "production"; token: string },
  onEvent?: (event: PaddleEventData) => void,
  win: PaddleWindow = window as PaddleWindow,
): boolean {
  if (win[INIT_FLAG]) return false;
  win[INIT_FLAG] = true;
  if (config.environment === "sandbox") paddle.Environment.set("sandbox");
  paddle.Initialize({ token: config.token, eventCallback: onEvent });
  return true;
}
