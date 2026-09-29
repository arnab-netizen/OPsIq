import { redirect } from "next/navigation";

// Retired owner page (owner-decision consolidation). /owner/first-value had no navigation entry or deep
// link and no self-serve owner job of its own: it presented consulting-engagement data (and its export
// carried the engagement's own "recommended first action") beside the canonical owner decision, so it
// kept acting as a second adviser. The owner's first action is the canonical decision on the Cockpit.
// The engagement data itself stays readable through its API route; no history is deleted.
export default function FirstValuePage() {
  redirect("/owner/cockpit");
}
