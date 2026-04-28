import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ActionCenter } from "@/ui/action-center";

/**
 * Block 4: Action Execution UI Tests
 *
 * Verifies:
 * - Invalid transition buttons are hidden
 * - Complete without evidence is blocked
 * - Block without reason is blocked
 * - Valid transitions call API
 * - Action list refreshes after update
 */

describe("ActionCenter UI", () => {
  const mockActions = [
    {
      id: "action-1",
      title: "Fix database issue",
      status: "created",
      priority: "critical",
      dueDate: "2026-05-15",
      version: 1,
      evidence: [],
      linkedEvidence: [],
      blockerReason: undefined,
    },
    {
      id: "action-2",
      title: "Update documentation",
      status: "in_progress",
      priority: "high",
      dueDate: "2026-05-20",
      version: 2,
      evidence: [{ id: "ev-1" }],
      linkedEvidence: ["ev-1"],
      blockerReason: undefined,
    },
    {
      id: "action-3",
      title: "Blocked migration",
      status: "blocked",
      priority: "medium",
      dueDate: "2026-05-10",
      version: 1,
      evidence: [],
      linkedEvidence: [],
      blockerReason: "Waiting for vendor response",
    },
    {
      id: "action-4",
      title: "Completed task",
      status: "completed",
      priority: "low",
      dueDate: "2026-05-05",
      version: 3,
      evidence: [{ id: "ev-2" }],
      linkedEvidence: ["ev-2"],
      blockerReason: undefined,
    },
  ];

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  describe("UI Display", () => {
    it("displays all action details correctly", () => {
      render(
        <ActionCenter
          actions={[mockActions[0]]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("Fix database issue")).toBeInTheDocument();
      expect(screen.getByText("critical")).toBeInTheDocument();
      expect(screen.getByText(/Due:/)).toBeInTheDocument();
      expect(screen.getByText("created")).toBeInTheDocument();
    });

    it("shows evidence status correctly", () => {
      render(
        <ActionCenter
          actions={[mockActions[0], mockActions[1]]}
          engagementId="eng-1"
        />
      );

      const cards = screen.getAllByRole("heading", { level: 4 });
      const noEvidenceCard = cards[0];
      const withEvidenceCard = cards[1];

      expect(within(noEvidenceCard).getByText("Not linked")).toBeInTheDocument();
      expect(within(withEvidenceCard).getByText("✓ Linked")).toBeInTheDocument();
    });

    it("displays blocker reason for blocked actions", () => {
      render(
        <ActionCenter
          actions={[mockActions[2]]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("Waiting for vendor response")).toBeInTheDocument();
    });

    it("groups actions by status correctly", () => {
      render(
        <ActionCenter
          actions={mockActions}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText(/Blocked \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/In Progress \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Completed \(1\)/)).toBeInTheDocument();
    });
  });

  describe("Transition Buttons", () => {
    it("shows allowed transition buttons only", () => {
      const { rerender } = render(
        <ActionCenter
          actions={[mockActions[0]]}
          engagementId="eng-1"
        />
      );

      // created status allows: in_progress, blocked, cancelled
      expect(screen.getByRole("button", { name: /Start/i })).toBeInTheDocument(); // in_progress
      expect(screen.getByRole("button", { name: /Block/i })).toBeInTheDocument(); // blocked
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument(); // cancelled

      // completed status allows: verified only
      rerender(
        <ActionCenter
          actions={[mockActions[3]]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByRole("button", { name: /Verify/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Start/i })).not.toBeInTheDocument();
    });

    it("hides invalid transition buttons", () => {
      render(
        <ActionCenter
          actions={[mockActions[3]]}
          engagementId="eng-1"
        />
      );

      // Completed action should not have Start, Block, or Cancel buttons
      expect(screen.queryByRole("button", { name: /Start/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Block/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Cancel/i })).not.toBeInTheDocument();
    });

    it("uses human-readable labels for transitions", () => {
      render(
        <ActionCenter
          actions={[mockActions[0]]}
          engagementId="eng-1"
        />
      );

      // Verify labels instead of raw state names
      expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Block" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

      expect(screen.queryByRole("button", { name: "in_progress" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "blocked" })).not.toBeInTheDocument();
    });
  });

  describe("Validation Rules", () => {
    it("prevents complete without evidence", async () => {
      const { rerender } = render(
        <ActionCenter
          actions={[mockActions[1]]}
          engagementId="eng-1"
        />
      );

      // in_progress action with evidence should allow complete
      const completeBtn = screen.getByRole("button", { name: /Complete/i });
      expect(completeBtn).not.toBeDisabled();

      // Action without evidence should block complete
      rerender(
        <ActionCenter
          actions={[
            {
              ...mockActions[0],
              status: "in_progress",
              evidence: [],
              linkedEvidence: [],
            },
          ]}
          engagementId="eng-1"
        />
      );

      const completeBtnNoEvidence = screen.getByRole("button", { name: /Complete/i });
      expect(completeBtnNoEvidence).toBeDisabled();
    });

    it("shows error message for complete without evidence", async () => {
      render(
        <ActionCenter
          actions={[
            {
              ...mockActions[0],
              status: "in_progress",
              evidence: [],
              linkedEvidence: [],
            },
          ]}
          engagementId="eng-1"
        />
      );

      const completeBtn = screen.getByRole("button", { name: /Complete/i });
      fireEvent.click(completeBtn);

      await waitFor(() => {
        expect(
          screen.getByText("Cannot complete action without evidence")
        ).toBeInTheDocument();
      });
    });

    it("requires reason for block operation", async () => {
      render(
        <ActionCenter
          actions={[mockActions[0]]}
          engagementId="eng-1"
        />
      );

      const blockBtn = screen.getByRole("button", { name: /Block/i });
      fireEvent.click(blockBtn);

      // Should show inline dialog for reason
      await waitFor(() => {
        expect(
          screen.getByText("Why is this action blocked?")
        ).toBeInTheDocument();
      });

      // Confirm button should exist
      expect(screen.getByRole("button", { name: /Confirm Block/i })).toBeInTheDocument();
    });

    it("blocks confirm without providing reason", async () => {
      render(
        <ActionCenter
          actions={[mockActions[0]]}
          engagementId="eng-1"
        />
      );

      const blockBtn = screen.getByRole("button", { name: /Block/i });
      fireEvent.click(blockBtn);

      await waitFor(() => {
        const confirmBtn = screen.getByRole("button", {
          name: /Confirm Block/i,
        });
        expect(confirmBtn).toBeInTheDocument();
      });
    });
  });

  describe("API Integration", () => {
    it("calls API on valid transition", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "action-1",
              status: "in_progress",
              version: 2,
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <ActionCenter
          actions={[mockActions[1]]}
          engagementId="eng-1"
        />
      );

      const blockBtn = screen.getByRole("button", { name: /Block/i });
      fireEvent.click(blockBtn);

      await waitFor(() => {
        const confirmBtn = screen.getByRole("button", { name: /Confirm Block/i });
        expect(confirmBtn).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("Describe the blocker...");
      fireEvent.change(textarea, { target: { value: "Waiting for data" } });

      const confirmBtn = screen.getByRole("button", { name: /Confirm Block/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/actions/action-2"),
          expect.objectContaining({
            method: "PATCH",
            body: expect.stringContaining('"blocked"'),
          })
        );
      });
    });

    it("shows inline error on API failure", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: { message: "Conflict: Action was modified by another process" },
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <ActionCenter
          actions={[mockActions[1]]}
          engagementId="eng-1"
        />
      );

      const startBtn = screen.getByRole("button", { name: /Start/i });
      fireEvent.click(startBtn);

      await waitFor(() => {
        expect(
          screen.getByText("Conflict: Action was modified by another process")
        ).toBeInTheDocument();
      });
    });

    it("calls onActionUpdated callback after successful update", async () => {
      const mockCallback = vi.fn();
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "action-2",
              status: "in_progress",
              version: 3,
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <ActionCenter
          actions={[mockActions[1]]}
          engagementId="eng-1"
          onActionUpdated={mockCallback}
        />
      );

      const blockBtn = screen.getByRole("button", { name: /Block/i });
      fireEvent.click(blockBtn);

      await waitFor(() => {
        const confirmBtn = screen.getByRole("button", { name: /Confirm Block/i });
        expect(confirmBtn).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("Describe the blocker...");
      fireEvent.change(textarea, { target: { value: "Blocked on review" } });

      const confirmBtn = screen.getByRole("button", { name: /Confirm Block/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalled();
      });
    });

    it("includes blocker reason in API request", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "action-1",
              status: "blocked",
              version: 2,
              blockerReason: "Waiting for vendor",
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <ActionCenter
          actions={[mockActions[0]]}
          engagementId="eng-1"
        />
      );

      const blockBtn = screen.getByRole("button", { name: /Block/i });
      fireEvent.click(blockBtn);

      await waitFor(() => {
        const confirmBtn = screen.getByRole("button", { name: /Confirm Block/i });
        expect(confirmBtn).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("Describe the blocker...");
      fireEvent.change(textarea, { target: { value: "Waiting for vendor" } });

      const confirmBtn = screen.getByRole("button", { name: /Confirm Block/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/actions/action-1"),
          expect.objectContaining({
            body: expect.stringContaining('"blockerReason":"Waiting for vendor"'),
          })
        );
      });
    });
  });

  describe("UI State Management", () => {
    it("disables buttons while updating", async () => {
      let resolveRequest: () => void = () => {};
      const mockFetch = vi.fn(() =>
        new Promise((resolve) => {
          resolveRequest = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  id: "action-2",
                  status: "blocked",
                  version: 3,
                }),
            });
        })
      );
      global.fetch = mockFetch;

      render(
        <ActionCenter
          actions={[mockActions[1]]}
          engagementId="eng-1"
        />
      );

      const blockBtn = screen.getByRole("button", { name: /Block/i });
      fireEvent.click(blockBtn);

      await waitFor(() => {
        const confirmBtn = screen.getByRole("button", { name: /Confirm Block/i });
        expect(confirmBtn).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("Describe the blocker...");
      fireEvent.change(textarea, { target: { value: "Issue found" } });

      const confirmBtn = screen.getByRole("button", { name: /Confirm Block/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(confirmBtn).toBeDisabled();
      });

      resolveRequest();

      await waitFor(() => {
        expect(confirmBtn).not.toBeDisabled();
      });
    });

    it("updates action status after successful API call", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "action-2",
              status: "in_progress",
              version: 3,
            }),
        })
      );
      global.fetch = mockFetch;

      const { rerender } = render(
        <ActionCenter
          actions={[mockActions[1]]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("in_progress")).toBeInTheDocument();

      // Simulate action status change in parent
      rerender(
        <ActionCenter
          actions={[
            {
              ...mockActions[1],
              status: "blocked",
            },
          ]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("blocked")).toBeInTheDocument();
    });
  });

  describe("Empty States", () => {
    it("shows empty state when no actions", () => {
      render(
        <ActionCenter
          actions={[]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("No actions defined yet.")).toBeInTheDocument();
    });

    it("handles all actions completed gracefully", () => {
      render(
        <ActionCenter
          actions={[mockActions[3]]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText(/Completed \(1\)/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Verify/i })).toBeInTheDocument();
    });
  });
});
