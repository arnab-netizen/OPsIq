/**
 * Owner Trust, Audit & Explainability (Module 11) — read-path validation (Zod v4).
 */
import { z } from "zod/v4";

/** Domains that emit spine findings/actions and thus support explanations. */
export const TRUST_DOMAINS = [
  "finance",
  "sales",
  "cashflow",
  "operations",
  "sop",
  "marketing",
  "strategy",
] as const;
export type TrustDomain = (typeof TRUST_DOMAINS)[number];

export const explanationsQuerySchema = z.object({
  domain: z.enum(TRUST_DOMAINS),
  cycleId: z.string().uuid(),
});
export type ExplanationsQuery = z.infer<typeof explanationsQuerySchema>;
