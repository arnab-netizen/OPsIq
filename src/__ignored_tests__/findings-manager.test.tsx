import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FindingsManager } from "@/ui/findings-manager";

describe("FindingsManager", () => {
  const mockFindings = [
    {
      id: "finding-1",
      title: "SQL Injection vulnerability",
      summary: "User input not sanitized in login form",
      severity: "critical",
      version: 1,
      engagementId: "eng-1",
    },
    {
      id: "finding-2",
      title: "Missing authentication header",
      summary: "API endpoint lacks auth validation",
      severity: "high",
      version: 1,
      engagementId: "eng-1",
    },
    {
      id: "finding-3",
      title: "Outdated dependencies",
      summary: "npm packages have known vulnerabilities",
      severity: "medium",
      version: 2,
      engagementId: "eng-1",
    },
  ];

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  describe("Create Finding", () => {
    it("displays create button initially", () => {
      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      expect(screen.getByRole("button", { name: /Add Finding/i })).toBeInTheDocument();
    });

    it("shows create form when clicking Add Finding button", () => {
      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      const addBtn = screen.getByRole("button", { name: /Add Finding/i });
      fireEvent.click(addBtn);

      expect(screen.getByText("Create Finding")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Finding title")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Detailed description")).toBeInTheDocument();
    });

    it("validates required fields", async () => {
      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /Add Finding/i }));

      const createBtn = screen.getByRole("button", { name: /Create Finding/i });
      fireEvent.click(createBtn);

      await waitFor(() => {
        expect(screen.getByText("Title is required")).toBeInTheDocument();
        expect(screen.getByText("Summary is required")).toBeInTheDocument();
      });
    });

    it("calls API with valid finding data", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "finding-new",
              title: "New Finding",
              summary: "New summary",
              severity: "high",
              version: 1,
              engagementId: "eng-1",
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /Add Finding/i }));

      const titleInput = screen.getByPlaceholderText("Finding title");
      const summaryInput = screen.getByPlaceholderText("Detailed description");

      fireEvent.change(titleInput, { target: { value: "New Finding" } });
      fireEvent.change(summaryInput, { target: { value: "New summary" } });

      const createBtn = screen.getByRole("button", { name: /Create Finding/i });
      fireEvent.click(createBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/findings",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: expect.stringContaining('"title":"New Finding"'),
          })
        );
      });
    });

    it("clears form after successful creation", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "finding-new",
              title: "New Finding",
              summary: "New summary",
              severity: "high",
              version: 1,
              engagementId: "eng-1",
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /Add Finding/i }));

      const titleInput = screen.getByPlaceholderText("Finding title");
      const summaryInput = screen.getByPlaceholderText("Detailed description");

      fireEvent.change(titleInput, { target: { value: "New Finding" } });
      fireEvent.change(summaryInput, { target: { value: "New summary" } });

      const createBtn = screen.getByRole("button", { name: /Create Finding/i });
      fireEvent.click(createBtn);

      await waitFor(() => {
        expect(titleInput).toHaveValue("");
        expect(summaryInput).toHaveValue("");
      });
    });
  });

  describe("Update Finding Severity", () => {
    it("updates severity via API PATCH", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "finding-1",
              severity: "high",
              version: 2,
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      const highButton = buttons.find((btn) => btn.textContent === "High");

      if (highButton) {
        fireEvent.click(highButton);
      }

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/findings/finding-1"),
          expect.objectContaining({
            method: "PATCH",
            body: expect.stringContaining('"severity":"high"'),
          })
        );
      });
    });

    it("shows inline error on update failure", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: { message: "Conflict: Finding was modified" },
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      const highButton = buttons.find((btn) => btn.textContent === "High");

      if (highButton) {
        fireEvent.click(highButton);
      }

      await waitFor(() => {
        expect(screen.getByText("Conflict: Finding was modified")).toBeInTheDocument();
      });
    });

    it("disables buttons while updating", async () => {
      let resolveRequest: () => void = () => {};
      const mockFetch = vi.fn(() =>
        new Promise((resolve) => {
          resolveRequest = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  id: "finding-1",
                  severity: "high",
                  version: 2,
                }),
            });
        })
      );
      global.fetch = mockFetch;

      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      const highButton = buttons.find((btn) => btn.textContent === "High");

      if (highButton) {
        fireEvent.click(highButton);
      }

      await waitFor(() => {
        const criticalButton = screen.getAllByRole("button", { name: "Critical" })[0];
        expect(criticalButton).toBeDisabled();
      });

      resolveRequest();

      await waitFor(() => {
        const criticalButton = screen.getAllByRole("button", { name: "Critical" })[0];
        expect(criticalButton).not.toBeDisabled();
      });
    });
  });

  describe("Grouping by Severity", () => {
    it("groups findings correctly by severity", () => {
      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText(/Critical \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/High \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Other \(1\)/)).toBeInTheDocument();
    });

    it("displays critical findings in red section", () => {
      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
        />
      );

      const criticalSection = screen.getByText(/Critical \(1\)/).closest("div");
      expect(criticalSection).toHaveClass("border-destructive/50");
    });
  });

  describe("Callback Integration", () => {
    it("calls onFindingUpdated after successful creation", async () => {
      const mockCallback = vi.fn();
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "finding-new",
              title: "New Finding",
              summary: "New summary",
              severity: "high",
              version: 1,
              engagementId: "eng-1",
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
          onFindingUpdated={mockCallback}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /Add Finding/i }));

      const titleInput = screen.getByPlaceholderText("Finding title");
      const summaryInput = screen.getByPlaceholderText("Detailed description");

      fireEvent.change(titleInput, { target: { value: "New Finding" } });
      fireEvent.change(summaryInput, { target: { value: "New summary" } });

      fireEvent.click(screen.getByRole("button", { name: /Create Finding/i }));

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalled();
      });
    });

    it("calls onFindingUpdated after successful update", async () => {
      const mockCallback = vi.fn();
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "finding-1",
              severity: "high",
              version: 2,
            }),
        })
      );
      global.fetch = mockFetch;

      render(
        <FindingsManager
          findings={mockFindings}
          engagementId="eng-1"
          onFindingUpdated={mockCallback}
        />
      );

      const buttons = screen.getAllByRole("button", { name: "High" });
      const highButton = buttons.find((btn) => btn.textContent === "High");

      if (highButton) {
        fireEvent.click(highButton);
      }

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalled();
      });
    });
  });

  describe("Empty State", () => {
    it("shows empty state message when no findings", () => {
      render(
        <FindingsManager
          findings={[]}
          engagementId="eng-1"
        />
      );

      expect(screen.getByText("No findings recorded yet.")).toBeInTheDocument();
    });
  });
});
