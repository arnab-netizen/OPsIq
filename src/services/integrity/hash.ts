import { createHash } from "crypto";
import { DecisionResult } from "@/domain/decision/types";
import {
  signDecisionAsymmetric,
  AsymmetricSignaturePayload,
} from "./asymmetric";

const ENGINE_VERSION = "v1.0.0";

// Canonical JSON stringify with sorted keys for reproducibility
export function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalStringify(item)).join(",") + "]";
  }

  const keys = Object.keys(obj).sort();
  const pairs = keys.map(
    (key) =>
      JSON.stringify(key) + ":" + canonicalStringify((obj as unknown)[key])
  );
  return "{" + pairs.join(",") + "}";
}

export interface CanonicalHashPayload {
  inputsSnapshot?: Record<string, unknown>;
  calculationTrace: {
    baselineRevenue: number;
    baselineCost: number;
    revenueChange: number;
    costChange: number;
    netImpact: number;
    formula: string;
  };
  decision: "APPROVED" | "BLOCKED";
  engineVersion: string;
  timestamp: string;
}

export function createCanonicalPayload(
  result: DecisionResult,
  inputsSnapshot?: Record<string, unknown>,
  timestamp?: string
): CanonicalHashPayload {
  return {
    inputsSnapshot,
    calculationTrace: result.explanation.calculationTrace,
    decision: result.decision,
    engineVersion: result.engineVersion || ENGINE_VERSION,
    timestamp: timestamp || new Date().toISOString(),
  };
}

export function generateDecisionHash(result: DecisionResult): string {
  const trace = result.explanation.calculationTrace;

  const hashInput = {
    inputs: {
      baselineRevenue: trace.baselineRevenue,
      baselineCost: trace.baselineCost,
      revenueChange: trace.revenueChange,
      costChange: trace.costChange,
    },
    calculation: {
      formula: trace.formula,
      netImpact: trace.netImpact,
    },
    decision: result.decision,
    version: ENGINE_VERSION,
  };

  const inputString = JSON.stringify(hashInput);
  const hash = createHash("sha256").update(inputString).digest("hex");

  return hash;
}

export function getEngineVersion(): string {
  return ENGINE_VERSION;
}

export interface IntegrityPayload {
  decisionHash: string;
  engineVersion: string;
}

export interface ExtendedIntegrityPayload extends IntegrityPayload {
  signature?: string; // Asymmetric signature
  signatureAlgo?: string;
  publicKeyId?: string;
}

export function createIntegrityPayload(result: DecisionResult): IntegrityPayload {
  return {
    decisionHash: generateDecisionHash(result),
    engineVersion: ENGINE_VERSION,
  };
}

export function createExtendedIntegrityPayload(
  result: DecisionResult,
  inputsSnapshot?: Record<string, unknown>,
  timestamp?: string
): ExtendedIntegrityPayload {
  const decisionHash = generateDecisionHash(result);
  const engineVersion = ENGINE_VERSION;

  // Create canonical payload for asymmetric signing
  const canonicalPayload = createCanonicalPayload(
    result,
    inputsSnapshot,
    timestamp
  );
  const canonicalString = canonicalStringify(canonicalPayload);

  // Generate asymmetric signature
  const asymmetricSig = signDecisionAsymmetric(canonicalString);

  return {
    decisionHash,
    engineVersion,
    signature: asymmetricSig.signature,
    signatureAlgo: asymmetricSig.signatureAlgo,
    publicKeyId: asymmetricSig.publicKeyId,
  };
}
