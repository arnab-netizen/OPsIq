import { redirect } from "next/navigation";

export const metadata = {
  title: "Decision Inbox | Rebilix",
  description: "Govern and approve business decisions",
};

// UI-02: the former DecisionInboxTable at this route hardcoded `setDecisions([])` and
// could never show a decision (it also fetched the wrong endpoint). The real, working
// inbox lives at /dashboard/inbox (a server component that enforces the session +
// workspace and fetches /api/decisions/list). Redirect here so the pretty URL lands on
// the operational inbox instead of a permanently-empty cosmetic table.
export default function DecisionsPage() {
  redirect("/dashboard/inbox");
}
