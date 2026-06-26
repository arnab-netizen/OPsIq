/**
 * Module 40 — Public Scope Freeze Guard (pure domain core).
 *
 * OpsIQ is in OWNER MODE ONLY. The product scope is frozen: no public SaaS,
 * no billing, no Product Hunt / launch work, no cross-user learning, no external
 * integrations, no advanced forecasting. This module classifies a proposed
 * capability/surface as in-scope (Owner Mode) or out-of-scope (frozen public
 * scope) so out-of-scope work is blocked at a single chokepoint.
 * Pure + deterministic.
 */

export type FrozenScopeArea =
  | "PUBLIC_SAAS"
  | "BILLING"
  | "PRODUCT_HUNT_LAUNCH"
  | "CROSS_USER_LEARNING"
  | "EXTERNAL_INTEGRATIONS"
  | "ADVANCED_FORECASTING";

/** The full frozen-scope catalogue (readonly). */
export const FROZEN_SCOPE_AREAS: readonly FrozenScopeArea[] = [
  "PUBLIC_SAAS",
  "BILLING",
  "PRODUCT_HUNT_LAUNCH",
  "CROSS_USER_LEARNING",
  "EXTERNAL_INTEGRATIONS",
  "ADVANCED_FORECASTING",
] as const;

/** Human-readable reason each area is frozen out of Owner Mode. */
export const FROZEN_SCOPE_REASONS: Record<FrozenScopeArea, string> = {
  PUBLIC_SAAS:
    "Public SaaS (signups, multi-tenant onboarding, marketing site) is out of scope: OpsIQ is owner-mode only.",
  BILLING:
    "Billing, subscriptions, and payment processing are out of scope: OpsIQ is owner-mode only.",
  PRODUCT_HUNT_LAUNCH:
    "Product Hunt / public launch work is out of scope: OpsIQ is owner-mode only.",
  CROSS_USER_LEARNING:
    "Cross-user / global learning across tenants is out of scope: OpsIQ is owner-mode only.",
  EXTERNAL_INTEGRATIONS:
    "External integrations (webhooks, OAuth, third-party APIs) are out of scope: OpsIQ is owner-mode only.",
  ADVANCED_FORECASTING:
    "Advanced forecasting / predictive modelling is out of scope: OpsIQ is owner-mode only.",
};

/**
 * Deterministic keyword -> frozen area map. Lowercase keys only; matching is
 * case-insensitive against caller-supplied tags.
 */
export const FROZEN_SCOPE_TAG_KEYWORDS: Record<string, FrozenScopeArea> = {
  billing: "BILLING",
  stripe: "BILLING",
  subscription: "BILLING",
  integration: "EXTERNAL_INTEGRATIONS",
  webhook: "EXTERNAL_INTEGRATIONS",
  oauth: "EXTERNAL_INTEGRATIONS",
  forecast: "ADVANCED_FORECASTING",
  prediction: "ADVANCED_FORECASTING",
  signup: "PUBLIC_SAAS",
  public: "PUBLIC_SAAS",
  "marketing-site": "PUBLIC_SAAS",
  "cross-user": "CROSS_USER_LEARNING",
  "global-learning": "CROSS_USER_LEARNING",
  launch: "PRODUCT_HUNT_LAUNCH",
  producthunt: "PRODUCT_HUNT_LAUNCH",
};

export interface ScopeFeatureInput {
  /** Explicit frozen area, if the caller already knows the classification. */
  area?: FrozenScopeArea;
  /** Free-form tags inspected against the deterministic keyword map. */
  tags?: string[];
}

export interface ScopeClassification {
  inScope: boolean;
  frozenArea: FrozenScopeArea | null;
  reason: string | null;
}

function isFrozenArea(area: FrozenScopeArea | undefined): area is FrozenScopeArea {
  return area !== undefined && FROZEN_SCOPE_AREAS.includes(area);
}

/** Detect a frozen area from a tag list via the deterministic keyword map. */
function detectFrozenAreaFromTags(tags: string[] | undefined): FrozenScopeArea | null {
  if (!tags) return null;
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const key = tag.trim().toLowerCase();
    const area = FROZEN_SCOPE_TAG_KEYWORDS[key];
    if (area) return area;
  }
  return null;
}

/**
 * Classify a proposed feature/surface. An explicit frozen `area` takes
 * precedence; otherwise tags are inspected. Owner-mode features (no frozen area
 * or tag) are in-scope.
 */
export function classifyScope(feature: ScopeFeatureInput): ScopeClassification {
  const explicit = isFrozenArea(feature.area) ? feature.area : null;
  const frozenArea = explicit ?? detectFrozenAreaFromTags(feature.tags);
  if (frozenArea) {
    return { inScope: false, frozenArea, reason: FROZEN_SCOPE_REASONS[frozenArea] };
  }
  return { inScope: true, frozenArea: null, reason: null };
}

/** True when the feature is allowed under Owner Mode (i.e. in-scope). */
export function isOwnerModeAllowed(feature: ScopeFeatureInput): boolean {
  return classifyScope(feature).inScope;
}

/** Thrown when an out-of-scope (frozen public-scope) action is attempted. */
export class PublicScopeFrozenError extends Error {
  readonly code = "PUBLIC_SCOPE_FROZEN";
  readonly frozenArea: FrozenScopeArea;
  readonly reason: string;
  readonly ref: string;
  constructor(ref: string, frozenArea: FrozenScopeArea, reason: string) {
    super(`Owner-mode scope guard: action ${ref} blocked (${frozenArea}) — ${reason}`);
    this.name = "PublicScopeFrozenError";
    this.frozenArea = frozenArea;
    this.reason = reason;
    this.ref = ref;
  }
}

/** Guard: throws PublicScopeFrozenError unless the feature is within Owner Mode. */
export function assertWithinOwnerScope(feature: ScopeFeatureInput, ref: string): void {
  const c = classifyScope(feature);
  if (!c.inScope && c.frozenArea && c.reason) {
    throw new PublicScopeFrozenError(ref, c.frozenArea, c.reason);
  }
}
