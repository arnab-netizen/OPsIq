/**
 * QuickBooks Online — whether the owner FIRST-RUN may OFFER "Connect QuickBooks" (pure: no DB, no network, no env reads).
 *
 * "QuickBooks is configured" (resolveQboConfig) is not the same as "QuickBooks is safe to offer to every new owner". Offering it
 * on the first screen is an explicit, separate decision, and it fails CLOSED:
 *   - the server configuration must be valid (credentials, redirect URI, environment);
 *   - the first-run offer gate must be explicitly "true" (absent / anything else = closed);
 *   - a PRODUCTION-environment deployment additionally needs the separate acceptance confirmation (legal text, privacy, backup,
 *     erasure, provider approval) to be explicitly "true". Sandbox deployments do not carry that requirement.
 *
 * Environment/business isolation is NOT decided here: the caller also requires the existing `connectBlockedReason` to be null, so a
 * Sandbox deployment is never offered for a real business and a Production one never for a test business.
 *
 * When the offer is closed the first-run shows only the manual route. An owner who already has a QuickBooks connection is never
 * affected by this gate (their state is shown so the import can be resumed); the gate only decides whether to START one here.
 */
import type { QboConfigResult, QboEnvironment } from "./qbo-config";

export const QBO_FIRST_RUN_OFFER_ENV_KEY = "QUICKBOOKS_FIRST_RUN_OFFER_ENABLED" as const;
export const QBO_PRODUCTION_ACCEPTANCE_ENV_KEY = "QUICKBOOKS_PRODUCTION_ACCEPTANCE_CONFIRMED" as const;

export type QboFirstRunOfferReason = "OFFERED" | "NOT_CONFIGURED" | "OFFER_GATE_CLOSED" | "PRODUCTION_ACCEPTANCE_PENDING";

export interface QboFirstRunOffer {
  offered: boolean;
  reason: QboFirstRunOfferReason;
  environment: QboEnvironment | null;
}

const isExactlyTrue = (v: string | undefined): boolean => typeof v === "string" && v.trim() === "true";

export function qboFirstRunOffer(cfg: QboConfigResult, env: Record<string, string | undefined>): QboFirstRunOffer {
  if (!cfg.available) return { offered: false, reason: "NOT_CONFIGURED", environment: null };
  const environment = cfg.config.environment;
  if (!isExactlyTrue(env[QBO_FIRST_RUN_OFFER_ENV_KEY])) return { offered: false, reason: "OFFER_GATE_CLOSED", environment };
  if (environment === "production" && !isExactlyTrue(env[QBO_PRODUCTION_ACCEPTANCE_ENV_KEY])) {
    return { offered: false, reason: "PRODUCTION_ACCEPTANCE_PENDING", environment };
  }
  return { offered: true, reason: "OFFERED", environment };
}
