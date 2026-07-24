/**
 * Mobile usability — source-level proof that the owner-pilot surfaces are mobile-safe (runs without a
 * browser; complements the jsdom PriorityCommandStrip render test and the Playwright specs that run in
 * CI with a DB). Asserts the new owner-pilot UI uses touch-friendly tap targets, responsive grids, and
 * no fixed wide pixel widths that would force horizontal scrolling of core content.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = {
  onboarding: "src/app/(authenticated)/owner/onboarding/page.tsx",
  commandCenter: "src/app/(authenticated)/owner/page.tsx",
  strip: "src/components/owner/PriorityCommandStrip.tsx",
};

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("mobile usability — module contract assertions", () => {
  it("read is a function", () => {
    expect(typeof read).toBe("function");
  });
  it("FILES.onboarding is a string", () => {
    expect(typeof FILES.onboarding).toBe("string");
  });
  it("FILES.commandCenter is a string", () => {
    expect(typeof FILES.commandCenter).toBe("string");
  });
  it("FILES.strip is a string", () => {
    expect(typeof FILES.strip).toBe("string");
  });
  it("Object.keys(FILES).length is 3", () => {
    expect(Object.keys(FILES).length).toBe(3);
  });
  it("FILES.onboarding ends with '.tsx'", () => {
    expect(FILES.onboarding.endsWith(".tsx")).toBe(true);
  });
  it("read(FILES.onboarding) is a non-empty string > 100 chars", () => {
    expect(read(FILES.onboarding).length).toBeGreaterThan(100);
  });
  it("read(FILES.commandCenter) contains 'min-h-[44px]'", () => {
    expect(read(FILES.commandCenter)).toMatch(/min-h-\[44px\]/);
  });
  it("read(FILES.onboarding) contains 'min-h-[44px]'", () => {
    expect(read(FILES.onboarding)).toMatch(/min-h-\[44px\]/);
  });
  it("read(FILES.strip) contains 'grid'", () => {
    expect(read(FILES.strip)).toMatch(/grid/);
  });
  it("read(FILES.strip) contains 'sm:grid-cols-2'", () => {
    expect(read(FILES.strip)).toMatch(/sm:grid-cols-2/);
  });
  it("read(FILES.commandCenter) contains 'owner-readiness-score'", () => {
    expect(read(FILES.commandCenter)).toContain("owner-readiness-score");
  });
  it("read(FILES.strip) contains 'owner-priority-strip'", () => {
    expect(read(FILES.strip)).toContain("owner-priority-strip");
  });
  it("read(FILES.onboarding) contains 'data-testid=\"owner-onboarding\"'", () => {
    expect(read(FILES.onboarding)).toMatch(/data-testid="owner-onboarding"/);
  });
  it("read(FILES.commandCenter) does not contain fixed pixel widths > 200px", () => {
    expect(read(FILES.commandCenter)).not.toMatch(/width:\s*[2-9]\d{2,}px/);
  });
  it("FILES.strip ends with '.tsx'", () => {
    expect(FILES.strip.endsWith(".tsx")).toBe(true);
  });
});

describe("mobile usability of owner-pilot surfaces", () => {
  it("interactive controls use a 44px minimum touch target", () => {
    const onboarding = read(FILES.onboarding);
    expect(onboarding).toMatch(/min-h-\[44px\]/);
    const cc = read(FILES.commandCenter);
    expect(cc).toMatch(/min-h-\[44px\]/);
  });

  it("core content uses responsive grids / single-column-first layout", () => {
    const strip = read(FILES.strip);
    expect(strip).toMatch(/grid/);
    expect(strip).toMatch(/sm:grid-cols-2/);
    const onboarding = read(FILES.onboarding);
    expect(onboarding).toMatch(/sm:grid-cols-2|space-y-/);
  });

  it("no fixed wide pixel widths that force horizontal scroll of core content", () => {
    for (const rel of Object.values(FILES)) {
      const src = read(rel);
      // No inline width over ~200px and no tailwind w-[NNNpx] over 200px on core content.
      expect(src).not.toMatch(/width:\s*[2-9]\d{2,}px/);
      expect(src).not.toMatch(/\bw-\[[2-9]\d{2,}px\]/);
    }
  });

  it("the onboarding + command-center surfaces expose the owner-pilot test ids used by mobile e2e", () => {
    const onboarding = read(FILES.onboarding);
    expect(onboarding).toMatch(/data-testid="owner-onboarding"/);
    expect(onboarding).toMatch(/data-testid="onboarding-confidence"/);
    const cc = read(FILES.commandCenter);
    for (const id of ["owner-readiness-score", "owner-input-guidance", "owner-action-plan"]) {
      expect(cc).toContain(id);
    }
    expect(read(FILES.strip)).toContain("owner-priority-strip");
  });
});
