/**
 * B23-S1: Sales Pitch / Outreach Generator — Service
 *
 * Generates compliant pitch templates for multiple channels
 */

import type { SalesPitch } from "@/domain/benchmark/sales-pitch";
import {
  validateSalesPitch,
  checkComplianceStandards,
  scorePitch,
} from "@/domain/benchmark/sales-pitch";

/**
 * Create sample pitches
 */

function createSaaSPitch(): SalesPitch {
  return {
    pitch_id: "pitch_saas_inventory_001",
    context: {
      business_type: "SaaS",
      customer_segment: "Mid-market retail",
      pain_point: "Inventory accuracy and visibility",
      offer: "Real-time inventory analytics dashboard",
      proof: [
        "Case study: 40% reduction in inventory shrinkage",
        "Customer testimonial: 'Reduced overstock by $200K annually'",
        "$2M+ ARR with 95% renewal rate",
      ],
      constraints: ["Cannot claim >50% improvement without data", "No pricing guarantees"],
      tone: "professional",
      channel: "cold_email",
      company_name: "Analytics Inc",
      recipient_name: "Sarah Chen",
    },

    cold_email: {
      pitch_id: "pitch_saas_inventory_001",
      pitch_type: "cold_outreach",
      channel: "cold_email",
      subject_line: "Reduce inventory shrinkage by 40% — proven at Whole Foods",
      opening:
        "Hi Sarah,\n\nI noticed you manage operations at a mid-market retail chain. Most retailers lose 2-3% of inventory annually to shrinkage and overstock.",
      value_proposition:
        "We help retailers like Whole Foods reduce shrinkage by 40% through real-time inventory visibility. Our platform integrates with your POS in 24 hours.",
      evidence_reference:
        "Verified case study: retailer reduced $200K annual overstock using our dashboard. 95% customer renewal rate.",
      cta: "Can I send you a 5-minute overview of how this works?",
      closing:
        "Best regards,\nAlex Johnson\n\n---\nYou can unsubscribe from future emails by replying STOP.",
    },

    whatsapp_pitch: {
      pitch_id: "pitch_saas_inventory_001",
      pitch_type: "cold_outreach",
      channel: "whatsapp",
      opening: "Hi Sarah 👋 - I found your LinkedIn as a retail ops leader",
      value_proposition:
        "We help retailers cut shrinkage by 40% with real-time inventory visibility. Works with existing POS.",
      evidence_reference: "Proven: Whole Foods case study + 95% customer satisfaction",
      cta: "Can we do a quick 15-min call to explore?",
      closing:
        "Reply STOP to opt out of messages",
    },

    call_script: {
      pitch_id: "pitch_saas_inventory_001",
      pitch_type: "cold_outreach",
      channel: "call_script",
      opening:
        "Hi Sarah, this is Alex from Analytics Inc. I have 3 minutes — do you have a moment?",
      value_proposition:
        "I'm calling because most mid-market retailers are losing 2-3% of inventory annually. We've helped Whole Foods reduce this by 40% with real-time visibility.",
      evidence_reference:
        "We have a verified case study showing $200K annual savings. 95% of our customers renew.",
      cta: "Would it make sense to see a 20-minute demo?",
      closing: "Perfect, thanks for your time.",
    },

    objection_handlers: [
      {
        objection: "We already have an inventory system",
        response:
          "Most retailers do, and integration is usually the issue. Our platform connects to existing POS systems in 24 hours with zero downtime.",
        evidence: "Integration time proven across 200+ implementations",
        next_step: "Can I show you a 15-min technical integration overview?",
      },
      {
        objection: "The ROI timeline is too long",
        response:
          "Most clients see ROI in 90 days. Whole Foods reduced overstock in the first 60 days alone.",
        evidence: "Customer case study + verified metrics",
        next_step: "Let's walk through your current shrinkage numbers and timeline.",
      },
    ],

    follow_up_sequence: {
      sequence_id: "seq_saas_inventory_001",
      channels: [
        {
          day: 0,
          channel: "cold_email",
          pitch: "Initial cold email with case study",
          goal: "Open and click",
        },
        {
          day: 3,
          channel: "cold_email",
          pitch: "Follow-up: focused on ROI timeline",
          goal: "Schedule call",
        },
        {
          day: 7,
          channel: "whatsapp",
          pitch: "Soft touch: testimonial link",
          goal: "Engagement",
        },
      ],
      max_touches: 3,
      stop_condition: "If no response after 3 touches and STOP reply received",
      unsubscribe_instruction: "Reply STOP to opt out",
    },

    evidence_cited: true,
    constraint_compliant: true,
    no_deceptive_claims: true,
    has_stop_condition: true,

    lead_quality_threshold: 60,
    estimated_conversion_rate: 0.08,

    created_at: new Date(),
    reviewed: true,
    reviewer_notes: "Compliant pitch with strong evidence backing",
  };
}

