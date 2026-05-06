// ⚠️ CANONICAL IMPORT: All contracts are now in @/contracts
// This file re-exports for backward compatibility only.
// NEW CODE: import from @/contracts

import { VarianceResult } from "./variance";
export { FeedbackAction } from "@/contracts";
export type { FeedbackLoopInput, FeedbackLoopResult } from "@/contracts";

// Legacy local definitions (deprecated - remove when all imports migrated)
import type { FeedbackAction, FeedbackLoopInput, FeedbackLoopResult } from "@/contracts";
