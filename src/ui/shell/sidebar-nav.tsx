"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CAPABILITIES, type CapabilityName } from "@/domain/constants/capabilities";

/**
 * Minimal inline icon set for the primary nav items only — a real usability test found the
 * sidebar "looked like plain text" with no way to visually scan it. Icons are deliberately
 * limited to the handful of items an owner needs to recognize at a glance -- the three primary
 * entries (Start Here, Home, My Business) plus the one high-frequency item at the top of
 * Priorities and of Actions -- rather than applied to every leaf item, which would read as
 * decoration rather than recognition (see the anti-AI-template audit: "icons beside every
 * heading" is a rejected pattern). Five icons across ~20 nav items, not an icon-per-row system.
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
function AttentionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 3.5h.01M10.3 4.4 2.9 17.5a1.5 1.5 0 0 0 1.3 2.2h15.6a1.5 1.5 0 0 0 1.3-2.2L13.7 4.4a1.5 1.5 0 0 0-2.6 0Z" />
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
 * Sectioned into the premium-redesign's six-bucket target IA — Home, My Business, Priorities,
 * Actions, Growth, More — plus the capability-gated Consulting/Administration sections:
 *
 * 1. GROUPED, not flat, and named for the question the owner is asking ("what needs my
 *    attention" = Priorities, "what should I do" = Actions, "tell OpsIQ about my business" = My
 *    Business), not for internal module structure. The primary path (Home → My Business, at
 *    /owner/data) sits above everything else, ungrouped, so it's never buried inside a collapsed
 *    section. "Business details" (Money/Customers/etc. drill-down pages, formerly also labeled
 *    "My Business" — renamed to remove that collision) and "Growth"/"More" (occasional-use pages)
 *    start collapsed; "Priorities" and "Actions" (small, high-frequency lists) start open.
 *
 * 2. LONGEST-MATCH active state. The previous `pathname.startsWith(item.href)` test highlighted
 *    "/dashboard" while the user was on "/dashboard/inbox". Active state is now the single
 *    longest-matching entry, so a child route never lights up its unrelated parent.
 *
 * 3. PERSONA-SECTIONED. Consulting-only surfaces (Clients/Engagements/Leads/consulting dashboard)
 *    live in their own "Consulting" section, and "Administration" surfaces the previously
 *    nav-orphaned /admin/billing route to SYSTEM_ADMIN holders. Nothing changed about WHO can see
 *    an item — every gate below is the same `requiresOwner`/`requiresCapability` check as before
 *    (or, for /admin/billing, the same per-item capability pattern already used for
 *    Clients/Engagements/Leads/People) — only WHERE it renders changed. Because a section that
 *    ends up with zero visible items renders nothing (see the `visibleItems.length === 0` check
 *    below), "Consulting" and "Administration" automatically disappear for the self-serve owner
 *    population that holds neither set of capabilities — this is what makes it a
 *    persona-sectioned single sidebar (Model B) rather than a capability-filtered flat list
 *    (Model A) or a separate owner/consulting mode switch (Model C): one sidebar, sections that
 *    only exist when the signed-in capability set makes them relevant, no separate "mode" the
 *    user has to toggle.
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
 * Routes are grouped, not removed — every previously reachable deep link still works.
 */

