/* eslint-disable @typescript-eslint/no-explicit-any */
/** Minimal in-memory stand-in for the Prisma surface the Paddle webhook service uses. */
export interface Row { [k: string]: any }

export function createFakeBillingDb() {
  const plans: Row[] = [];
  const accounts: Row[] = [];
  const subs: Row[] = [];
  const audits: Row[] = [];
  const match = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Row[]).some((w) => match(row, w));
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const o = v as Row;
        if ("lte" in o) return row[k] != null && row[k] <= o.lte;
        if ("lt" in o) return row[k] != null && row[k] < o.lt;
        return false;
      }
      return row[k] === v;
    });
  const tx = {
    plan: { findUnique: async ({ where }: Row) => plans.find((r) => match(r, where)) ?? null },
    billingAccount: {
      findUnique: async ({ where }: Row) => accounts.find((r) => match(r, where)) ?? null,
      update: async ({ where, data }: Row) => Object.assign(accounts.find((r) => match(r, where))!, data),
    },
    subscription: {
      findUnique: async ({ where }: Row) => subs.find((r) => match(r, where)) ?? null,
      create: async ({ data }: Row) => { const row = { cancelAtPeriodEnd: false, ...data }; subs.push(row); return row; },
      updateMany: async ({ where, data }: Row) => {
        const hit = subs.filter((r) => match(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
  };
  return {
    plans, accounts, subs, audits,
    db: { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) },
  };
}
