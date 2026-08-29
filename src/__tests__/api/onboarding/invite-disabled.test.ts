/**
 * POST /api/onboarding/invite — fail-closed until a real invite lifecycle
 * exists (non-DB).
 *
 * The route previously granted an immediately-active WorkspaceMembership to
 * a brand-new, passwordless User with no email/token/redemption step — a
 * broken public mutation that public-beta onboarding must not expose. This
 * pins that it now fails closed with a stable, non-retryable response and
 * performs no DB mutation.
 */
import { describe, it, expect } from "vitest";

const mockUserCreate = vi.fn();
const mockMembershipCreate = vi.fn();

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown) => unknown, options?: Record<string, unknown>) => {
    const wrapped = (ctx: unknown) => handler(ctx);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { create: mockUserCreate },
    workspaceMembership: { create: mockMembershipCreate },
    workspace: { findUnique: vi.fn() },
  },
}));

describe("POST /api/onboarding/invite — disabled fail-closed", () => {
  function ctx(body: Record<string, unknown> = {}) {
    return {
      verifiedActorId: "actor-1",
      verifiedWorkspaceId: "ws-1",
      request: { json: async () => body },
    };
  }

  it("throws a non-retryable FeatureDisabledError instead of mutating anything", async () => {
    const { POST } = await import("@/app/api/onboarding/invite/route");

    await expect(
      POST(
        ctx({
          workspaceSlug: "acme",
          members: [{ email: "someone@example.com", role: "admin" }],
        }) as never
      )
    ).rejects.toMatchObject({ name: "FeatureDisabledError", statusCode: 501 });

    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockMembershipCreate).not.toHaveBeenCalled();
  });

  it("requires the OWNER_ONBOARD capability and a workspace (enforcement wiring unchanged)", async () => {
    const { POST } = await import("@/app/api/onboarding/invite/route");
    const options = (POST as unknown as { __options?: { requireWorkspace?: boolean; requireCapabilities?: string[] } }).__options;
    expect(options?.requireWorkspace).toBe(true);
    expect(options?.requireCapabilities).toContain("owner:onboard");
  });
});
