import { vi } from "vitest";
import { db } from "@/lib/db";

/**
 * Setup mock database with default responses.
 * This allows integration tests to run without requiring a real database.
 */
export function setupMockDatabase() {
  const mockDb = db as any;

  // Ensure all common database models have default mock implementations
  const mockResolver = () => ({});
  const mockMethods = {
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    upsert: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  };

  // Apply mock methods to all known models
  const models = [
    "user",
    "clientAccount",
    "engagement",
    "evidence",
    "evidenceBundle",
    "evidenceBundleItem",
    "finding",
    "recommendation",
    "action",
    "kpi",
    "deliverable",
    "risk",
    "stage",
    "businessConditionProfile",
    "interventionState",
    "auditEvent",
    "idempotencyRecord",
    "leadRecord",
    "review",
    "shockEvent",
  ];

  models.forEach((model) => {
    mockDb[model] = { ...mockMethods };
  });

  return mockDb;
}

/**
 * Create a mock client response
 */
export function createMockClient(overrides?: any) {
  return {
    id: "client-123",
    name: "Test Client",
    industry: "Finance",
    size: "medium",
    status: "active",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock engagement response
 */
export function createMockEngagement(overrides?: any) {
  return {
    id: "eng-123",
    code: "ENG-001",
    title: "Test Engagement",
    clientId: "client-123",
    serviceTier: "standard",
    engagementMode: "beginner",
    status: "active",
    healthStatus: "healthy",
    interventionMode: "stabilization",
    interventionPhase: "triage",
    description: "Test engagement",
    startDate: new Date(),
    targetEndDate: new Date(),
    ownerId: "user-123",
    version: 1,
    visibility: "internal",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock evidence response
 */
export function createMockEvidence(overrides?: any) {
  return {
    id: "ev-123",
    engagementId: "eng-123",
    category: "financial",
    type: "cash_flow_analysis",
    sourceType: "document",
    sourceLabel: "Q1 2026 Bank Statements",
    statement: "Bank balance declining",
    validationStatus: "pending",
    severity: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
