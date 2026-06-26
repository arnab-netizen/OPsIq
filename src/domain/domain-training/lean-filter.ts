/**
 * F13 — Owner-mode lean filter (pure).
 *
 * Enforces the lean operating principle on every recommendation: reduce waste / protect
 * value, no needless admin, no staff/owner overload, protect profit + service quality,
 * support sustainable growth, prefer the simplest lower-risk action. Wires the M7
 * lean-guardrail principle into the training harness. Pure + deterministic.
 */

export interface LeanInput {
  reducesWasteOrProtectsValue: boolean;
  addsUnnecessaryAdmin: boolean;
  overloadsStaff: boolean;
  overloadsOwner: boolean;
  protectsProfit: boolean;
  protectsServiceQuality: boolean;
  supportsSustainableGrowth: boolean;
  simplerSafeOptionExists: boolean;
  complexityJustified: boolean;
  // relaxers (must be PROVEN, never owner preference)
  survivalCritical: boolean;
  emergencyTemporary: boolean;
  profitDamageJustified: boolean;
}

export interface LeanResult {
  pass: boolean;
  failures: string[];
}

export function checkLean(i: LeanInput): LeanResult {
  const failures: string[] = [];
  if (!i.reducesWasteOrProtectsValue) failures.push("no_waste_reduction_or_value_protection");
  if (i.addsUnnecessaryAdmin) failures.push("adds_unnecessary_admin");
  if (!i.protectsServiceQuality) failures.push("damages_service_quality");
  if (!i.supportsSustainableGrowth) failures.push("not_sustainable");
  // complexity-heavy fails if a simpler safe option exists and complexity is unjustified
  if (i.simplerSafeOptionExists && !i.complexityJustified) failures.push("unjustified_complexity");
  // owner-heavy fails unless survival-critical
  if (i.overloadsOwner && !i.survivalCritical) failures.push("overloads_owner_non_survival");
  // staff-overloading fails unless emergency and temporary
  if (i.overloadsStaff && !i.emergencyTemporary) failures.push("overloads_staff_non_emergency");
  // profit-damaging fails unless survival/recovery reason proven
  if (!i.protectsProfit && !i.profitDamageJustified) failures.push("damages_profit_unjustified");
  return { pass: failures.length === 0, failures };
}
