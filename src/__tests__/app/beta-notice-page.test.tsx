/**
 * /beta (Beta Notice) — server-resolved admission mode consistency.
 *
 * Before this fix, BetaNoticePage never read the real admission mode: PublicBetaText/
 * PublicBetaSwitch always rendered with initialMode=null, so the page showed the stricter
 * INVITE_ONLY wording on first paint even when production was OPEN_BETA -- exactly the
 * inconsistency with the homepage (src/app/page.tsx, which already resolves and passes
 * admissionMode) that this suite guards against regressing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@/services/beta/public-presentation.service", () => ({
  getPublicAdmissionMode: vi.fn(),
}));

import BetaNoticePage from "@/app/beta/page";
import { getPublicAdmissionMode } from "@/services/beta/public-presentation.service";
import { presentationForAdmissionMode } from "@/domain/beta/public-presentation";

const getPublicAdmissionModeMock = vi.mocked(getPublicAdmissionMode);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("/beta first paint matches the real, server-resolved admission mode", () => {
  it("under OPEN_BETA, shows the open-registration notice on first paint, never the invitation wording", async () => {
    getPublicAdmissionModeMock.mockResolvedValue("OPEN_BETA");

    const element = await BetaNoticePage();
    const { container } = render(element);

    expect(container.textContent).toMatch(/You can create an account/);
    expect(container.textContent).not.toMatch(/requires an invitation/i);
    expect(container.textContent).toContain(presentationForAdmissionMode("OPEN_BETA").betaNoticeHeading);
  });

  it("under INVITE_ONLY, shows the invitation notice on first paint, never the open-registration wording", async () => {
    getPublicAdmissionModeMock.mockResolvedValue("INVITE_ONLY");

    const element = await BetaNoticePage();
    const { container } = render(element);

    expect(container.textContent).toMatch(/requires an invitation/i);
    expect(container.textContent).not.toMatch(/You can create an account/);
    expect(container.textContent).toContain(presentationForAdmissionMode("INVITE_ONLY").betaNoticeHeading);
  });

  it("when the mode lookup fails (null), fails closed to the stricter invitation wording -- same as every other public surface", async () => {
    getPublicAdmissionModeMock.mockResolvedValue(null);

    const element = await BetaNoticePage();
    const { container } = render(element);

    expect(container.textContent).toMatch(/requires an invitation/i);
    expect(container.textContent).not.toMatch(/You can create an account/);
  });

  it("resolves the admission mode server-side exactly once per render (no client-side re-fetch required for first paint)", async () => {
    getPublicAdmissionModeMock.mockResolvedValue("OPEN_BETA");

    await BetaNoticePage();

    expect(getPublicAdmissionModeMock).toHaveBeenCalledTimes(1);
  });
});
