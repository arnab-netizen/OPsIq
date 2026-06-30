/**
 * Deterministic IDs for the owner-pilot browser lane. Imported by BOTH the seed
 * (`scripts/seed-e2e-owner-pilot.ts`) and the Playwright specs (15/16/17) so the browser tests can
 * select deterministically-seeded businesses without scraping IDs out of the UI.
 *
 * Each pilot business is seeded with ONLY the universal financial minimum (revenue/expenses/cash), so
 * the type-specific required input is still MISSING — that is how the specs prove "business type
 * affects requested inputs" (laundry needs equipment logs, B2B needs contracts, multi-location needs
 * branch records). The WEAK business has no financial data at all (low confidence + missing-data).
 */
export const PILOT_LAUNDRY_BIZ = "30000000-0000-4000-8000-00000000aa01";
export const PILOT_B2B_BIZ = "30000000-0000-4000-8000-00000000aa02";
export const PILOT_MULTI_BIZ = "30000000-0000-4000-8000-00000000aa03";
export const PILOT_WEAK_BIZ = "30000000-0000-4000-8000-00000000aa04";

export interface PilotBizFixture {
  id: string;
  label: string;
  businessType: string;
  operatingModel: string;
  /** The type-specific minimum input that must show as MISSING in onboarding/guidance. */
  expectMissingCategory: string;
  /** true ⇒ seeded with the universal financial minimum; false ⇒ no financial data (weak). */
  hasFinancialMinimum: boolean;
}

export const PILOT_BUSINESSES: PilotBizFixture[] = [
  { id: PILOT_LAUNDRY_BIZ, label: "Pilot: Sparkle Laundry", businessType: "Laundry & dry cleaning", operatingModel: "owner_operated", expectMissingCategory: "equipment", hasFinancialMinimum: true },
  { id: PILOT_B2B_BIZ, label: "Pilot: FacilityCare B2B", businessType: "B2B facility maintenance contracts", operatingModel: "owner_operated", expectMissingCategory: "contract", hasFinancialMinimum: true },
  { id: PILOT_MULTI_BIZ, label: "Pilot: 3-Branch Tiffin", businessType: "3-branch outlet chain", operatingModel: "multi_location", expectMissingCategory: "branch", hasFinancialMinimum: true },
  { id: PILOT_WEAK_BIZ, label: "Pilot: Weak Cleaning Co", businessType: "Housekeeping & cleaning services", operatingModel: "owner_operated", expectMissingCategory: "revenue", hasFinancialMinimum: false },
];