interface NavItem {
  label: string;
  href: string;
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
  /** If true, show a live unread-alert badge next to the label. */
  showAlertBadge?: boolean;
  /** Rendered before the label. Reserved for the small set of primary items an owner needs to
   *  recognize at a glance — see the file-level comment on the icon components above. */
  icon?: ReactNode;
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
      // section; there is exactly one. The former "My Business" section (Money, Customers,
      // Operations, Risk, Compliance, Goals, Inventory, Procurement, Vendors) is renamed
      // "Business details" below -- deeper, occasional drill-downs this page links out to, not a
      // second front door.
      { label: "My Business", href: "/owner/data", requiresOwner: true, icon: <BuildingIcon /> },
    ],
  },
  {
    // "Business details" — deeper drill-down pages about the state of the business (Money,
    // Customers, Operations, etc.), reachable directly from the nav for a returning owner and
    // linked from the My Business (/owner/data) page for progressive disclosure. Collapsed by
    // default: these are pages a lay owner opens deliberately, not the first things they need to
    // see (see OPSIQ_DESIGN_DIRECTION.md §18 — a first-time owner is not shown ~24 peer
    // destinations on day one). Formerly titled "My Business"; renamed to remove the label
    // collision with the primary /owner/data entry above, which now owns that name. No href, id,
    // or gate changed on any item below.
    id: "my-business",
    title: "Business details",
    collapsedByDefault: true,
    items: [
      // /api/diagnosis requires ENGAGEMENT_CREATE (a consulting-engagement capability no
      // self-serve beta owner holds — this is the legacy consultant "create an engagement
      // diagnosis" page, not the self-serve owner's own business diagnosis, which lives
      // under Home/first-result and /owner/finance instead). Gated to match its real API.
      { label: "Diagnosis", href: "/diagnosis", requiresCapability: CAPABILITIES.ENGAGEMENT_CREATE },
      { label: "Money", href: "/owner/finance", requiresOwner: true },
      { label: "Customers", href: "/owner/customers", requiresOwner: true },
      { label: "Operations", href: "/owner/operations", requiresOwner: true },
      { label: "Risk", href: "/owner/risks", requiresOwner: true },
      { label: "Compliance", href: "/owner/compliance", requiresOwner: true },
      { label: "Goals", href: "/owner/goals", requiresOwner: true },
      { label: "Inventory", href: "/owner/inventory", requiresOwner: true },
      { label: "Procurement", href: "/owner/procurement", requiresOwner: true },
      { label: "Vendors", href: "/owner/vendor", requiresOwner: true },
    ],
  },
  {
    // "Priorities" — what needs the owner's attention right now. Split out of the former flat
    // "Actions" section so urgency (Priorities) and execution (Actions) aren't one undifferentiated
    // list; kept open by default since this is exactly what a returning owner checks first.
    id: "priorities",
    title: "Priorities",
    items: [
      { label: "What needs attention", href: "/owner/priorities", requiresOwner: true, icon: <AttentionIcon /> },
      { label: "Alerts", href: "/owner/alerts", requiresOwner: true, showAlertBadge: true },
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
    id: "growth",
    title: "Growth",
    collapsedByDefault: true,
    items: [
      { label: "Strategy", href: "/owner/strategy", requiresOwner: true },
      // /api/scenario requires ACTION_VIEW, which no self-serve beta owner holds (it is not
      // part of OWNER_SCOPED_CAPABILITIES). Gated to match; was previously visible to every
      // persona but 403'd for the one persona actually in beta.
      { label: "What if…", href: "/scenario", requiresCapability: CAPABILITIES.ACTION_VIEW },
      { label: "Starting up", href: "/owner/startup", requiresOwner: true },
      { label: "Campaigns", href: "/owner/marketing/campaigns", requiresOwner: true },
    ],
  },
  {
    // "More" — everything else: reference/records pages a lay owner rarely needs on day one.
    // Renamed from "Records" (same items, same gates) to fit the redesign's six-bucket IA.
    id: "more",
    title: "More",
    collapsedByDefault: true,
    items: [
      // /api/report requires SYSTEM_VIEW_AUDIT, which no self-serve beta owner holds --
      // gated to match, so the link is only ever shown to a persona that can actually
      // load it (was previously visible to everyone and 403'd for self-serve owners).
      { label: "Reports", href: "/report", requiresCapability: CAPABILITIES.SYSTEM_VIEW_AUDIT },
      { label: "Why OpsIQ says this", href: "/owner/trust", requiresOwner: true },
      { label: "People", href: "/users", requiresCapability: CAPABILITIES.USER_VIEW },
      { label: "Settings", href: "/settings" },
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

/** Flat list of every href the nav knows about — the candidate set for longest-match. */
const ALL_HREFS: string[] = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

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
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const capabilitySet = new Set(capabilities);

  useEffect(() => {
    if (!canViewOwnerRecovery) return;
    fetch("/api/owner/alerts?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { unreadCount?: number } | null) => {
        if (d && typeof d.unreadCount === "number") setUnreadAlertCount(d.unreadCount);
      })
      .catch(() => {});
  }, [canViewOwnerRecovery]);

  const activeHref = resolveActiveHref(pathname ?? "");

  const renderItem = (item: NavItem) => {
    const isActive = activeHref === item.href;
    const badgeCount = item.showAlertBadge ? unreadAlertCount : 0;
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
        className={`flex min-h-[44px] items-center gap-3 border-l-2 py-2.5 pl-[10px] pr-3 text-sm transition-colors ${
          isActive
            ? "font-semibold text-foreground"
            : "border-transparent font-medium text-muted-foreground hover:text-foreground"
        }`}
        style={isActive ? { borderColor: "var(--accent-ink)" } : undefined}
      >
        {item.icon}
        <span className="flex-1">{item.label}</span>
        {badgeCount > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-bold leading-none text-white min-w-[20px]">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
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
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
              {section.title}
            </summary>
            <div className="mt-1 flex flex-col gap-1">{visibleItems.map(renderItem)}</div>
          </details>
        );
      })}
    </nav>
  );
}
