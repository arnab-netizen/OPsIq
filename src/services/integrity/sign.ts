import { createHmac } from "crypto";

const SIGNING_SECRET = process.env.DECISION_SIGNING_SECRET || "dev-signing-key";

export function signDecisionHash(decisionHash: string): string {
  const hmac = createHmac("sha256", SIGNING_SECRET);
  hmac.update(decisionHash);
  return hmac.digest("hex");
}

export function verifySignature(
  decisionHash: string,
  signedHash: string
): boolean {
  const computedSignature = signDecisionHash(decisionHash);
  return computedSignature === signedHash;
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
