/**
 * Test seed: a Cashflow snapshot that records a KNOWN bank balance for a period, so Finance-seeded
 * fixtures have a COMPLETE liquidity position (cash in hand + bank) under the A1 liquidity contract.
 * `bankBalance: 0` means "the owner holds nothing in the bank" (a fact), which keeps total liquid funds
 * equal to the seeded cash in hand.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export async function seedKnownBank(
  workspaceId: string,
  businessId: string,
  bankBalance = 0,
  period: { start: string; end: string } = { start: "2026-05-01", end: "2026-05-31" }
): Promise<void> {
  await db.ownerCashflowSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      periodStart: new Date(period.start), periodEnd: new Date(period.end), currency: "INR",
      bankBalance, dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
}