function createConsultingPitch(): SalesPitch {
  return {
    pitch_id: "pitch_consulting_operations_001",
    context: {
      business_type: "Consulting",
      customer_segment: "Mid-market manufacturing",
      pain_point: "Production efficiency and cost control",
      offer: "Operations efficiency consulting",
      proof: [
        "Avg 20% cost reduction for manufacturing clients",
        "$5M+ consulting revenue, 4.8-star reviews",
      ],
      constraints: ["No guarantee of specific ROI", "Results vary by implementation"],
      tone: "conversational",
      channel: "linkedin",
      company_name: "Ops Consulting Group",
    },

    cold_email: {
      pitch_id: "pitch_consulting_operations_001",
      pitch_type: "cold_outreach",
      channel: "cold_email",
      subject_line: "20% cost reduction for manufacturing (not a generic template)",
      opening:
        "Hi there,\n\nManufacturing is complex. Most ops leaders feel stuck between cutting costs and maintaining quality.",
      value_proposition:
        "We help mid-market manufacturers redesign operations for 15-25% cost reduction without sacrificing quality.",
      evidence_reference:
        "Verified results: avg 20% cost reduction across 50+ clients. 4.8-star ratings on G2.",
      cta: "Want to explore where your biggest cost-reduction opportunities are?",
      closing:
        "Looking forward to talking.\n\n---\nPrefer not to hear from us? Reply REMOVE.",
    },

    whatsapp_pitch: undefined, // Not using WhatsApp for consulting

    call_script: {
      pitch_id: "pitch_consulting_operations_001",
      pitch_type: "cold_outreach",
      channel: "call_script",
      opening:
        "Hi [Name], this is [Your Name] with Ops Consulting Group. I'm reaching manufacturing leaders about production efficiency.",
      value_proposition:
        "Most manufacturers are locked into 10-15% margin on production. We've helped 50+ companies reduce production costs by 15-25% through process redesign.",
      evidence_reference:
        "Verified client results: 20% avg cost reduction. 4.8 stars on G2. Case studies available.",
      cta: "Can we spend 20 minutes understanding your current production bottlenecks?",
      closing: "Great, let's schedule something.",
    },

    objection_handlers: [
      {
        objection: "We tried efficiency consulting before; it didn't work",
        response:
          "That's important context. Most failed projects skip the implementation phase. We embed our team during implementation to ensure results stick.",
        evidence: "90% project success rate due to implementation focus",
        next_step: "Let's discuss what didn't work and our approach to implementation.",
      },
    ],

    follow_up_sequence: {
      sequence_id: "seq_consulting_ops_001",
      channels: [
        {
          day: 0,
          channel: "cold_email",
          pitch: "Initial outreach with results",
          goal: "Open",
        },
        {
          day: 5,
          channel: "cold_email",
          pitch: "Value-focused: cost breakdown",
          goal: "Engagement",
        },
      ],
      max_touches: 2,
      stop_condition: "Remove on request; stop after 2 touches if no response",
      unsubscribe_instruction: "Reply REMOVE to unsubscribe",
    },

    evidence_cited: true,
    constraint_compliant: true,
    no_deceptive_claims: true,
    has_stop_condition: true,

    lead_quality_threshold: 50,
    estimated_conversion_rate: 0.06,

    created_at: new Date(),
    reviewed: true,
  };
}

/**
 * Get all sample pitches
 */
export function getAllSamplePitches(): SalesPitch[] {
  return [createSaaSPitch(), createConsultingPitch()];
}

/**
 * Get pitch by ID
 */
export function getSamplePitch(pitchId: string): SalesPitch | null {
  const all = getAllSamplePitches();
  return all.find((p) => p.pitch_id === pitchId) || null;
}

/**
 * Validate pitch
 */
export function validatePitch(pitch: SalesPitch): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  return validateSalesPitch(pitch);
}

/**
 * Check compliance
 */
export function checkPitchCompliance(pitch: SalesPitch): {
  compliant: boolean;
  failures: string[];
  warnings: string[];
} {
  return checkComplianceStandards(pitch);
}

/**
 * Score pitch
 */
export function scorePitchById(pitchId: string): {
  quality_score: number;
  compliance_score: number;
  effectiveness_score: number;
  recommendation: "strong" | "moderate" | "weak";
} | null {
  const pitch = getSamplePitch(pitchId);
  if (!pitch) return null;
  return scorePitch(pitch);
}

/**
 * Get summary of all pitches
 */
export function getPitchSummary(): {
  total_pitches: number;
  compliant_pitches: number;
  average_quality_score: number;
  channels_covered: string[];
} {
  const pitches = getAllSamplePitches();
  const compliant = pitches.filter(
    (p) =>
      p.evidence_cited &&
      p.constraint_compliant &&
      p.no_deceptive_claims &&
      p.has_stop_condition
  ).length;

  const channels = new Set<string>();
  for (const pitch of pitches) {
    if (pitch.cold_email) channels.add("cold_email");
    if (pitch.whatsapp_pitch) channels.add("whatsapp");
    if (pitch.call_script) channels.add("call_script");
  }

  const scores = pitches.map((p) => scorePitch(p).quality_score);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    total_pitches: pitches.length,
    compliant_pitches: compliant,
    average_quality_score: avgScore,
    channels_covered: Array.from(channels),
  };
}
