/**
 * QuickBooks Online — governed owner write actions.
 *
 * GET  /api/owner/integrations/quickbooks/actions?view=expense-accounts
 *      → { accounts: [{ id, name, accountType }] }                      (OWNER_VIEW)
 * GET  /api/owner/integrations/quickbooks/actions?view=record-actions&type=PurchaseOrder&ids=a,b
 *      → { records: QboRecordActionsDTO[] }  (server-decided eligibility; [] when not connected)
 * GET  /api/owner/integrations/quickbooks/actions?view=links&type=PurchaseOrder&ids=a,b
 *      → { links: [{ opsiqEntityId, entityType, remoteId, remoteStatus }] } (OWNER_VIEW)
 * POST /api/owner/integrations/quickbooks/actions                       (OWNER_MANAGE)
 *      { action: "push_vendor", vendorId }
 *      { action: "push_customer", customerId }
 *      { action: "push_purchase_order", purchaseOrderId, expenseAccountId, confirm: true }
 *      { action: "record_bill", purchaseOrderId, expenseAccountId, dueDate?, confirm: true }
 *      { action: "inactivate", kind: "vendor"|"customer", recordId, confirm: true }
 *
 * The browser never sends QuickBooks JSON: it names an OpsIQ record and an
 * owner choice; the service builds the QBO body from the governed record.
 * Duplicate submission is impossible by construction — each action's
 * idempotency key is derived server-side from the business intent.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { ValidationError } from "@/infra/errors";
import {
  pushVendorToQuickBooks,
  pushCustomerToQuickBooks,
  pushPurchaseOrderToQuickBooks,
  recordBillForPurchaseOrder,
  inactivatePartyInQuickBooks,
  listQuickBooksExpenseAccounts,
  getQuickBooksLinks,
  getQuickBooksRecordActions,
} from "@/services/quickbooks/qbo-write-actions.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const qboId = z.string().regex(/^[0-9]{1,32}$/);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("push_vendor"), vendorId: z.string().uuid() }),
  z.object({ action: z.literal("push_customer"), customerId: z.string().uuid() }),
  z.object({
    action: z.literal("push_purchase_order"),
    purchaseOrderId: z.string().uuid(),
    expenseAccountId: qboId,
    confirm: z.literal(true),
  }),
  z.object({
    action: z.literal("record_bill"),
    purchaseOrderId: z.string().uuid(),
    expenseAccountId: qboId,
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    confirm: z.literal(true),
  }),
  z.object({
    action: z.literal("inactivate"),
    kind: z.enum(["vendor", "customer"]),
    recordId: z.string().uuid(),
    confirm: z.literal(true),
  }),
]);

const linkTypeSchema = z.enum(["VendorRecord", "CustomerRecord", "PurchaseOrder"]);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const view = url.searchParams.get("view");
    if (view === "expense-accounts") {
      const accounts = await listQuickBooksExpenseAccounts(ctx.verifiedWorkspaceId);
      return canonicalJson({ accounts }, { status: 200 });
    }
    if (view === "record-actions" || view === "links") {
      const type = linkTypeSchema.safeParse(url.searchParams.get("type"));
      const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
      const idsOk = z.array(z.string().uuid()).max(200).safeParse(ids);
      if (!type.success || !idsOk.success) throw new ValidationError("Invalid link query.");
      if (view === "record-actions") {
        const records = await getQuickBooksRecordActions({ workspaceId: ctx.verifiedWorkspaceId, type: type.data, ids: idsOk.data });
        return canonicalJson({ records }, { status: 200 });
      }
      const links = await getQuickBooksLinks({ workspaceId: ctx.verifiedWorkspaceId, opsiqEntityType: type.data, ids: idsOk.data });
      return canonicalJson({ links }, { status: 200 });
    }
    throw new ValidationError("Unknown view.");
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, actionSchema);
    const base = { workspaceId: ctx.verifiedWorkspaceId as string, actorId: ctx.verifiedActorId };
    let result;
    switch (input.action) {
      case "push_vendor":
        result = await pushVendorToQuickBooks({ ...base, vendorId: input.vendorId });
        break;
      case "push_customer":
        result = await pushCustomerToQuickBooks({ ...base, customerId: input.customerId });
        break;
      case "push_purchase_order":
        result = await pushPurchaseOrderToQuickBooks({
          ...base,
          purchaseOrderId: input.purchaseOrderId,
          expenseAccountId: input.expenseAccountId,
          confirm: input.confirm,
        });
        break;
      case "record_bill":
        result = await recordBillForPurchaseOrder({
          ...base,
          purchaseOrderId: input.purchaseOrderId,
          expenseAccountId: input.expenseAccountId,
          dueDate: input.dueDate,
          confirm: input.confirm,
        });
        break;
      case "inactivate":
        result = await inactivatePartyInQuickBooks({ ...base, kind: input.kind, recordId: input.recordId, confirm: input.confirm });
        break;
    }
    return canonicalJson(
      { result: { action: result.action, remoteId: result.remoteId, replayed: result.replayed } },
      { status: 200 },
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
