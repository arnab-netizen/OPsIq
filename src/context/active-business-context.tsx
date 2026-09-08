"use client";

/**
 * ActiveBusinessContext — the ONE canonical "which business is the owner looking at right now"
 * store for every authenticated owner surface (Home, My Business, Money, Customers, Operations,
 * Inventory, Procurement, Vendors, Priorities, ...).
 *
 * Root cause this replaces: every owner page independently fetched its own business list and
 * defaulted to businesses[0] (the most-recently-created business, since listBusinesses() orders
 * by createdAt desc) on every mount. A real human usability test confirmed the failure mode this
 * produces: selecting "Trinity Services" on My Business did not persist to Money/Customers/
 * Operations, each of which silently picked its own (sometimes different) default business on
 * navigation.
 *
 * This context is a client-side convenience layer only — it never substitutes for server-side
 * authorization. Every API route that accepts a businessId already verifies it belongs to the
 * caller's own verified workspace (see getBusiness()/ownership checks in each service); an
 * invalid or foreign id passed through this context can only ever resolve to "not found" or
 * empty data server-side, never to another workspace's data.
 *
 * Persistence: sessionStorage (per-tab — a fresh tab does not inherit a switch made in another
 * tab mid-session, so "switch business in tab A" cannot silently move tab B's in-progress task)
 * plus localStorage as a "last used" seed for brand-new tabs, so opening a new tab starts from
 * the business you were most recently working in rather than always the newest-created row.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface ActiveBusinessLite {
  id: string;
  name: string;
  businessType?: string;
  currency?: string;
  isActive?: boolean;
}

interface ActiveBusinessContextValue {
  /** The owner's businesses (fixture-free, active-only — see listBusinesses()). */
  businesses: ActiveBusinessLite[];
  /**
   * The currently active business id, or null if the owner has no businesses yet OR a
   * recovery choice is pending (see `needsBusinessRecovery`) — never a silently-substituted
   * business id.
   */
  activeBusinessId: string | null;
  /** The full record for the active business, or null. */
  activeBusiness: ActiveBusinessLite | null;
  /** True until the initial business list fetch completes. */
  loading: boolean;
  /**
   * True when a PREVIOUSLY selected business (a real stored preference, not just "first ever
   * visit") is no longer valid — archived, deleted, foreign, or a fixture the ordinary owner
   * list no longer includes — AND more than one legitimate business remains, so there is a
   * genuine choice to make. The trust invariant this exists for: silently re-anchoring to a
   * different business here would repeat the exact bug a human usability test found (the app
   * quietly showing a different business than the one the owner was just looking at). Callers
   * must render an explicit "no longer available — choose a business" state instead of any
   * page content while this is true. Never true when only one legitimate business exists
   * (auto-reanchoring to the sole remaining business is safe and expected there) or when there
   * was no prior stored preference at all (an ordinary first-run default is not a "recovery").
   */
  needsBusinessRecovery: boolean;
  /** Explicitly switch the active business — persists across navigation and future tabs, and
   *  clears any pending recovery state. */
  setActiveBusinessId: (businessId: string) => void;
  /** Re-fetch the business list (e.g. after creating or archiving a business). */
  refreshBusinesses: () => Promise<void>;
}

const SESSION_KEY = "opsiq.activeBusinessId";
const LOCAL_KEY = "opsiq.lastActiveBusinessId";

const ActiveBusinessContext = createContext<ActiveBusinessContextValue | null>(null);

/** The raw stored value, or null if NOTHING has ever been stored (as opposed to a stored value
 *  that merely fails to resolve against the current business list — those are different cases:
 *  the former is an ordinary first run, the latter is a genuine recovery scenario). */
function readRawStoredId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? window.localStorage.getItem(LOCAL_KEY);
  } catch {
    // Private browsing / storage blocked — treated the same as "never stored".
    return null;
  }
}

function persistId(businessId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, businessId);
    window.localStorage.setItem(LOCAL_KEY, businessId);
  } catch {
    // Best-effort only — the in-memory context state still works for this tab/session.
  }
}

interface ResolvedActive {
  id: string | null;
  needsRecovery: boolean;
}

/**
 * Pure resolution rule — see `needsBusinessRecovery` doc above for the invariant this encodes.
 * Exported for direct unit testing independent of the fetch/effect plumbing around it.
 */
export function resolveActiveBusiness(
  list: ActiveBusinessLite[],
  storedId: string | null
): ResolvedActive {
  if (list.length === 0) return { id: null, needsRecovery: false };
  if (storedId && list.some((b) => b.id === storedId)) return { id: storedId, needsRecovery: false };
  // storedId is missing from the list: either there was no stored preference at all (ordinary
  // first run — default silently), or there was one and it no longer resolves (archived, a
  // foreign/fixture id, or corrupt storage) — a genuine recovery scenario UNLESS there is only
  // one legitimate business anyway, in which case there is no real choice to protect.
  if (storedId && list.length > 1) return { id: null, needsRecovery: true };
  return { id: list[0].id, needsRecovery: false };
}

export function ActiveBusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<ActiveBusinessLite[]>([]);
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(null);
  const [needsBusinessRecovery, setNeedsBusinessRecovery] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBusinesses = useCallback(async () => {
    const res = await fetch("/api/owner/businesses", { headers: { "Content-Type": "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
    return (data.businesses ?? []) as ActiveBusinessLite[];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchBusinesses();
      setBusinesses(list);
      const storedId = readRawStoredId();
      const resolved = resolveActiveBusiness(list, storedId);
      setActiveBusinessIdState(resolved.id);
      setNeedsBusinessRecovery(resolved.needsRecovery);
      // Only persist a resolution the owner didn't explicitly make yet when it's a safe,
      // non-recovery auto-anchor (first run, or the sole remaining business) — never persist
      // "null" over a recovery state, which would erase the fact that a real prior choice
      // existed and silently convert this into an ordinary first-run default on next load.
      if (resolved.id && !resolved.needsRecovery) persistId(resolved.id);
    } finally {
      setLoading(false);
    }
  }, [fetchBusinesses]);

  useEffect(() => {
    // Fetch-on-mount is the intentional pattern used across every owner page in this repo;
    // `load` internally calls setState (setBusinesses/setActiveBusinessIdState/setLoading).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount, intentional single run
  }, []);

  const setActiveBusinessId = useCallback((businessId: string) => {
    setActiveBusinessIdState(businessId);
    setNeedsBusinessRecovery(false);
    persistId(businessId);
  }, []);

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.id === activeBusinessId) ?? null,
    [businesses, activeBusinessId]
  );

  const value = useMemo<ActiveBusinessContextValue>(
    () => ({
      businesses,
      activeBusinessId,
      activeBusiness,
      loading,
      needsBusinessRecovery,
      setActiveBusinessId,
      refreshBusinesses: load,
    }),
    [businesses, activeBusinessId, activeBusiness, loading, needsBusinessRecovery, setActiveBusinessId, load]
  );

  return <ActiveBusinessContext.Provider value={value}>{children}</ActiveBusinessContext.Provider>;
}

/** Read the shared active-business context. Must be used within <ActiveBusinessProvider>. */
export function useActiveBusiness(): ActiveBusinessContextValue {
  const ctx = useContext(ActiveBusinessContext);
  if (!ctx) throw new Error("useActiveBusiness must be used within an ActiveBusinessProvider");
  return ctx;
}
