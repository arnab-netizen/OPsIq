/**
 * Owner Connectors & Data Intake (Module 10) — API input validation (Zod v4).
 *
 * Validates the upload + confirm write paths at the route boundary. The CSV body
 * is size-bounded; the target domain must be a supported intake spec.
 */
import { z } from "zod/v4";
import { INTAKE_SOURCES } from "./types";
import { INTAKE_TARGET_DOMAINS } from "./field-specs";

export const intakeUploadSchema = z.object({
  source: z.enum(INTAKE_SOURCES),
  targetDomain: z.enum(INTAKE_TARGET_DOMAINS),
  csvText: z.string().min(1, "CSV content is required").max(2_000_000, "CSV is too large"),
  notes: z.string().max(2000).optional(),
});
export type IntakeUploadInput = z.infer<typeof intakeUploadSchema>;
