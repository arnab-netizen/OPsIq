"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/ui/primitives";
import { CAPABILITIES, type CapabilityName } from "@/domain/constants/capabilities";

/**
 * Minimal inline icon set for the primary nav items only — a real usability test found the
 * sidebar "looked like plain text" with no way to visually scan it. Icons are deliberately
 * limited to the handful of items an owner needs to recognize at a glance -- the three primary
 * entries (Start Here, Home, My Business) plus the one high-frequency item at the top of
 * Actions -- rather than applied to every leaf item, which would read as decoration rather than
 * recognition (see the anti-AI-template audit: "icons beside every heading" is a rejected
 * pattern). Four icons across ~20 nav items, not an icon-per-row system. (A fifth, AttentionIcon,
 * was retired along with the "What needs attention" nav item it labeled -- see the "priorities"
 * section below.)
 */
function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.5 9.5-2 5-3-1.5 2-5 3 1.5Z" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M4 21h15M9 8h1M9 12h1M13 8h1M13 12h1M14 21v-4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v4M18 21v-9l2 1v8" />
    </svg>
  );
}
function TaskIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="4.5" y="4" width="15" height="16" rx="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12 2 2 4-4.5" />
    </svg>
  );
}

/**
 * Owner / consulting / admin navigation — persona-sectioned single sidebar (IA Model B).
 *
 * Controlled-beta owner IA (PR C — navigation/exposure consolidation): the owner's mental model
 * is Home ("what needs my attention") → Business ("what evidence/context explains it") →
 * Priorities/Actions ("what am I doing about it") → Evidence & Trust ("why does OpsIQ say
 * this / what can I verify") → More from OpsIQ ("what else exists or is coming"). Sections are
 * named for the question the owner is asking, not for internal module structure, and Money /
 * Sales / Operations sit together under one "Business" disclosure rather than as three
 * unrelated top-level peers.
 *
 * 1. GROUPED, not flat. The primary path (Start Here → Home → My Business, then the standalone
 *    Evidence & Trust entry) sits above everything else, ungrouped, so it's never buried inside a
 *    collapsed section. "Business" (Money/Sales/Operations/Customer records/etc.) and "More from
 *    OpsIQ" / "Settings & account" (occasional-use and not-yet-core pages) start collapsed;
 *    "Priorities" and "Actions" (small, high-frequency lists) start open.
 *
 * 2. PREVIEW / COMING SOON are explicit, visible states, not silent omissions or dead links.
 *    Recovery, Strategy, Marketing, Campaigns, Compliance, Procurement, and Starting up are real,
 *    reachable pages not yet part of the core controlled-beta workflow — each renders as a normal
 *    link with a "Preview" pill (see each item's own comment for why: Compliance's proactive
 *    detection and Procurement's connection to Inventory/Vendors are both real gaps, not
 *    polish; Starting up is a different-persona tool, not an incomplete one). AI Copilot and
 *    Integrations have no owner-facing page at all yet — each renders as a non-interactive row
 *    (no `<a>`, not part of the tab order) with a "Coming soon" pill and a one-line explanation,
 *    so neither looks like a broken control nor implies a working feature the app doesn't have
 *    (no QuickBooks/HubSpot connection exists; there is no working AI assistant surface).
 *    Inventory has no nav entry at all: its one system-generated signal is wired to nothing and
 *    always displays a wrong result today (see its removal comment in the "business" section
 *    below) — a known-wrong live feature, not merely unfinished. Nothing here invents a new page
 *    merely to populate the nav.
 *
 * 3. LONGEST-MATCH active state. The previous `pathname.startsWith(item.href)` test highlighted
 *    "/dashboard" while the user was on "/dashboard/inbox". Active state is now the single
 *    longest-matching entry, so a child route never lights up its unrelated parent.
 *
 * 4. PERSONA-SECTIONED. Consulting-only surfaces (Clients/Engagements/Leads/consulting dashboard)
 *    live in their own "Consulting" section, and "Administration" surfaces the previously
 *    nav-orphaned /admin/billing route to SYSTEM_ADMIN holders. Nothing changed about WHO can see
 *    an item — every gate below is the same `requiresOwner`/`requiresCapability` check as before
 *    (or, for /admin/billing, the same per-item capability pattern already used for
 *    Clients/Engagements/Leads/User accounts) — only WHERE it renders changed. Because a section
 *    that ends up with zero visible items renders nothing (see the `visibleItems.length === 0`
 *    check below), "Consulting" and "Administration" automatically disappear for the self-serve
 *    owner population that holds neither set of capabilities — this is what makes it a
 *    persona-sectioned single sidebar (Model B) rather than a capability-filtered flat list
 *    (Model A) or a separate owner/consulting mode switch (Model C): one sidebar, sections that
 *    only exist when the signed-in capability set makes them relevant, no separate "mode" the
 *    user has to toggle. These two sections are unchanged by PR C (out of scope: consultant/admin
 *    personas, not the owner-facing IA).
 *
 *    Today that "Consulting" section is dormant for real production traffic: the only
 *    production-reachable role-assignment path (POST /api/auth/signup) always grants
 *    ADMIN_OR_PORTFOLIO_MANAGER narrowed to OWNER_SCOPED_CAPABILITIES (see
 *    src/policies/capability-check.ts), which holds none of CLIENT_VIEW/ENGAGEMENT_VIEW/
 *    LEAD_VIEW — a genuine consultant/portfolio-manager capability set is reachable only via an
 *    existing SYSTEM_ADMIN (dev/demo seeding), which nothing in production creates yet. The
 *    section is kept, correctly gated, and ready for whenever that path exists — it is not
 *    removed just because it is unpopulated today.
 *
 * Routes are grouped, not removed — every previously reachable deep link still works. "People"
 * was renamed to "User accounts": /users lists UserRow + role assignments (account/user
 * administration), not an HR/employee directory, so the old label overclaimed what the page does.
 * "Customers" was renamed to "Customer records" and demoted out of the primary "Business"
 * section: it is isolated CRUD (create/list/tag customer rows) not consumed by any diagnosis,
 * recommendation, or Home/Pulse signal today, so it does not warrant peer prominence with Money /
 * Sales / Operations — the route itself is unchanged and still reachable.
 *
 * 5. MULTI-BUSINESS CONTEXT CLOSURE (final controlled-beta P1 pass, follow-on to PR C). A hostile
 *    re-audit proved several surfaces either leaked or risked leaking a different business's data
 *    into the currently-selected business's context within one workspace:
 *    - Customer Records' getCustomer/updateCustomer had no businessId scoping at all (fixed in the
 *      service layer, not here — see customer.service.ts).
 *    - "What needs attention" (/owner/priorities) and "Alerts" (/owner/alerts) are both removed
 *      from this nav; see the "priorities" section comment below for why. Routes/pages/APIs are
 *      untouched.
 *    - "Risk" is marked Preview; BusinessRiskEntry has no businessId column (workspace-scoped
 *      only), so a multi-business owner cannot tell which business a given risk belongs to.
 *    None of this touched single-business behavior, which was already correct in every case.
 */

