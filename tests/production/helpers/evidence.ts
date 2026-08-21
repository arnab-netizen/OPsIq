/**
 * Manual trace/screenshot capture for the live-production acceptance lane.
 *
 * This suite shares one authenticated context/page across a serial journey
 * (matching this repo's established tests/browser/ pattern of creating the
 * context by hand in beforeAll). Playwright's automatic trace/screenshot
 * retain-on-failure behavior is wired into the built-in page/context
 * fixtures' per-test teardown; it does not apply to a context created
 * outside that fixture graph. This module reimplements the same semantics
 * explicitly so evidence capture is real and verifiable, not assumed.
 */
import { mkdirSync } from "fs";
import { join } from "path";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";

const EVIDENCE_ROOT = "production-test-results/evidence";

function evidenceDirFor(specName: string): string {
  const dir = join(EVIDENCE_ROOT, specName);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(raw: string): string {
  return raw.replace(/[^a-z0-9-]+/gi, "_").slice(0, 80);
}

export async function startTracing(context: BrowserContext): Promise<void> {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  await context.tracing.startChunk();
}

/** Call from a serial suite's afterEach(async ({}, testInfo) => ...). */
export async function captureOnFailure(
  context: BrowserContext,
  page: Page,
  testInfo: TestInfo,
  specName: string
): Promise<void> {
  const failed = testInfo.status !== "passed";
  if (failed) {
    const dir = evidenceDirFor(specName);
    const base = safeName(testInfo.title);
    await context.tracing.stopChunk({ path: join(dir, `FAILED-${base}-trace.zip`) });
    await page.screenshot({ path: join(dir, `FAILED-${base}-screenshot.png`), fullPage: true }).catch(() => {});
  } else {
    // No path -- the chunk is discarded, matching screenshot/trace:
    // only-on-failure / retain-on-failure semantics.
    await context.tracing.stopChunk();
  }
  await context.tracing.startChunk();
}

/**
 * Explicit checkpoint screenshot at a critical journey step, independent of
 * pass/fail -- required for critical closure journeys per the acceptance
 * program's evidence spec, even on success.
 */
export async function checkpointScreenshot(page: Page, specName: string, label: string): Promise<void> {
  const dir = evidenceDirFor(specName);
  await page
    .screenshot({ path: join(dir, `checkpoint-${safeName(label)}.png`), fullPage: true })
    .catch(() => {});
}

export async function finalizeTracing(context: BrowserContext): Promise<void> {
  await context.tracing.stop();
}
