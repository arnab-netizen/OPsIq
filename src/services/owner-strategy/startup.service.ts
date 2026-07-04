/**
 * Owner Strategy — Startup Mode runtime service (Phases 14-15 surface).
 *
 * Thin, deterministic bridge from the validated request to the pure Startup Mode
 * engine (validateStartup). Stateless: startup validation reasons over
 * owner-supplied intake + ideas, not persisted business data, so no DB access is
 * required. Kept as a service so the route stays thin and the composed
 * command-center payload can be reused for a consistent owner view.
 */
import { validateStartup } from "@/domain/owner-strategy/startup-mode";
import { composeWealthCommandCenter } from "@/domain/owner-strategy/command-center";
import type { StartupIntake, StartupIdea, StartupValidationResult } from "@/domain/owner-strategy/startup-mode.types";
import type { WealthCommandCenter } from "@/domain/owner-strategy/command-center.types";

export interface StartupValidateServiceResult {
  validation: StartupValidationResult;
  commandCenter: WealthCommandCenter;
}

/**
 * Validate a startup session and return both the raw validation and the
 * command-center-shaped payload (startup mode → VALIDATE_FIRST).
 */
export function validateStartupSession(
  intake: StartupIntake,
  ideas: StartupIdea[],
): StartupValidateServiceResult {
  const validation = validateStartup(intake, ideas);
  const commandCenter = composeWealthCommandCenter({
    mode: "startup",
    startupIntake: intake,
    startupIdeas: ideas,
  });
  return { validation, commandCenter };
}
