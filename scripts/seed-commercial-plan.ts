/**
 * Idempotently registers the single sellable plan against its Paddle price id.
 * Run once per environment AFTER the migration and BEFORE enabling checkout:
 *   PADDLE_PRICE_ID=pri_... npx tsx scripts/seed-commercial-plan.ts
 * Plan name must contain "pro" so resolveWorkspaceTier maps it to the "pro" tier.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

async function main() {
  const priceId = process.env.PADDLE_PRICE_ID?.trim();
  if (!priceId) throw new Error("PADDLE_PRICE_ID is required");
  const monthly = Number(process.env.PADDLE_PLAN_PRICE_MONTHLY ?? "0");
  if (!Number.isFinite(monthly) || monthly <= 0) throw new Error("PADDLE_PLAN_PRICE_MONTHLY (display price) must be > 0");
  const plan = await db.plan.upsert({
    where: { paddlePriceId: priceId },
    update: { active: true },
    create: {
      id: randomUUID(),
      name: "OpsIQ Pro",
      description: "OpsIQ governed business intervention — full access",
      priceMonthly: monthly,
      priceYearly: monthly * 12,
      paddlePriceId: priceId,
    },
    select: { id: true, name: true },
  });
  console.log(`commercial plan ready: ${plan.name} (${plan.id})`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
