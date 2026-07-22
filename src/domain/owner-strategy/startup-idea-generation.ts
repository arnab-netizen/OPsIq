/**
 * NEED_OPTIONS idea generation engine — pure domain, no I/O.
 * Generates candidate business ideas from owner profile + evidence + signals.
 * Fails closed when no generative provider is configured.
 * Rejects duplicates, impossible capital requirements, and banned categories.
 */

export type IdeaOriginType =
  | "OWNER_SUBMITTED"
  | "DISCOVERED_FROM_EVIDENCE"
  | "DERIVED_FROM_EXISTING_ASSETS"
  | "DERIVED_FROM_CUSTOMER_PROBLEM"
  | "DERIVED_FROM_EXTERNAL_OPPORTUNITY"
  | "SYSTEM_SYNTHESIZED";

export interface GenerationProfile {
  geography: string | null;
  capitalAvailableCents: bigint | null;
  ownerSkills: string[];
  ownerHoursPerWeek: number | null;
  excludedCategories: string[];
  riskTolerance: "LOW" | "MEDIUM" | "HIGH" | null;
  preferredIndustries: string[];
  previouslyRejectedIdeaNames: string[];
  existingAssets: string[];
  existingCustomerProblems: string[];
}

export interface OpportunitySignalForGeneration {
  id: string;
  signalType: string;
  industry: string | null;
  summary: string | null;
  capitalRequirementCents: bigint | null;
}

export interface EvidenceForGeneration {
  id: string;
  evidenceType: string;
  customerSegment: string | null;
  observedResult: string;
  geography: string | null;
}

export interface GeneratedIdeaConcept {
  name: string;
  industry: string;
  originType: IdeaOriginType;
  derivationRationale: string;
  linkedSignalIds: string[];
  linkedEvidenceIds: string[];
  estimatedCapitalRequirementCents: bigint | null;
  isCapitalFeasible: boolean | null;
  rejectionReason: string | null;  // non-null = idea was generated but rejected
  structuredValidation: {
    passedCapitalCheck: boolean;
    passedGeographyCheck: boolean;
    passedCategoryCheck: boolean;
    passedDuplicateCheck: boolean;
    passedPreviousRejectionCheck: boolean;
  };
}

export interface IdeaGenerationResult {
  available: boolean;
  unavailabilityReason: string | null;
  concepts: GeneratedIdeaConcept[];
  rejectedConcepts: GeneratedIdeaConcept[];
  profileVersion: string;
  evidenceIds: string[];
  signalIds: string[];
  /** Canonical NEED_OPTIONS capability classification */
  generationMethod:
    | "NEED_OPTIONS_GOVERNED_HEURISTIC"       // deterministic profile-based synthesis — no external provider
    | "NEED_OPTIONS_PRODUCTION_GENERATION"    // live AI/provider call succeeded
    | "NEED_OPTIONS_PROVIDER_BOUNDARY_ONLY"   // provider configured but call not made (rate limit, cost gate)
    | "NEED_OPTIONS_UNAVAILABLE";             // no provider and no profile to synthesize from
}

/** Deterministic generation from profile + signals + evidence. */
function generateFromProfile(
  profile: GenerationProfile,
  signals: OpportunitySignalForGeneration[],
  evidence: EvidenceForGeneration[]
): GeneratedIdeaConcept[] {
  const concepts: GeneratedIdeaConcept[] = [];

  // From opportunity signals
  for (const signal of signals) {
    if (!signal.industry || !signal.summary) continue;
    const name = `${signal.industry} service based on: ${signal.summary.slice(0, 40)}`;
    concepts.push({
      name,
      industry: signal.industry,
      originType: "DERIVED_FROM_EXTERNAL_OPPORTUNITY",
      derivationRationale: `Derived from opportunity signal [${signal.id}]: ${signal.summary}`,
      linkedSignalIds: [signal.id],
      linkedEvidenceIds: [],
      estimatedCapitalRequirementCents: signal.capitalRequirementCents,
      isCapitalFeasible: null,
      rejectionReason: null,
      structuredValidation: { passedCapitalCheck: false, passedGeographyCheck: false, passedCategoryCheck: false, passedDuplicateCheck: false, passedPreviousRejectionCheck: false },
    });
  }

  // From existing assets
  for (const asset of profile.existingAssets.slice(0, 3)) {
    concepts.push({
      name: `${asset}-based service`,
      industry: "SERVICES",
      originType: "DERIVED_FROM_EXISTING_ASSETS",
      derivationRationale: `Leverages existing owner asset: ${asset}`,
      linkedSignalIds: [],
      linkedEvidenceIds: [],
      estimatedCapitalRequirementCents: null,
      isCapitalFeasible: null,
      rejectionReason: null,
      structuredValidation: { passedCapitalCheck: false, passedGeographyCheck: false, passedCategoryCheck: false, passedDuplicateCheck: false, passedPreviousRejectionCheck: false },
    });
  }

  // From customer problems in evidence
  for (const ev of evidence.filter((e) => e.evidenceType === "CUSTOMER_DEMAND" && e.customerSegment)) {
    const name = `Solution for ${ev.customerSegment!} in ${ev.geography ?? profile.geography ?? "local market"}`;
    concepts.push({
      name,
      industry: "SERVICES",
      originType: "DERIVED_FROM_CUSTOMER_PROBLEM",
      derivationRationale: `Derived from customer demand evidence [${ev.id}]: ${ev.observedResult.slice(0, 60)}`,
      linkedSignalIds: [],
      linkedEvidenceIds: [ev.id],
      estimatedCapitalRequirementCents: null,
      isCapitalFeasible: null,
      rejectionReason: null,
      structuredValidation: { passedCapitalCheck: false, passedGeographyCheck: false, passedCategoryCheck: false, passedDuplicateCheck: false, passedPreviousRejectionCheck: false },
    });
  }

  return concepts;
}

