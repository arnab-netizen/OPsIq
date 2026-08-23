/**
 * Registers the window.prompt()-driven action completion/verification
 * dialog handler shared by every Owner domain page that follows the
 * Finance/Sales/Operations/Strategy/Cashflow action-lifecycle pattern
 * (updateAction/verifyAction calling window.prompt for completion notes,
 * completion evidence, and before/after verification values -- there are
 * no dedicated form fields for these, confirmed from source across every
 * domain page that shares this pattern).
 *
 * Matched by prompt message content (substring), not call order or exact
 * domain wording, so this is robust regardless of how many times either
 * flow runs and works unchanged across every domain page, since each
 * page's prompt text always contains these same substrings (e.g. Sales'
 * "BEFORE value for {metric}:" still contains "BEFORE value").
 *
 * Recovery's completion flow (founder-recovery, owner/recovery/page.tsx)
 * diverges from this shared pattern -- it prompts for "Completion notes:"
 * (covered above) and "Actual outcome:" (its own required field, not
 * "Completion evidence") -- confirmed from source, not assumed. Its
 * verify flow's "Enter the AFTER value for {metric} (baseline {v}):"
 * prompt is left unhandled here deliberately: Recovery's acceptance spec
 * calls the verify endpoint directly instead of driving this dialog, so
 * it can pick an after-value that provably reaches this action's own
 * target rather than relying on this handler's fixed "50".
 */
import type { Page } from "@playwright/test";

export function registerActionDialogHandler(page: Page): void {
  page.on("dialog", async (dialog) => {
    const msg = dialog.message();
    if (msg.includes("Completion notes")) return dialog.accept("Live production acceptance: completion notes");
    if (msg.includes("Completion evidence")) return dialog.accept("acceptance-test-evidence-reference");
    if (msg.includes("Actual outcome")) return dialog.accept("Live production acceptance: outcome improved");
    if (msg.includes("BEFORE value")) return dialog.accept("100");
    if (msg.includes("AFTER value")) return dialog.accept("50");
    if (msg.includes("Target direction")) return dialog.accept("down");
    await dialog.dismiss();
  });
}
