/**
 * Presentation visibility derived from a resolved capability set (pure). Decides only what a page shows;
 * the data behind it is authorized by its own API route.
 */
import { CAPABILITIES } from "@/domain/constants/capabilities";

/**
 * The consultant Decision Inbox (OperatorItem, /api/decisions/list — ENGAGEMENT_VIEW) is shown only to users
 * with engagement/consulting access. A self-serve owner holds no such capability, so their pages never
 * request it.
 */
export function canViewConsultingDecisions(capabilities: readonly string[]): boolean {
  return capabilities.includes(CAPABILITIES.ENGAGEMENT_VIEW);
}