interface NavItem {
  label: string;
  /**
   * Omitted only for a "coming-soon" item with no owner-facing page yet (AI Copilot,
   * Integrations) — that item renders as a non-interactive informational row instead of a link,
   * so there is nothing to navigate to and nothing that looks clickable but isn't.
   */
  href?: string;
  /** Only shown to users with the OWNER_VIEW capability. */
  requiresOwner?: boolean;
  /**
   * Only shown to users whose resolved capability set (role -> ROLE_CAPABILITIES, the same
   * source `canViewOwnerRecovery` reads OWNER_VIEW from) includes this capability. Named per
   * item rather than one shared flag because the consultant-facing surfaces below are backed by
   * different capabilities on their own API routes (e.g. /clients requires CLIENT_VIEW, /leads
   * requires LEAD_VIEW) — this keeps the nav gate in parity with the real per-route requirement
   * instead of a single coarse "consultant" bit that would over- or under-hide relative to what
   * the backend actually allows.
   */
  requiresCapability?: CapabilityName;
  /** Rendered before the label. Reserved for the small set of primary items an owner needs to
   *  recognize at a glance — see the file-level comment on the icon components above. */
  icon?: ReactNode;
  /**
   * "preview" = a real, reachable page (has `href`) not yet part of the core controlled-beta
   * workflow; rendered as a normal link with a visible "Preview" pill so it's still clearly
   * distinguishable from a core working area. "coming-soon" = no working page exists yet; rendered
   * as a non-link row (no `href`) so it can never be mistaken for working functionality.
   */
  state?: "preview" | "coming-soon";
  /** One-line, owner-facing value explanation shown under the label for preview/coming-soon items
   *  only — core working items are self-explanatory from their label alone. */
  blurb?: string;
}

