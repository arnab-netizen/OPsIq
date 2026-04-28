import { generateKeyPairSync, sign, verify } from "crypto";
import * as fs from "fs";
import * as path from "path";

const KEYS_DIR = ".keys";
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "private.pem");
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, "public.pem");

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

export interface AsymmetricSignaturePayload {
  signature: string;
  signatureAlgo: "ECDSA-SHA256";
  publicKeyId: string;
}

// Generate or load key pair
function getOrCreateKeyPair(): KeyPair {
  // In development/test, generate a new pair each time
  // In production, load from secure storage
  if (process.env.NODE_ENV === "production") {
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
      const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf-8");
      const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, "utf-8");
      return { privateKey, publicKey };
    }

    throw new Error(
      "Production mode requires pre-generated keys at .keys/private.pem and .keys/public.pem"
    );
  }

  // Development: use in-memory keys with consistent generation
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
  });

  return {
    privateKey,
    publicKey,
  };
}

const keyPair = getOrCreateKeyPair();

function getPublicKeyId(publicKey: string): string {
  // Simple hash of public key for identification
  const crypto = require("crypto");
  return crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .substring(0, 16);
}

export function signDecisionAsymmetric(hashPayload: string): AsymmetricSignaturePayload {
  const signature = sign(
    "sha256",
    Buffer.from(hashPayload, "utf-8"),
    keyPair.privateKey
  );

  return {
    signature: signature.toString("hex"),
    signatureAlgo: "ECDSA-SHA256",
    publicKeyId: getPublicKeyId(keyPair.publicKey),
  };
}

export function verifyAsymmetricSignature(
  hashPayload: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    return verify(
      "sha256",
      Buffer.from(hashPayload, "utf-8"),
      publicKey,
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

export function getPublicKey(): string {
  return keyPair.publicKey;
}

export function getPublicKeyIdFromKey(): string {
  return getPublicKeyId(keyPair.publicKey);
}
