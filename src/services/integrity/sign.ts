import { createHmac, timingSafeEqual } from "crypto";

// Fail closed in production: if DECISION_SIGNING_SECRET is not configured, signatures
// cannot be created or verified safely. In non-production environments a dev fallback is
// used for convenience. The fallback value is intentionally trivial — if it ever appears
// in a production signing context, verification will always pass for anyone who reads this
// code, which is the worst possible outcome. The production guard prevents that.
function resolveSigningSecret(): string {
  const secret = process.env.DECISION_SIGNING_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DECISION_SIGNING_SECRET must be configured in production. " +
        "Generate with: openssl rand -base64 32",
    );
  }
  return "dev-signing-key-not-for-production";
}

export function signDecisionHash(decisionHash: string): string {
  const secret = resolveSigningSecret();
  const hmac = createHmac("sha256", secret);
  hmac.update(decisionHash);
  return hmac.digest("hex");
}

export function verifySignature(
  decisionHash: string,
  signedHash: string,
): boolean {
  const computedSignature = signDecisionHash(decisionHash);
  // Use constant-time comparison to prevent timing attacks on HMAC digest comparison.
  const a = Buffer.from(computedSignature, "hex");
  const b = Buffer.from(signedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface SignaturePayload {
  decisionHash: string;
  signedHash: string;
}

export function createSignaturePayload(decisionHash: string): SignaturePayload {
  return {
    decisionHash,
    signedHash: signDecisionHash(decisionHash),
  };
}
