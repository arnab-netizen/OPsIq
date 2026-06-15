/**
 * B23-S1: Sales Pitch / Outreach Generator — Domain Model
 *
 * Generates compliant sales pitches for multiple channels.
 * Hard rules: tie to evidence, respect constraints, no deceptive claims, include stop conditions.
 */

export type Channel = "cold_email" | "whatsapp" | "call_script" | "linkedin";
export type Tone = "professional" | "conversational" | "urgent" | "educational";
export type PitchType = "cold_outreach" | "warm_follow_up" | "objection_handling" | "closing";

export interface PitchContext {
  business_type: string; // e.g., "SaaS", "E-commerce", "Services"
  customer_segment: string; // e.g., "Mid-market retail", "Enterprise manufacturing"
  pain_point: string; // e.g., "Inventory accuracy", "Customer retention"
  offer: string; // e.g., "Real-time inventory analytics"
  proof: string[]; // Evidence: ROI metrics, customer testimonials, case studies
  constraints: string[]; // Things we cannot claim or do
  tone: Tone;
  channel: Channel;
  company_name: string;
  recipient_name?: string;
}

export interface PitchContent {
  pitch_id: string;
  pitch_type: PitchType;
  channel: Channel;
  subject_line?: string; // For email
  opening: string;
  value_proposition: string;
  evidence_reference: string; // Must cite proof
  cta: string; // Call to action
  closing: string;
}

export interface FollowUpSequence {
  sequence_id: string;
  channels: Array<{
    day: number;
    channel: Channel;
    pitch: string;
    goal: string;
  }>;
  max_touches: number; // Maximum contact attempts
  stop_condition: string; // When to stop following up
  unsubscribe_instruction?: string; // For email compliance
}

export interface ObjectionHandler {
  objection: string;
  response: string;
  evidence: string;
  next_step: string;
}

export interface SalesPitch {
  pitch_id: string;
  context: PitchContext;

  // Main pitch
  cold_email?: PitchContent;
  whatsapp_pitch?: PitchContent;
  call_script?: PitchContent;

  // Objection handling
  objection_handlers: ObjectionHandler[];

  // Follow-up sequence
  follow_up_sequence: FollowUpSequence;

  // Compliance validation
  evidence_cited: boolean; // Must cite proof
  constraint_compliant: boolean; // Respects constraints
  no_deceptive_claims: boolean; // No spammy/false claims
  has_stop_condition: boolean; // Must have unsubscribe/stop condition

  // Lead scoring
  lead_quality_threshold: number; // 0-100: minimum lead quality to pursue
  estimated_conversion_rate: number; // 0.0-1.0: estimated close rate

  // Verification
  created_at: Date;
  reviewed: boolean;
  reviewer_notes?: string;
}

/**
 * Validate sales pitch is compliant
 */
