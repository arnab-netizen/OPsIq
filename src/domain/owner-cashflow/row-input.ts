/* eslint-disable @typescript-eslint/no-explicit-any -- a persisted Prisma row is untyped here; the mapping is the contract */
import type { CashflowSnapshotInput } from "./types";

/** Map a persisted snapshot row back to the engine input shape (the ONE mapping; services re-export it). */
export function rowToCashflowInput(row: any): CashflowSnapshotInput {
  return {
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    currency: row.currency,
    businessModel: row.businessModelType ?? undefined,
    industryTemplate: row.industryTemplate ?? undefined,
    cashInHand: row.cashInHand ?? undefined,
    bankBalance: row.bankBalance ?? undefined,
    dailyCollections: row.dailyCollections ?? undefined,
    receivables: row.receivables ?? undefined,
    receivablesOverdue: row.receivablesOverdue ?? undefined,
    payables: row.payables ?? undefined,
    payablesOverdue: row.payablesOverdue ?? undefined,
    upcomingEmi: row.upcomingEmi ?? undefined,
    rentDue: row.rentDue ?? undefined,
    salaryDue: row.salaryDue ?? undefined,
    vendorDue: row.vendorDue ?? undefined,
    taxDue: row.taxDue ?? undefined,
    ownerWithdrawal: row.ownerWithdrawal ?? undefined,
    notes: row.notes ?? undefined,
  };
}
