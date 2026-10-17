/**
 * Paddle webhook signature verification (fail closed).
 *
 * Header format:  Paddle-Signature: ts=<unix seconds>;h1=<hex HMAC-SHA256>
 * Signed payload: `${ts}:${rawBody}`, key = the notification destination's secret key.
 * The raw, unparsed request body MUST be used. Comparison is constant time. A timestamp outside
 * the tolerance window is rejected (replay protection); duplicate-but-fresh deliveries are
 * handled by the idempotency layer, not here.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 300;

export class PaddleSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaddleSignatureError";
  }
}

export function parsePaddleSignatureHeader(header: string | null | undefined): { ts: string; h1: string[] } {
  if (!header) throw new PaddleSignatureError("missing signature header");
  let ts = "";
  const h1: string[] = [];
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "ts") ts = value;
    else if (key === "h1") h1.push(value);
  }
  if (!/^\d{1,12}$/.test(ts) || h1.length === 0) throw new PaddleSignatureError("malformed signature header");
  return { ts, h1 };
}

export function computePaddleSignature(secret: string, ts: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
}

export function verifyPaddleSignature(params: {
  rawBody: string;
  header: string | null | undefined;
  secret: string | undefined;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): { ts: number } {
  if (!params.secret) throw new PaddleSignatureError("webhook secret not configured");
  const { ts, h1 } = parsePaddleSignatureHeader(params.header);
  const expected = Buffer.from(computePaddleSignature(params.secret, ts, params.rawBody), "hex");
  const matched = h1.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const given = Buffer.from(candidate, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matched) throw new PaddleSignatureError("signature mismatch");
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? PADDLE_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - Number(ts)) > tolerance) throw new PaddleSignatureError("timestamp outside tolerance");
  return { ts: Number(ts) };
}
