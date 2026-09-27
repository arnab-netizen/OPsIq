/**
 * Command-center PRIORITY STRIP — selects the owner's top 3–5 priorities from the LIVE runtime signals
 * so the dashboard leads with a command center, not an information wall.
 *
 * Each priority card answers the seven required questions: what is wrong, why it matters, what to do
 * next, who owns it, what proof is needed, when OpsIQ reassesses, and what confidence/data limitation
 * applies. The selection is business logic and lives HERE (pure), never in the page.
 *
 * It is strictly runtime-fed: with no runtime plan it returns an EMPTY strip (the page then shows an
 * honest empty state) — it never fabricates a card. Capped at five.
 *
 * Pure module. No DB, no Date.now, no AI.
 */
export type PrioritySeverity = "critical" | "high" | "medium" | "low";

export interface PriorityCard {
  id: string;
  severity: PrioritySeverity;
  whatIsWrong: string;
  whyItMatters: string;
  nextStep: string;
  owner: string;
  proof: string;
  reassess: string;
  confidenceNote: string;
}

export interface PriorityStripInput {
  /** From the whole-business-plan runtime (found:false ⇒ no strip). */
  wbp: {
    found: boolean;
    topPriorityLabel: string;
    dominantConstraint: string;
    nextBestAction: string;
    doNotDo: string[];
    proofRequired: string[];
    reassessmentTriggers: string[];
    redDomains: string[];
    ownerOffload: string;
    overallConfidence: string;
    approvalRequired: boolean;
  };
  /** From the readiness runtime (blockers gate the accuracy card). */
  readiness?: { blockers: string[]; overallScore: number } | null;
  /** From the action-assignment runtime (who owns the action + proof type). */
  action?: { responsibleParty: string; proofType: string; escalationTrigger: string } | null;
  /** From the input-guidance runtime (next best input + must-wait). */
  guidance?: { nextBestInput: string | null; canProceedWithStrongRecommendation: boolean } | null;
}

const SEVERITY_RANK: Record<PrioritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function confidenceNote(confidence: string, canProceed: boolean): string {
  if (!canProceed) return `Confidence is ${confidence}; strong actions are paused until critical data is supplied.`;
  if (confidence === "high") return "Confidence is high — safe to act on this.";
  return `Confidence is ${confidence}; treat this as directional and confirm with more data where you can.`;
}

/** Build the capped, severity-ordered top priorities from the live runtime signals. */
export function buildPriorityCommandStrip(input: PriorityStripInput): PriorityCard[] {
  if (!input.wbp.found) return [];

  const { wbp } = input;
  const canProceed = input.guidance?.canProceedWithStrongRecommendation ?? true;
  const cards: PriorityCard[] = [];

  // 1) Accuracy / missing-data — only when readiness is actually blocked (never a fake green).
  if (input.readiness && input.readiness.blockers.length > 0) {
    cards.push({
      id: "accuracy",
      severity: "critical",
      whatIsWrong: "Key business data is missing, so OpsIQ can't fully trust the diagnosis.",
      whyItMatters: input.readiness.blockers[0],
      nextStep: input.guidance?.nextBestInput ? `Add your ${input.guidance.nextBestInput.replace(/_/g, " ")} next.` : "Complete the minimum inputs.",
      owner: "Owner",
      proof: "The supplied records themselves are the proof.",
      reassess: "OpsIQ re-scores readiness as soon as the data is added.",
      confidenceNote: confidenceNote(wbp.overallConfidence, canProceed),
    });
  }

  // 2) The dominant constraint / next best action — the single most important move.
  cards.push({
    id: "next_action",
    severity: canProceed ? "high" : "medium",
    whatIsWrong: `Plan analysis constraint: ${wbp.topPriorityLabel}.`,
    whyItMatters: `The plan analysis sees this as its dominant constraint (${wbp.dominantConstraint.replace(/_/g, " ")}).`,
    nextStep: wbp.nextBestAction,
    owner: input.action?.responsibleParty ? cap(input.action.responsibleParty) : wbp.approvalRequired ? "Owner (approval required)" : "Owner",
    proof: input.action?.proofType ? `${input.action.proofType.replace(/_/g, " ")} proof` : wbp.proofRequired[0] ?? "Completion proof",
    reassess: wbp.reassessmentTriggers[0] ?? "After the action's proof is accepted.",
    confidenceNote: confidenceNote(wbp.overallConfidence, canProceed),
  });

  // 3) Do-not-do — stop a harmful move.
  if (wbp.doNotDo.length > 0) {
    cards.push({
      id: "do_not_do",
      severity: "high",
      whatIsWrong: `Stop: ${wbp.doNotDo[0]}`,
      whyItMatters: "Doing this now would make the dominant constraint worse.",
      nextStep: "Hold this action until the constraint above is cleared.",
      owner: "Owner",
      proof: "No proof needed — this is a stop instruction.",
      reassess: wbp.reassessmentTriggers[0] ?? "When the dominant constraint changes.",
      confidenceNote: confidenceNote(wbp.overallConfidence, canProceed),
    });
  }

  // 4) Cash / margin risk — when a financial domain is red.
  if (wbp.redDomains.some((d) => /cash|margin|finance|working/i.test(d))) {
    cards.push({
      id: "cash_margin",
      severity: "critical",
      whatIsWrong: "A cash or margin domain is in the red.",
      whyItMatters: "Financial risk can threaten survival.",
      nextStep: wbp.nextBestAction,
      owner: wbp.approvalRequired ? "Owner (approval required)" : "Owner",
      proof: "Updated cash / P&L figures.",
      reassess: "After the next cash or finance update.",
      confidenceNote: confidenceNote(wbp.overallConfidence, canProceed),
    });
  }

  // 5) Proof outstanding — delegated work needs verification.
  if (wbp.proofRequired.length > 0) {
    cards.push({
      id: "proof",
      severity: "medium",
      whatIsWrong: `${wbp.proofRequired.length} action(s) need proof before they count as done.`,
      whyItMatters: "Unverified work corrupts the diagnosis and learning.",
      nextStep: `Collect: ${wbp.proofRequired[0]}.`,
      owner: wbp.ownerOffload && wbp.ownerOffload !== "—" ? "Manager / staff (OpsIQ-prepared)" : "Owner",
      proof: wbp.proofRequired[0],
      reassess: input.action?.escalationTrigger ?? "Escalates to the owner if proof is overdue.",
      confidenceNote: confidenceNote(wbp.overallConfidence, canProceed),
    });
  }

  return cards.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 5);
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