interface NavSection {
  id: string;
  /** Null for the primary items, which render above any section heading. */
  title: string | null;
  items: NavItem[];
  /** Sections the owner opens occasionally start collapsed. */
  collapsedByDefault?: boolean;
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "primary",
    title: null,
    items: [
      // First item, deliberately: a real usability test's headline failure was "I don't know
      // where to start." This is the persistent, resumable guided-setup entry point (see
      // src/app/(authenticated)/owner/start-here/page.tsx) — always visible, never a one-time
      // tour that disappears once dismissed.
      { label: "Start Here", href: "/owner/start-here", requiresOwner: true, icon: <CompassIcon /> },
      { label: "Home", href: "/owner/cockpit", requiresOwner: true, icon: <HomeIcon /> },
      // Renamed from "Add & Connect Data": /owner/data IS "My Business" -- the single place an
      // owner tells OpsIQ about their business and keeps its information current (its own file
      // header already described it this way). A fresh owner should not have to learn the
      // difference between a top-level "Add & Connect Data" concept and a separate "My Business"
      // section; there is exactly one. The deeper business-state drill-downs (Money, Sales,
      // Operations, etc.) live in the "Business" section below, not a second front door.
      { label: "My Business", href: "/owner/data", requiresOwner: true, icon: <BuildingIcon /> },
    ],
  },
  {
    // Evidence & Trust is its own top-level peer, not buried in a settings grab-bag: "why does
    // OpsIQ say this / what can I verify" is one of the owner's core mental-model questions
    // (PR C). Ungrouped like the primary section above (no collapse needed for one item). Label
    // deliberately NOT "History" -- /owner/trust surfaces the real explanations/audit-trail
    // endpoints this page already wires up (see src/__tests__/owner-trust/trust-page.test.ts),
    // but no code change here claims a longitudinal diagnosis→recommendation→action→outcome→
    // verification trace beyond what that page actually renders.
    id: "evidence-trust",
    title: null,
    items: [{ label: "Evidence & Trust", href: "/owner/trust", requiresOwner: true }],
  },
  {
    // "Business" — Money, Sales, and Operations grouped under one disclosure so they read as
    // three views into one business, not three unrelated mini-apps (PR C requirement). Customer
    // records, Risk, Goals, and Vendors stay reachable here too, just lower in the list -- none
    // of these routes were removed, only regrouped. Collapsed by default: these are pages a lay
    // owner opens deliberately, not the first things they need to see (see
    // OPSIQ_DESIGN_DIRECTION.md §18 — a first-time owner is not shown ~24 peer destinations on
    // day one). Compliance and Procurement are marked Preview (see each item's own comment
    // below) rather than presented as full peers; Inventory has no entry at all (see below);
    // Starting up moved to "More from OpsIQ" (see that section) as a different-persona tool, not
    // a drill-down into the owner's own operating business.
    id: "business",
    title: "Business",
    collapsedByDefault: true,
    items: [
      { label: "Money", href: "/owner/finance", requiresOwner: true },
      { label: "Sales", href: "/owner/sales", requiresOwner: true },
      { label: "Operations", href: "/owner/operations", requiresOwner: true },
      // Renamed from "Customers": /owner/customers is isolated CRUD (create/list/tag customer
      // rows, see src/services/owner-sales/customer.service.ts) -- not read by any diagnosis,
      // recommendation, or Home/Pulse signal today, so it is demoted out of the Money/Sales/
      // Operations trio rather than presented as a fourth peer decision domain. "Customer
      // records" is deliberately distinct from any future "Customer Intelligence" capability
      // (churn/retention/concentration analysis) -- no such capability exists in this app, and
      // nothing here implies one does.
      { label: "Customer records", href: "/owner/customers", requiresOwner: true },
      // Preview: BusinessRiskEntry has no businessId column at all (workspace-scoped only,
      // confirmed via schema + service read) -- an owner running more than one business sees the
      // same risk register regardless of which business is currently selected, with no way to
      // tell which business a given risk actually belongs to. Home's own topRisks feed was
      // separately confirmed to bypass hasAnyRealBusiness() and has been fixed to match the
      // canonical listBusinessRisks() gate; that staleness fix is unrelated to this multi-business
      // scoping gap.
      //
      // REMOVED FROM NAV (was previously marked Preview): live production browser acceptance
      // (controlled-beta launch-blocker audit) proved BusinessRiskEntry has no businessId column
      // at all -- it is workspace-wide with zero per-business attribution -- and confirmed the SAME
      // underlying risk record IDs render under every business selected in a multi-business
      // workspace, not just in a hypothetical edge case. The prior "single-business workspaces (the
      // beta norm) see fully correct behavior today" reasoning was the exact "beta customers
      // probably only have one business" assumption this app must not rely on: the product does not
      // enforce a one-business admission rule, so any workspace can and does hold more than one real
      // business, and Risk cannot safely distinguish between them. Closing this narrowly requires a
      // schema change (add businessId, backfill, filter) which is out of scope for a launch-blocker
      // fix -- hidden rather than broadened, per this app's own "prefer hiding over expanding scope"
      // rule. Route, page, and service code are untouched; only this nav link is gone.
      // { label: "Risk", href: "/owner/risks", requiresOwner: true, state: "preview" },
      // Preview: the compliance calendar's reactive expired-item action gate is live and
      // production-solid, but its proactive expiring/overdue detection (getComplianceReviewItems)
      // has no caller anywhere in the app -- it never reaches Home, Priorities, or Alerts, only
      // the page itself. Marked Preview rather than a core peer until that gap closes.
      {
        label: "Compliance",
        href: "/owner/compliance",
        requiresOwner: true,
        state: "preview",
        blurb: "Track licences, permits, and deadlines; blocks other actions when one has expired.",
      },
      { label: "Goals", href: "/owner/goals", requiresOwner: true },
      // Inventory intentionally has no nav entry: its one system-generated signal (the
      // reorder-risk badge) is wired to nothing -- getReorderSuggestions is never called from
      // the live API route, so the badge always renders "NONE" regardless of real stock levels.
      // Route and implementation are untouched; only the nav link is removed until that wiring
      // is fixed and tested.
      // Preview: a real, transactional purchase-order lifecycle, but fully disconnected from
      // Inventory (delivery never updates stock) and from Vendors (vendorId has no FK, vendorName
      // is free text) -- an isolated workflow, not yet part of a connected operations chain.
      {
        label: "Procurement",
        href: "/owner/procurement",
        requiresOwner: true,
        state: "preview",
        blurb: "Track purchase orders through their own lifecycle. Not yet connected to Inventory or Vendors.",
      },
      { label: "Vendors", href: "/owner/vendor", requiresOwner: true },
      // /api/diagnosis requires ENGAGEMENT_CREATE (a consulting-engagement capability no
      // self-serve beta owner holds — this is the legacy consultant "create an engagement
      // diagnosis" page, not the self-serve owner's own business diagnosis, which lives
      // under Home/first-result and /owner/finance instead). Gated to match its real API. This
      // is not a per-domain diagnosis nav concept (PR C explicitly does not add one) -- Money,
      // Sales, and Operations each already run their diagnosis from their own page, unlinked
      // here.
      { label: "Diagnosis", href: "/diagnosis", requiresCapability: CAPABILITIES.ENGAGEMENT_CREATE },
    ],
  },
  {
    // "Priorities" — what needs the owner's attention right now. Split out of the former flat
    // "Actions" section so urgency (Priorities) and execution (Actions) aren't one undifferentiated
    // list; kept open by default since this is exactly what a returning owner checks first.
    //
    // "What needs attention" (/owner/priorities) and "Alerts" (/owner/alerts) were both removed
    // from this section -- route/page/API/service code for both is untouched, only the nav link is
    // gone:
    //  - Priorities is a domain-biased subset (manual risk entries + alerts + the generic
    //    cross-cutting process bridge -- NOT Sales's or Operations's diagnosis findings, and not
    //    even Money's own financeTopPriority) that makes a "one place" completeness claim
    //    (page copy: "That's everything OpsIQ is tracking as a priority right now") Cockpit's own
    //    canonical surface (/owner/cockpit) doesn't make and can't back up -- a reproducible case
    //    exists where Priorities shows "nothing needs attention" while Cockpit is simultaneously
    //    showing an actionable Finance item as its primary card. Home/Cockpit remains the single
    //    authoritative "what needs my attention" surface for controlled beta.
    //  - Alerts has no businessId column at all (Alert model is workspaceId-scoped only, confirmed
    //    via schema), so a multi-business owner sees every business's alerts merged with no
    //    attribution regardless of which business is selected -- the same class of gap as Risk
    //    above, but with no businessId column to even filter on, so there is no narrow fix.
    id: "priorities",
    title: "Priorities",
    items: [
      // Decision Inbox reads OperatorItem rows via /api/decisions/list, which requires
      // ENGAGEMENT_VIEW -- a consulting-engagement capability no self-serve beta owner
      // holds (OperatorItem is a consultant<->client recommendation-approval workflow,
      // not an owner-operator concept; the owner-facing equivalent already lives at
      // /owner/priorities and /owner/opportunities/decide). Without this gate the link
      // was visible to every persona but 403'd for the one persona actually in beta.
      { label: "Decision Inbox", href: "/dashboard/inbox", requiresCapability: CAPABILITIES.ENGAGEMENT_VIEW },
    ],
  },
  {
    id: "actions",
    title: "Actions",
    items: [
      { label: "Tasks", href: "/owner/tasks", requiresOwner: true, icon: <TaskIcon /> },
      { label: "Execution & SOP", href: "/owner/execution", requiresOwner: true },
      // /decision loads /api/calibration (ACTION_VIEW), /api/value and
      // /api/intelligence/summary (ENGAGEMENT_VIEW), and /api/run (ACTION_CREATE) --
      // an entirely consulting-engagement page (calibration/value/intelligence-summary),
      // none of which self-serve beta owners hold. Gated on ENGAGEMENT_VIEW, consistent
      // with the other consulting-facing items in this file.
      { label: "Check a decision", href: "/decision", requiresCapability: CAPABILITIES.ENGAGEMENT_VIEW },
    ],
  },
  {
    // "More from OpsIQ" — what else exists or is coming (PR C mental model). Recovery, Strategy,
    // Marketing (+ its Campaigns sub-page), and Starting up are real, reachable, working pages --
    // each gets a visible "Preview" pill precisely because it is real functionality that just
    // isn't part of the core controlled-beta workflow yet, so an owner never mistakes it for a
    // broken link. AI Copilot and Integrations have no owner-facing page in this app at all --
    // each is a non-interactive "Coming soon" row (see the `state`/`href`-optional contract on
    // NavItem above), not a placeholder page built merely to populate this list, and not a claim
    // that a working AI assistant or a live QuickBooks/HubSpot connection exists today.
    id: "more-from-opsiq",
    title: "More from OpsIQ",
    collapsedByDefault: true,
    items: [
      {
        label: "Recovery",
        href: "/owner/recovery",
        requiresOwner: true,
        state: "preview",
        blurb: "Guided turnaround steps for a business in serious distress.",
      },
      {
        label: "Strategy",
        href: "/owner/strategy",
        requiresOwner: true,
        state: "preview",
        blurb: "Longer-range scenario and strategic-move planning.",
      },
      {
        label: "Marketing",
        href: "/owner/marketing",
        requiresOwner: true,
        state: "preview",
        blurb: "Campaign and channel performance tracking.",
      },
      {
        label: "Campaigns",
        href: "/owner/marketing/campaigns",
        requiresOwner: true,
        state: "preview",
      },
      // Moved out of "Business": /owner/startup is a zero-to-validated new-business engine for
      // someone deciding whether/what to start (capital available, survival need, risk tolerance
      // intake) -- a different persona and business-state than an owner with an existing,
      // operating business, which every other "Business" item assumes. Technically the most
      // built-out capability in the app; the exposure issue is persona fit, not readiness.
      {
        label: "Starting up",
        href: "/owner/startup",
        requiresOwner: true,
        state: "preview",
        blurb: "Tools for screening and validating a brand-new business idea -- not for a business you're already running.",
      },
      {
        label: "AI Copilot",
        requiresOwner: true,
        state: "coming-soon",
        blurb: "Ask OpsIQ questions about your business in plain language.",
      },
      {
        label: "Integrations",
        requiresOwner: true,
        state: "coming-soon",
        blurb: "Connect QuickBooks, HubSpot, and other tools you already use.",
      },
      // /api/scenario requires ACTION_VIEW, which no self-serve beta owner holds (it is not
      // part of OWNER_SCOPED_CAPABILITIES). Gated to match; was previously visible to every
      // persona but 403'd for the one persona actually in beta.
      { label: "What if…", href: "/scenario", requiresCapability: CAPABILITIES.ACTION_VIEW },
    ],
  },
  {
    // "Settings & account" — account administration and beta-support utilities, not product
    // capability. Renamed from "More" so it stops reading as a catch-all for anything
    // unclassified; Evidence & Trust moved out to its own top-level entry above.
    id: "settings-account",
    title: "Settings & account",
    collapsedByDefault: true,
    items: [
      // /api/report requires SYSTEM_VIEW_AUDIT, which no self-serve beta owner holds --
      // gated to match, so the link is only ever shown to a persona that can actually
      // load it (was previously visible to everyone and 403'd for self-serve owners).
      { label: "Reports", href: "/report", requiresCapability: CAPABILITIES.SYSTEM_VIEW_AUDIT },
      { label: "Settings", href: "/settings" },
      // Renamed from "People": /users lists UserRow rows + their role assignments (account/user
      // administration, see src/app/(authenticated)/users/page.tsx) -- not an HR/employee
      // directory, which "People" would suggest. Href and USER_VIEW gate unchanged.
      { label: "User accounts", href: "/users", requiresCapability: CAPABILITIES.USER_VIEW },
      { label: "Help", href: "/owner/help", requiresOwner: true },
      { label: "Send beta feedback", href: "/owner/feedback", requiresOwner: true },
    ],
  },
  {
    // Consulting-only surfaces, split out of the former "Records & settings" grab-bag so a
    // self-serve owner (who holds none of these capabilities) never sees this section at all —
    // see the file-level comment above for why it renders as empty today for real production
    // traffic, and is kept anyway.
    id: "consulting",
    title: "Consulting",
    collapsedByDefault: true,
    items: [
      {
        label: "Consulting workspace",
        href: "/dashboard",
        requiresCapability: CAPABILITIES.ENGAGEMENT_VIEW,
      },
      { label: "Clients", href: "/clients", requiresCapability: CAPABILITIES.CLIENT_VIEW },
      {
        label: "Engagements",
        href: "/engagements",
        requiresCapability: CAPABILITIES.ENGAGEMENT_VIEW,
      },
      { label: "Leads", href: "/leads", requiresCapability: CAPABILITIES.LEAD_VIEW },
    ],
  },
  {
    // SYSTEM_ADMIN-only. /admin/billing already enforces CAPABILITIES.SYSTEM_ADMIN server-side
    // (src/app/api/admin/billing/diagnostics/route.ts) but, before this change, had no link
    // anywhere in the app — it was reachable only by typing the URL. This section gives it the
    // same per-item capability-gated nav entry every other capability-gated route already has;
    // it introduces no new authorization, only a link to an existing, already-gated route.
    id: "admin",
    title: "Administration",
    collapsedByDefault: true,
    items: [
      {
        label: "Billing diagnostics",
        href: "/admin/billing",
        requiresCapability: CAPABILITIES.SYSTEM_ADMIN,
      },
    ],
  },
];

