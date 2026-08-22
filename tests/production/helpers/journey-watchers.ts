/**
 * Shared "no 5xx / no fatal console error" journey watchers for production
 * acceptance specs. Each spec file gets its OWN instance (module-level
 * arrays scoped per browser-context journey, not shared across spec files
 * running in the same worker process) -- mirrors the pattern already
 * established independently in 10-startup-mode-acceptance.spec.ts and
 * 20-existing-business-acceptance.spec.ts, extracted here so new domain
 * spec files don't have to redefine it.
 */
import type { Page } from "@playwright/test";

export interface JourneyWatch {
  consoleErrors: string[];
  networkFailures: Array<{ url: string; status: number }>;
  watchPage: (page: Page) => void;
  fatalErrors: () => string[];
}

export function createJourneyWatch(): JourneyWatch {
  const consoleErrors: string[] = [];
  const networkFailures: Array<{ url: string; status: number }> = [];

  function watchPage(page: Page): void {
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("response", (res) => {
      if (res.status() >= 500) networkFailures.push({ url: res.url(), status: res.status() });
    });
  }

  function fatalErrors(): string[] {
    return consoleErrors.filter((e) => /Cannot read|is not a function|Hydration failed/i.test(e));
  }

  return { consoleErrors, networkFailures, watchPage, fatalErrors };
}