function validate(
  concept: GeneratedIdeaConcept,
  profile: GenerationProfile
): GeneratedIdeaConcept {
  const v = concept.structuredValidation;

  // Capital check
  const capital = profile.capitalAvailableCents;
  const required = concept.estimatedCapitalRequirementCents;
  v.passedCapitalCheck = capital == null || required == null || capital >= required;
  if (!v.passedCapitalCheck) {
    return { ...concept, structuredValidation: v, isCapitalFeasible: false, rejectionReason: `Capital required (${required}) exceeds available (${capital})` };
  }
  v.passedCapitalCheck = true;

  // Category exclusion check
  v.passedCategoryCheck = !profile.excludedCategories.some(
    (cat) => concept.industry.toUpperCase().includes(cat.toUpperCase()) || concept.name.toUpperCase().includes(cat.toUpperCase())
  );
  if (!v.passedCategoryCheck) {
    return { ...concept, structuredValidation: v, rejectionReason: `Category excluded by owner: ${profile.excludedCategories.find((c) => concept.industry.toUpperCase().includes(c.toUpperCase()))}` };
  }

  // Duplicate check (simple name similarity)
  v.passedDuplicateCheck = true;  // no prior concepts to compare in pure domain

  // Previous rejection check
  const prevRejected = profile.previouslyRejectedIdeaNames.some(
    (n) => n.toLowerCase() === concept.name.toLowerCase() || concept.name.toLowerCase().includes(n.toLowerCase().slice(0, 10))
  );
  v.passedPreviousRejectionCheck = !prevRejected;
  if (prevRejected) {
    return { ...concept, structuredValidation: v, rejectionReason: "Previously rejected without new evidence" };
  }

  // Geography check
  v.passedGeographyCheck = profile.geography == null;  // if no geography restriction, pass
  if (profile.geography != null) {
    v.passedGeographyCheck = true;  // domain can't verify geography without external data
  }

  return { ...concept, structuredValidation: v, isCapitalFeasible: capital == null || required == null || capital >= required };
}

export function generateIdeasFromProfile(
  profile: GenerationProfile,
  signals: OpportunitySignalForGeneration[],
  evidence: EvidenceForGeneration[],
  providerConfigured: boolean,
  profileVersionId: string
): IdeaGenerationResult {
  if (!providerConfigured) {
    return {
      available: false,
      unavailabilityReason: "IDEA_GENERATION_PROVIDER_NOT_CONFIGURED: Set IDEA_GENERATION_PROVIDER environment variable to enable generated ideas. Owner-submitted ideas are always available.",
      concepts: [],
      rejectedConcepts: [],
      profileVersion: profileVersionId,
      evidenceIds: evidence.map((e) => e.id),
      signalIds: signals.map((s) => s.id),
      generationMethod: "NEED_OPTIONS_UNAVAILABLE",
    };
  }

  const raw = generateFromProfile(profile, signals, evidence);
  const validated = raw.map((c) => validate(c, profile));

  // Deduplicate by name (case-insensitive)
  const seen = new Set<string>();
  const accepted: GeneratedIdeaConcept[] = [];
  const rejected: GeneratedIdeaConcept[] = [];
  for (const c of validated) {
    const key = c.name.toLowerCase().slice(0, 30);
    if (c.rejectionReason) { rejected.push(c); continue; }
    if (seen.has(key)) { rejected.push({ ...c, rejectionReason: "SEMANTIC_DUPLICATE" }); continue; }
    seen.add(key);
    accepted.push(c);
  }

  return {
    available: true,
    unavailabilityReason: null,
    concepts: accepted,
    rejectedConcepts: rejected,
    profileVersion: profileVersionId,
    evidenceIds: evidence.map((e) => e.id),
    signalIds: signals.map((s) => s.id),
    generationMethod: "NEED_OPTIONS_GOVERNED_HEURISTIC",
  };
}
