/**
 * Jarvis 360 Slice 11 — opportunity / contract / marketing guardrail surface.
 * POST /api/owner/guardrails/screen — screen an opportunity, a contract/quote, or a
 *      marketing run-now decision (rejects/defers bad ones, not just flags).
 * OWNER_VIEW, workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  screenOpportunity,
  screenContractQuote,
  shouldRunMarketing,
} from "@/domain/owner-mode/opportunity-contract-guardrails";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const capacity = z.enum(["safe", "caution", "high_risk", "blocked"]);
const cash = z.enum(["SAFE", "WATCH", "AT_RISK", "CRITICAL", "INSOLVENT_RISK"]);

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("opportunity"),
    fitScore: z.number().min(0).max(1),
    marginPct: z.number().min(0).max(1).nullable(),
    marginFloorPct: z.number().min(0).max(1),
    capacityStatus: capacity,
    paymentRisk: z.enum(["low", "medium", "high"]),
  }),
  z.object({
    kind: z.literal("contract"),
    price: z.number(),
    directCost: z.number(),
    marginFloorPct: z.number().min(0).max(1),
    paymentTermsDays: z.number().int().min(0),
    capacityStatus: capacity,
  }),
  z.object({
    kind: z.literal("marketing"),
    financialState: cash,
    capacityStatus: capacity,
    qualityRed: z.boolean(),
    reputationRed: z.boolean(),
  }),
]);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    if (input.kind === "opportunity") return canonicalJson(screenOpportunity(input), { status: 200 });
    if (input.kind === "contract") return canonicalJson(screenContractQuote(input), { status: 200 });
    return canonicalJson(shouldRunMarketing(input), { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
