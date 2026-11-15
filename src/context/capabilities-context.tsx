"use client";

/**
 * The signed-in user's resolved capability set, as the server resolved it (the authenticated layout →
 * AppShell, from the centralized policy layer — getPolicyContext + getCapabilitiesForRole). It only decides
 * what a page PRESENTS; every protected read and write is still enforced server-side by its own route.
 * Without a provider (e.g. a component rendered on its own) the set is empty: nothing extra is shown.
 */

import { createContext, useContext, type ReactNode } from "react";

const CapabilitiesContext = createContext<readonly string[]>([]);

export function CapabilitiesProvider({ capabilities, children }: { capabilities: readonly string[]; children: ReactNode }) {
  return <CapabilitiesContext.Provider value={capabilities}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): readonly string[] {
  return useContext(CapabilitiesContext);
}