export function validateSalesPitch(pitch: SalesPitch): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!pitch.pitch_id) {
    errors.push("Pitch ID is required");
  }

  if (!pitch.context) {
    errors.push("Context is required");
  }

  // HARD RULE: Must cite evidence
  if (!pitch.evidence_cited) {
    errors.push("HARD RULE: Pitch must cite evidence/proof");
  }

  // Check that pitch content references evidence
  const allContent = [pitch.cold_email, pitch.whatsapp_pitch, pitch.call_script].filter(
    (c) => c !== undefined
  );
  for (const content of allContent) {
    if (!content?.evidence_reference || content.evidence_reference.length === 0) {
      errors.push(`${content?.channel} pitch must reference evidence`);
    }
  }

  // HARD RULE: Must respect constraints
  if (!pitch.constraint_compliant) {
    errors.push("HARD RULE: Pitch must respect all stated constraints");
  }

  // HARD RULE: No deceptive claims
  if (!pitch.no_deceptive_claims) {
    errors.push("HARD RULE: Pitch contains deceptive/spammy claims");
  }

  // HARD RULE: Must have stop condition
  if (!pitch.has_stop_condition) {
    errors.push("HARD RULE: Pitch must include stop/unsubscribe condition");
  }

  // Verify stop condition exists in follow-up
  if (!pitch.follow_up_sequence.stop_condition) {
    errors.push("Follow-up sequence must define stop condition");
  }

  // At least one pitch channel required
  if (!pitch.cold_email && !pitch.whatsapp_pitch && !pitch.call_script) {
    errors.push("At least one pitch channel is required");
  }

  // Objection handlers should exist
  if (pitch.objection_handlers.length === 0) {
    warnings.push("No objection handlers defined; may miss prospect concerns");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if pitch meets compliance standards
 */
export function checkComplianceStandards(pitch: SalesPitch): {
  compliant: boolean;
  failures: string[];
  warnings: string[];
} {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (!pitch.evidence_cited) {
    failures.push("No evidence cited (hard rule)");
  }

  if (!pitch.constraint_compliant) {
    failures.push("Violates constraints (hard rule)");
  }

  if (!pitch.no_deceptive_claims) {
    failures.push("Contains deceptive claims (hard rule)");
  }

  if (!pitch.has_stop_condition) {
    failures.push("No stop/unsubscribe condition (hard rule)");
  }

  // Check for red flags in pitch content
  const allContent = [pitch.cold_email, pitch.whatsapp_pitch, pitch.call_script].filter(
    (c) => c !== undefined
  );

  const spamming_indicators = [
    "GUARANTEED",
    "100% success",
    "miracle",
    "exclusive opportunity",
    "limited time only",
    "act now",
    "urgent",
  ];

  for (const content of allContent) {
    for (const indicator of spamming_indicators) {
      if (content?.cta.toUpperCase().includes(indicator)) {
        warnings.push(`CTA may contain spammy language: "${indicator}"`);
      }
    }
  }

  return {
    compliant: failures.length === 0,
    failures,
    warnings,
  };
}

/**
 * Score pitch quality (0-100)
 */
export function scorePitch(pitch: SalesPitch): {
  quality_score: number;
  compliance_score: number;
  effectiveness_score: number;
  recommendation: "strong" | "moderate" | "weak";
} {
  let quality_score = 50; // Base score

  // Add points for compliance
  if (pitch.evidence_cited) quality_score += 15;
  if (pitch.constraint_compliant) quality_score += 15;
  if (pitch.no_deceptive_claims) quality_score += 15;
  if (pitch.has_stop_condition) quality_score += 5;

  // Add points for completeness
  if (pitch.cold_email) quality_score += 5;
  if (pitch.whatsapp_pitch) quality_score += 5;
  if (pitch.call_script) quality_score += 5;
  if (pitch.objection_handlers.length > 0) quality_score += 10;

  const compliance_score = pitch.evidence_cited &&
    pitch.constraint_compliant &&
    pitch.no_deceptive_claims &&
    pitch.has_stop_condition
    ? 100
    : 0;

  const effectiveness_score = Math.round(
    pitch.estimated_conversion_rate * 100 * (quality_score / 100)
  );

  let recommendation: "strong" | "moderate" | "weak" = "weak";
  if (compliance_score === 100 && quality_score >= 80) {
    recommendation = "strong";
  } else if (compliance_score === 100 && quality_score >= 60) {
    recommendation = "moderate";
  }

  return {
    quality_score: Math.min(100, quality_score),
    compliance_score,
    effectiveness_score,
    recommendation,
  };
}

/**
 * Validate objection handler
 */
export function validateObjectionHandler(handler: ObjectionHandler): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!handler.objection) {
    errors.push("Objection is required");
  }

  if (!handler.response) {
    errors.push("Response is required");
  }

  if (!handler.evidence) {
    errors.push("Evidence is required to support response");
  }

  if (!handler.next_step) {
    errors.push("Next step is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
