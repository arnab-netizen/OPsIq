"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CAPABILITIES, type CapabilityName } from "@/domain/constants/capabilities";

/**
 * Owner / consulting / admin navigation — persona-sectioned single sidebar (IA Model B).
 *
 * Three changes from the previous flat/grouped list:
 *
 * 1. GROUPED, not flat. A single ungrouped list of 21 equal-weight links gave the owner no signal
 *    about where to start, and buried the data-entry path at position 14. The primary path
 *    (Home → Add & Connect Data) now sits above everything else, and the rest is grouped by the
 *    question the owner is asking.
 *
 * 2. LONGEST-MATCH active state. The previous `pathname.startsWith(item.href)` test highlighted
 *    "/dashboard" while the user was on "/dashboard/inbox". Active state is now the single
 *    longest-matching entry, so a child route never lights up its unrelated parent.
 *
 * 3. PERSONA-SECTIONED. The former "Records & settings" section mixed pure owner record-keeping
 *    with consulting-only surfaces (Clients/Engagements/Leads/consulting dashboard) that most
 *    signed-in users can never open. Those now live in their own "Consulting" section, and a new
 *    "Administration" section surfaces the previously nav-orphaned /admin/billing route to
 *    SYSTEM_ADMIN holders. Nothing changed about WHO can see an item — every gate below is the
 *    same `requiresOwner`/`requiresCapability` check as before (or, for /admin/billing, the same
 *    per-item capability pattern already used for Clients/Engagements/Leads/People) — only WHERE
 *    it renders changed. Because a section that ends up with zero visible items renders nothing
 *    (see the `visibleItems.length === 0` check below), "Consulting" and "Administration"
 *    automatically disappear for the self-serve owner population that holds neither set of
 *    capabilities — this is what makes it a persona-sectioned single sidebar (Model B) rather
 *    than a capability-filtered flat list (Model A) or a separate owner/consulting mode switch
 *    (Model C): one sidebar, sections that only exist when the signed-in capability set makes
 *    them relevant, no separate "mode" the user has to toggle.
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
      { label: "Home", href: "/owner/cockpit", requiresOwner: true },
      { label: "Add & Connect Data", href: "/owner/data", requiresOwner: true },
    ],
  },
  {
    id: "health",
    title: "Business health",
    items: [
      { label: "Diagnosis", href: "/diagnosis" },
      { label: "Money", href: "/owner/finance", requiresOwner: true },
      { label: "Customers", href: "/owner/customers", requiresOwner: true },
      { label: "Operations", href: "/owner/operations", requiresOwner: true },
      { label: "Risk", href: "/owner/risks", requiresOwner: true },
      { label: "Compliance", href: "/owner/compliance", requiresOwner: true },
    ],
  },
  {
    id: "actions",
    title: "Actions",
    items: [
      { label: "Alerts", href: "/owner/alerts", requiresOwner: true, showAlertBadge: true },
      { label: "Tasks", href: "/owner/tasks", requiresOwner: true },
      { label: "Decision Inbox", href: "/dashboard/inbox" },
      { label: "Execution & SOP", href: "/owner/execution", requiresOwner: true },
      { label: "Check a decision", href: "/decision" },
    ],
  },
  {
    id: "growth",
    title: "Growth & strategy",
    collapsedByDefault: true,
    items: [
      { label: "Goals", href: "/owner/goals", requiresOwner: true },
      { label: "Strategy", href: "/owner/strategy", requiresOwner: true },
      { label: "What if…", href: "/scenario" },
      { label: "Starting up", href: "/owner/startup", requiresOwner: true },
      { label: "Campaigns", href: "/owner/marketing/campaigns", requiresOwner: true },
    ],
  },
  {
    id: "records",
    title: "Records",
    collapsedByDefault: true,
    items: [
      { label: "Reports", href: "/report" },
      { label: "Why OpsIQ says this", href: "/owner/trust", requiresOwner: true },
      { label: "Inventory", href: "/owner/inventory", requiresOwner: true },
      { label: "Procurement", href: "/owner/procurement", requiresOwner: true },
      { label: "Vendors", href: "/owner/vendor", requiresOwner: true },
      { label: "People", href: "/users", requiresCapability: CAPABILITIES.USER_VIEW },
      { label: "Settings", href: "/settings" },
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
        className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
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
