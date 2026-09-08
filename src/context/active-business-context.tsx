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
  /** The currently active business id, or null if the owner has no businesses yet. */
  activeBusinessId: string | null;
  /** The full record for the active business, or null. */
  activeBusiness: ActiveBusinessLite | null;
  /** True until the initial business list fetch completes. */
  loading: boolean;
  /** Explicitly switch the active business — persists across navigation and future tabs. */
  setActiveBusinessId: (businessId: string) => void;
  /** Re-fetch the business list (e.g. after creating or archiving a business). */
  refreshBusinesses: () => Promise<void>;
}

const SESSION_KEY = "opsiq.activeBusinessId";
const LOCAL_KEY = "opsiq.lastActiveBusinessId";

const ActiveBusinessContext = createContext<ActiveBusinessContextValue | null>(null);

function readStoredId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) ?? window.localStorage.getItem(LOCAL_KEY);
  } catch {
    // Private browsing / storage blocked — fall back to no persisted preference.
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

export function ActiveBusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<ActiveBusinessLite[]>([]);
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBusinesses = useCallback(async () => {
    const res = await fetch("/api/owner/businesses", { headers: { "Content-Type": "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error || `Request failed (${res.status})`);
    return (data.businesses ?? []) as ActiveBusinessLite[];
  }, []);

  const resolveActiveId = useCallback((list: ActiveBusinessLite[], preferred: string | null) => {
    if (list.length === 0) return null;
    // A previously-selected business that no longer exists in the list (archived, or
    // never belonged to this workspace) must never silently fall through to a wrong
    // business without at least re-anchoring to a business that genuinely exists.
    if (preferred && list.some((b) => b.id === preferred)) return preferred;
    return list[0].id;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchBusinesses();
      setBusinesses(list);
      const preferred = readStoredId();
      const resolved = resolveActiveId(list, preferred);
      setActiveBusinessIdState(resolved);
      if (resolved) persistId(resolved);
    } finally {
      setLoading(false);
    }
  }, [fetchBusinesses, resolveActiveId]);

  useEffect(() => {
    // Fetch-on-mount is the intentional pattern used across every owner page in this repo;
    // `load` internally calls setState (setBusinesses/setActiveBusinessIdState/setLoading).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount, intentional single run
  }, []);

  const setActiveBusinessId = useCallback((businessId: string) => {
    setActiveBusinessIdState(businessId);
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
      setActiveBusinessId,
      refreshBusinesses: load,
    }),
    [businesses, activeBusinessId, activeBusiness, loading, setActiveBusinessId, load]
  );

  return <ActiveBusinessContext.Provider value={value}>{children}</ActiveBusinessContext.Provider>;
}

/** Read the shared active-business context. Must be used within <ActiveBusinessProvider>. */
export function useActiveBusiness(): ActiveBusinessContextValue {
  const ctx = useContext(ActiveBusinessContext);
  if (!ctx) throw new Error("useActiveBusiness must be used within an ActiveBusinessProvider");
  return ctx;
}
