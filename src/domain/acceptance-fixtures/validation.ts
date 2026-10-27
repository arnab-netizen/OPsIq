/**
 * Request schemas for /api/admin/acceptance-fixtures/*.
 *
 * Every schema is STRICT: the fixture flag is hard-wired by the route and must never be
 * client-supplied, so a body that carries `isFixtureBusiness`/`isFixtureRecord` (or any unknown key)
 * is refused with a 400 before any write. See docs/opsiq-governance/ACCEPTANCE_FIXTURE_AUTHORITY.md.
 */
import { z } from "zod/v4";
import { businessCreateSchema } from "@/domain/founder-recovery/validation";
import { startupIntakeSchema, startupIdeaSchema } from "@/domain/owner-strategy/startup-mode.validation";

export const acceptanceFixtureBusinessSchema = businessCreateSchema.omit({ isFixtureBusiness: true }).strict();

export const acceptanceFixtureStartupSessionSchema = z.strictObject({
  sessionLabel: z.string().max(200).nullable().optional(),
  intake: startupIntakeSchema,
  ideas: z.array(startupIdeaSchema).min(1).max(20),
});

export const acceptanceFixtureBlueprintSchema = z.strictObject({
  ideaId: z.string().uuid(),
  ownerDecisionId: z.string().uuid(),
  objectiveTitle: z.string().min(1).max(500),
  objectiveDescription: z.string().optional(),
  targetMetricName: z.string().optional(),
  targetValue: z.number().optional(),
  deadline: z.string().optional(),
  initialTaskTitles: z.array(z.string()).optional(),
});

/**
 * GET .../cashflow/actions/[actionId]/gate-verdict query. `toStatus` is pinned to the one transition
 * this endpoint predicts -- "completed" carries additional completion-evidence validation independent
 * of the owner-action gate, so a gate-only verdict cannot predict that mutation's outcome. strictObject
 * also refuses any other query parameter (no accidental extra scope).
 */
export const acceptanceGateVerdictQuerySchema = z.strictObject({
  toStatus: z.literal("in_progress"),
});