/** Flat list of every href the nav knows about — the candidate set for longest-match. Excludes
 *  "coming-soon" items, which have no `href` (nothing to navigate to or match against). */
const ALL_HREFS: string[] = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)).filter(
  (href): href is string => href !== undefined,
);

/**
 * The single active nav href for a pathname: the longest entry that the pathname either equals or
 * sits beneath. Returns null when nothing matches.
 */
export function resolveActiveHref(pathname: string, hrefs: string[] = ALL_HREFS): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

export function SidebarNav({
  canViewOwnerRecovery = false,
  capabilities = [],
  onLinkClick,
}: {
  canViewOwnerRecovery?: boolean;
  /**
   * The signed-in user's resolved capability set (same ROLE_CAPABILITIES resolution the
   * authenticated layout already runs for `canViewOwnerRecovery` — see
   * src/app/(authenticated)/layout.tsx). Drives `requiresCapability` gating below. Defaults to
   * empty so a caller that omits it (existing tests included) sees only ungated and
   * requiresOwner-gated items, never a capability-gated item it didn't explicitly grant.
   */
  capabilities?: readonly string[];
  onLinkClick?: () => void;
}) {
  const pathname = usePathname();
  const capabilitySet = new Set(capabilities);
  const activeHref = resolveActiveHref(pathname ?? "");

  const renderItem = (item: NavItem) => {
    // "Coming soon" with no owner-facing page yet: a plain informational row, never an `<a>`.
    // Not in the tab order and not clickable, so it can never read as a broken/disabled control
    // (which a greyed-out but inert link would) -- it simply isn't a control at all.
    if (!item.href) {
      return (
        <div key={item.label} className="flex flex-col gap-0.5 py-2.5 pl-[10px] pr-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">{item.label}</span>
            <Badge variant="muted-accessible" className="text-[10px] uppercase tracking-wide">
              Coming soon
            </Badge>
          </span>
          {item.blurb && <span className="text-xs text-muted-foreground">{item.blurb}</span>}
        </div>
      );
    }

    const isActive = activeHref === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onLinkClick}
        aria-current={isActive ? "page" : undefined}
        // Active state is a left-rule accent + weight change, the same editorial "one thing
        // matters here" language used for the top-priority treatment on every content page --
        // not the generic filled-pill/tinted-block highlight every shadcn/AdminLTE-style sidebar
        // defaults to. The left border reserves its own 2px column (border-transparent when
        // inactive) so nothing shifts horizontally on activation.
        className={`flex min-h-[44px] flex-col gap-0.5 border-l-2 py-2.5 pl-[10px] pr-3 text-sm transition-colors ${
          isActive
            ? "font-semibold text-foreground"
            : "border-transparent font-medium text-muted-foreground hover:text-foreground"
        }`}
        style={isActive ? { borderColor: "var(--accent-ink)" } : undefined}
      >
        <span className="flex items-center gap-3">
          {item.icon}
          <span className="flex-1">{item.label}</span>
          {item.state === "preview" && (
            <Badge variant="muted-accessible" className="text-[10px] uppercase tracking-wide">
              Preview
            </Badge>
          )}
        </span>
        {item.blurb && <span className="pl-7 text-xs text-muted-foreground">{item.blurb}</span>}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-1 px-3 py-4" aria-label="Main">
      {NAV_SECTIONS.map((section) => {
        const visibleItems = section.items.filter(
          (item) =>
            (!item.requiresOwner || canViewOwnerRecovery) &&
            (!item.requiresCapability || capabilitySet.has(item.requiresCapability)),
        );
        if (visibleItems.length === 0) return null;

        if (section.title === null) {
          return (
            <div key={section.id} className="mb-2 flex flex-col gap-1">
              {visibleItems.map(renderItem)}
            </div>
          );
        }

        // A section containing the active route is always open, whatever its default.
        const containsActive = visibleItems.some((i) => i.href === activeHref);
        const open = containsActive || !section.collapsedByDefault;

        return (
          <details key={section.id} open={open} className="group mb-1">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground marker:content-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
              <span className="inline-block shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true">
                &#9656;
              </span>
              {section.title}
            </summary>
            <div className="mt-1 flex flex-col gap-1">{visibleItems.map(renderItem)}</div>
          </details>
        );
      })}
    </nav>
  );
}
