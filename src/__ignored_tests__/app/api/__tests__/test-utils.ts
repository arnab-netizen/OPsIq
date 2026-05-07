/**
 * Test utilities for mocking database and workspace context
 * Reduces coupling between tests and actual database implementation
 */

import { vi } from "vitest";
import { MockOperatorItem } from "./factories";

export interface MockDbContext {
  mockOperatorItemFindMany: (items: MockOperatorItem[]) => void;
  mockOperatorItemFindUnique: (item: MockOperatorItem | null) => void;
  mockOperatorItemCreate: (item: MockOperatorItem) => void;
  mockOperatorItemUpdate: (item: MockOperatorItem) => void;
  mockWorkspaceContext: (workspaceId: string) => void;
  clearAllMocks: () => void;
}

export function setupMockDb(): MockDbContext {
  const findManyMock = vi.fn();
  const findUniqueMock = vi.fn();
  const createMock = vi.fn();
  const updateMock = vi.fn();
  const workspaceContextMock = vi.fn();

  // Mock database
  vi.mock("@/lib/db", () => ({
    db: {
      operatorItem: {
        findMany: findManyMock,
        findUnique: findUniqueMock,
        create: createMock,
        update: updateMock,
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({
          id: "audit-" + Math.random().toString(36).substr(2, 9),
        }),
      },
    },
  }));

  // Mock workspace context
  vi.mock("@/services/workspace/context", () => ({
    requireWorkspaceContext: workspaceContextMock,
  }));

  return {
    mockOperatorItemFindMany: (items: MockOperatorItem[]) => {
      findManyMock.mockResolvedValue(items);
    },
    mockOperatorItemFindUnique: (item: MockOperatorItem | null) => {
      findUniqueMock.mockResolvedValue(item);
    },
    mockOperatorItemCreate: (item: MockOperatorItem) => {
      createMock.mockResolvedValue(item);
    },
    mockOperatorItemUpdate: (item: MockOperatorItem) => {
      updateMock.mockResolvedValue(item);
    },
    mockWorkspaceContext: (workspaceId: string) => {
      workspaceContextMock.mockResolvedValue({ workspaceId });
    },
    clearAllMocks: () => {
      findManyMock.mockClear();
      findUniqueMock.mockClear();
      createMock.mockClear();
      updateMock.mockClear();
      workspaceContextMock.mockClear();
    },
  };
}

export function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
) {
  const { method = "GET", headers = {}, body = null } = options;

  const req = new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  return req;
}

export function expectWorkspaceIsolation(
  mockFn: any,
  workspaceId: string
) {
  expect(mockFn).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        workspaceId,
      }),
    })
  );
}

export function expectFailClosedPattern(
  status: number,
  body: any
) {
  // Fail-closed means we return explicit error codes (400/403/422/500) before processing
  expect([400, 403, 422, 500]).toContain(status);
  expect(body).toHaveProperty("error");
}

export async function parseJsonResponse(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
