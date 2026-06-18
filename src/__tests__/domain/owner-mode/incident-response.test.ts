import { describe, it, expect } from "vitest";
import {
  createIncident,
  updateIncidentStatus,
  tripCircuitBreaker,
  resolveCircuitBreaker,
  setCircuitBreakerHalfOpen,
  incidentRequiresCircuitBreaker,
  incidentRequiresOwnerNotification,
  incidentRequiresPostIncidentReview,
  validateCreateIncidentInput,
  validateTripCircuitBreakerInput,
  getRollbackPath,
  ROLLBACK_PATHS,
  type CreateIncidentInput,
  type TripCircuitBreakerInput,
  type OwnerIncidentEvent,
} from "../../../domain/owner-mode/incident-response";

const WS = "ws-incident-001";
const BIZ = "biz-incident-001";
const OTHER_WS = "ws-other-999";
const OPERATOR = "operator-user-001";

function baseIncidentInput(overrides?: Partial<CreateIncidentInput>): CreateIncidentInput {
  return {
    incidentId: "inc-001",
    severity: "high",
    trigger: "harmful_recommendation",
    detectedAt: "2026-06-18T10:00:00Z",
    affectedWorkspaceId: WS,
    affectedBusinessId: BIZ,
    containmentStep: "Halted new recommendations for affected workspace",
    featureFlagShutdown: true,
    rollbackStep: "Triggered reassessment workflow for affected cycle",
    ownerNotificationRequired: true,
    postIncidentReviewRequired: true,
    createdAt: "2026-06-18T10:05:00Z",
    ...overrides,
  };
}

function baseBreakerInput(overrides?: Partial<TripCircuitBreakerInput>): TripCircuitBreakerInput {
  return {
    breakerId: "cb-001",
    workspaceId: WS,
    capabilityHalted: "recommendation_generation",
    trigger: "harmful_recommendation",
    tripReason: "Severe harm reported by owner",
    trippedAt: "2026-06-18T10:01:00Z",
    trippedByUserId: OPERATOR,
    createdAt: "2026-06-18T10:01:00Z",
    ...overrides,
  };
}

function buildIncident(overrides?: Partial<CreateIncidentInput>): OwnerIncidentEvent {
  return createIncident(baseIncidentInput(overrides));
}

// ─── createIncident ───────────────────────────────────────────────────────────

describe("createIncident", () => {
  it("creates a valid incident with status=open", () => {
    const incident = buildIncident();
    expect(incident.incidentId).toBe("inc-001");
    expect(incident.status).toBe("open");
    expect(incident.severity).toBe("high");
    expect(incident.trigger).toBe("harmful_recommendation");
    expect(incident.affectedWorkspaceId).toBe(WS);
  });

  it("sets status to open regardless of input", () => {
    const incident = buildIncident();
    expect(incident.status).toBe("open");
  });

  it("records featureFlagShutdown correctly", () => {
    const incident = buildIncident({ featureFlagShutdown: true });
    expect(incident.featureFlagShutdown).toBe(true);
  });

  it("records ownerNotificationRequired correctly", () => {
    const incident = buildIncident({ ownerNotificationRequired: true });
    expect(incident.ownerNotificationRequired).toBe(true);
  });

  it("records postIncidentReviewRequired correctly", () => {
    const incident = buildIncident({ postIncidentReviewRequired: true });
    expect(incident.postIncidentReviewRequired).toBe(true);
  });

  it("throws when containmentStep is empty", () => {
    expect(() => buildIncident({ containmentStep: "" })).toThrow();
  });

  it("throws when rollbackStep is empty", () => {
    expect(() => buildIncident({ rollbackStep: "" })).toThrow();
  });

  it("throws when incidentId is empty", () => {
    expect(() => buildIncident({ incidentId: "" })).toThrow();
  });

  it("throws when affectedWorkspaceId is empty", () => {
    expect(() => buildIncident({ affectedWorkspaceId: "" })).toThrow();
  });

  it("throws when affectedBusinessId is empty", () => {
    expect(() => buildIncident({ affectedBusinessId: "" })).toThrow();
  });

  it("throws when detectedAt is empty", () => {
    expect(() => buildIncident({ detectedAt: "" })).toThrow();
  });
});

// ─── All 10 incident classes ──────────────────────────────────────────────────

describe("all 10 incident classes", () => {
  const classes = [
    "harmful_recommendation",
    "privacy_leak",
    "cross_tenant_exposure",
    "learning_gate_bypass",
    "wrong_high_confidence_advice",
    "dashboard_misreporting",
    "evidence_verification_bypass",
    "db_migration_data_loss",
    "prompt_injection_success",
    "security_gate_failure",
  ] as const;

  classes.forEach((trigger) => {
    it(`accepts incident class: ${trigger}`, () => {
      const incident = buildIncident({ trigger });
      expect(incident.trigger).toBe(trigger);
    });
  });
});

// ─── validateCreateIncidentInput ──────────────────────────────────────────────

describe("validateCreateIncidentInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateCreateIncidentInput(baseIncidentInput())).toHaveLength(0);
  });

  it("returns error for missing containmentStep", () => {
    const errors = validateCreateIncidentInput(baseIncidentInput({ containmentStep: "" }));
    expect(errors.some((e) => e.includes("containmentStep"))).toBe(true);
  });

  it("returns error for missing rollbackStep", () => {
    const errors = validateCreateIncidentInput(baseIncidentInput({ rollbackStep: "  " }));
    expect(errors.some((e) => e.includes("rollbackStep"))).toBe(true);
  });

  it("returns error for missing incidentId", () => {
    expect(validateCreateIncidentInput(baseIncidentInput({ incidentId: "" }))).toContain("incidentId is required");
  });

  it("returns error for missing affectedBusinessId", () => {
    expect(validateCreateIncidentInput(baseIncidentInput({ affectedBusinessId: "" }))).toContain(
      "affectedBusinessId is required"
    );
  });
});

// ─── updateIncidentStatus ─────────────────────────────────────────────────────

describe("updateIncidentStatus", () => {
  it("transitions open → contained", () => {
    const incident = buildIncident();
    const updated = updateIncidentStatus(incident, {
      incidentId: "inc-001",
      workspaceId: WS,
      status: "contained",
      updatedAt: "2026-06-18T11:00:00Z",
    });
    expect(updated.status).toBe("contained");
  });

  it("transitions contained → resolved", () => {
    const incident = buildIncident();
    const contained = updateIncidentStatus(incident, {
      incidentId: "inc-001",
      workspaceId: WS,
      status: "contained",
      updatedAt: "2026-06-18T11:00:00Z",
    });
    const resolved = updateIncidentStatus(contained, {
      incidentId: "inc-001",
      workspaceId: WS,
      status: "resolved",
      updatedAt: "2026-06-18T12:00:00Z",
    });
    expect(resolved.status).toBe("resolved");
  });

  it("transitions resolved → closed", () => {
    const incident = buildIncident();
    const closed = updateIncidentStatus(
      updateIncidentStatus(
        updateIncidentStatus(incident, { incidentId: "inc-001", workspaceId: WS, status: "contained", updatedAt: "t1" }),
        { incidentId: "inc-001", workspaceId: WS, status: "resolved", updatedAt: "t2" }
      ),
      { incidentId: "inc-001", workspaceId: WS, status: "closed", updatedAt: "t3" }
    );
    expect(closed.status).toBe("closed");
  });

  it("throws when workspaceId does not match", () => {
    const incident = buildIncident();
    expect(() =>
      updateIncidentStatus(incident, {
        incidentId: "inc-001",
        workspaceId: OTHER_WS,
        status: "contained",
        updatedAt: "2026-06-18T11:00:00Z",
      })
    ).toThrow("Access denied");
  });

  it("throws when updatedAt is empty", () => {
    const incident = buildIncident();
    expect(() =>
      updateIncidentStatus(incident, {
        incidentId: "inc-001",
        workspaceId: WS,
        status: "contained",
        updatedAt: "",
      })
    ).toThrow();
  });

  it("does not mutate original incident", () => {
    const incident = buildIncident();
    updateIncidentStatus(incident, {
      incidentId: "inc-001",
      workspaceId: WS,
      status: "contained",
      updatedAt: "t",
    });
    expect(incident.status).toBe("open");
  });
});

// ─── tripCircuitBreaker ───────────────────────────────────────────────────────

describe("tripCircuitBreaker", () => {
  it("creates a breaker in open state", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    expect(breaker.state).toBe("open");
    expect(breaker.capabilityHalted).toBe("recommendation_generation");
    expect(breaker.trippedByUserId).toBe(OPERATOR);
  });

  it("throws when trippedByUserId is empty (AI cannot trip breakers)", () => {
    expect(() =>
      tripCircuitBreaker(baseBreakerInput({ trippedByUserId: "" }))
    ).toThrow("INCIDENT-RULE-AI-NOT-AUTONOMOUS");
  });

  it("throws when capabilityHalted is empty", () => {
    expect(() =>
      tripCircuitBreaker(baseBreakerInput({ capabilityHalted: "" }))
    ).toThrow();
  });

  it("throws when tripReason is empty", () => {
    expect(() =>
      tripCircuitBreaker(baseBreakerInput({ tripReason: "" }))
    ).toThrow();
  });

  it("throws when breakerId is empty", () => {
    expect(() =>
      tripCircuitBreaker(baseBreakerInput({ breakerId: "" }))
    ).toThrow();
  });

  it("stores trigger on the breaker", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput({ trigger: "learning_gate_bypass" }));
    expect(breaker.trigger).toBe("learning_gate_bypass");
  });
});

// ─── Learning bypass triggers incident ───────────────────────────────────────

describe("learning_gate_bypass triggers incident", () => {
  it("learning gate bypass creates a valid incident", () => {
    const incident = buildIncident({
      trigger: "learning_gate_bypass",
      severity: "high",
      containmentStep: "Quarantined bypassed learning record",
      rollbackStep: "Halted learning eligibility processing",
    });
    expect(incident.trigger).toBe("learning_gate_bypass");
    expect(incident.severity).toBe("high");
  });

  it("learning gate bypass requires circuit breaker", () => {
    const incident = buildIncident({ trigger: "learning_gate_bypass", severity: "high" });
    expect(incidentRequiresCircuitBreaker(incident)).toBe(true);
  });

  it("learning gate bypass can trip circuit breaker", () => {
    const breaker = tripCircuitBreaker(
      baseBreakerInput({
        trigger: "learning_gate_bypass",
        capabilityHalted: "learning_eligibility_processing",
        tripReason: "Ineligible outcome used for learning",
      })
    );
    expect(breaker.state).toBe("open");
    expect(breaker.capabilityHalted).toBe("learning_eligibility_processing");
  });
});

// ─── Tenant isolation failure path ───────────────────────────────────────────

describe("tenant isolation failure path exists", () => {
  it("cross_tenant_exposure incident can be created", () => {
    const incident = buildIncident({
      trigger: "cross_tenant_exposure",
      severity: "critical",
      containmentStep: "Halted all cross-workspace query paths",
      rollbackStep: "Platform-wide emergency review initiated",
      ownerNotificationRequired: true,
      postIncidentReviewRequired: true,
    });
    expect(incident.trigger).toBe("cross_tenant_exposure");
    expect(incident.severity).toBe("critical");
  });

  it("cross_tenant_exposure always requires circuit breaker", () => {
    const incident = buildIncident({ trigger: "cross_tenant_exposure", severity: "medium" });
    expect(incidentRequiresCircuitBreaker(incident)).toBe(true);
  });

  it("cross_tenant_exposure always requires owner notification", () => {
    const incident = buildIncident({
      trigger: "cross_tenant_exposure",
      ownerNotificationRequired: false,
    });
    expect(incidentRequiresOwnerNotification(incident)).toBe(true);
  });

  it("tenant isolation failure rollback path exists", () => {
    const path = getRollbackPath("cross_tenant_exposure");
    expect(path).toBeDefined();
    expect(path!.rollbackSteps.length).toBeGreaterThan(0);
    expect(path!.requiresHumanApproval).toBe(true);
  });
});

// ─── Severe harm triggers circuit breaker ────────────────────────────────────

describe("severe harm triggers circuit breaker", () => {
  it("critical severity always requires circuit breaker", () => {
    const incident = buildIncident({ severity: "critical", trigger: "harmful_recommendation" });
    expect(incidentRequiresCircuitBreaker(incident)).toBe(true);
  });

  it("high severity always requires circuit breaker", () => {
    const incident = buildIncident({ severity: "high", trigger: "harmful_recommendation" });
    expect(incidentRequiresCircuitBreaker(incident)).toBe(true);
  });

  it("medium severity harmful_recommendation does NOT require circuit breaker via severity alone", () => {
    const incident = buildIncident({ severity: "medium", trigger: "harmful_recommendation" });
    // medium doesn't auto-trigger — only high/critical or specific classes do
    expect(incidentRequiresCircuitBreaker(incident)).toBe(false);
  });

  it("low severity dashboard_misreporting does NOT require circuit breaker", () => {
    const incident = buildIncident({ severity: "low", trigger: "dashboard_misreporting" });
    expect(incidentRequiresCircuitBreaker(incident)).toBe(false);
  });

  it("circuit breaker can be created for severe harm", () => {
    const breaker = tripCircuitBreaker(
      baseBreakerInput({
        trigger: "harmful_recommendation",
        capabilityHalted: "recommendation_generation",
        tripReason: "Critical harm reported; recommendations halted",
      })
    );
    expect(breaker.state).toBe("open");
    expect(breaker.trigger).toBe("harmful_recommendation");
  });
});

// ─── Evidence bypass triggers incident ───────────────────────────────────────

describe("evidence verification bypass triggers incident", () => {
  it("evidence_verification_bypass incident can be created", () => {
    const incident = buildIncident({
      trigger: "evidence_verification_bypass",
      severity: "high",
      containmentStep: "Reverted evidence to unverified status",
      rollbackStep: "Halted evidence verification workflow",
    });
    expect(incident.trigger).toBe("evidence_verification_bypass");
  });

  it("evidence_verification_bypass requires circuit breaker", () => {
    const incident = buildIncident({ trigger: "evidence_verification_bypass", severity: "low" });
    expect(incidentRequiresCircuitBreaker(incident)).toBe(true);
  });

  it("evidence_verification_bypass requires owner notification", () => {
    const incident = buildIncident({
      trigger: "evidence_verification_bypass",
      ownerNotificationRequired: false,
    });
    expect(incidentRequiresOwnerNotification(incident)).toBe(true);
  });

  it("rollback path exists for evidence_verification_bypass", () => {
    const path = getRollbackPath("evidence_verification_bypass");
    expect(path).toBeDefined();
    expect(path!.rollbackSteps).toContain("Revert evidence verification status to unverified");
  });
});

// ─── Rollback path documented ─────────────────────────────────────────────────

describe("rollback paths documented", () => {
  it("all 10 incident classes have rollback paths", () => {
    const classes = [
      "harmful_recommendation",
      "privacy_leak",
      "cross_tenant_exposure",
      "learning_gate_bypass",
      "wrong_high_confidence_advice",
      "dashboard_misreporting",
      "evidence_verification_bypass",
      "db_migration_data_loss",
      "prompt_injection_success",
      "security_gate_failure",
    ] as const;
    for (const cls of classes) {
      const path = getRollbackPath(cls);
      expect(path, `Missing rollback path for ${cls}`).toBeDefined();
      expect(path!.rollbackSteps.length, `${cls} has no rollback steps`).toBeGreaterThan(0);
      expect(path!.resumptionGate, `${cls} has no resumption gate`).toBeTruthy();
    }
  });

  it("critical classes require human approval for rollback", () => {
    const criticalClasses = [
      "cross_tenant_exposure",
      "learning_gate_bypass",
      "db_migration_data_loss",
      "prompt_injection_success",
      "security_gate_failure",
    ] as const;
    for (const cls of criticalClasses) {
      const path = getRollbackPath(cls);
      expect(path!.requiresHumanApproval, `${cls} should require human approval`).toBe(true);
    }
  });

  it("ROLLBACK_PATHS has exactly 10 entries", () => {
    expect(ROLLBACK_PATHS).toHaveLength(10);
  });

  it("db_migration_data_loss rollback includes stop all writes", () => {
    const path = getRollbackPath("db_migration_data_loss");
    expect(path!.rollbackSteps[0]).toContain("write operations");
  });

  it("prompt_injection_success rollback includes halt AI advisory generation", () => {
    const path = getRollbackPath("prompt_injection_success");
    expect(path!.rollbackSteps[0]).toContain("AI advisory generation");
  });
});

// ─── resolveCircuitBreaker ────────────────────────────────────────────────────

describe("resolveCircuitBreaker", () => {
  it("resolves an open breaker to closed state", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    const resolved = resolveCircuitBreaker(breaker, {
      breakerId: "cb-001",
      workspaceId: WS,
      resolvedAt: "2026-06-18T14:00:00Z",
      resolvedByUserId: OPERATOR,
    });
    expect(resolved.state).toBe("closed");
    expect(resolved.resolvedByUserId).toBe(OPERATOR);
  });

  it("throws when resolvedByUserId is empty", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    expect(() =>
      resolveCircuitBreaker(breaker, {
        breakerId: "cb-001",
        workspaceId: WS,
        resolvedAt: "2026-06-18T14:00:00Z",
        resolvedByUserId: "",
      })
    ).toThrow("human operator");
  });

  it("throws when workspaceId does not match", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    expect(() =>
      resolveCircuitBreaker(breaker, {
        breakerId: "cb-001",
        workspaceId: OTHER_WS,
        resolvedAt: "2026-06-18T14:00:00Z",
        resolvedByUserId: OPERATOR,
      })
    ).toThrow("Access denied");
  });

  it("does not mutate original breaker", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    resolveCircuitBreaker(breaker, {
      breakerId: "cb-001",
      workspaceId: WS,
      resolvedAt: "t",
      resolvedByUserId: OPERATOR,
    });
    expect(breaker.state).toBe("open");
  });
});

// ─── setCircuitBreakerHalfOpen ────────────────────────────────────────────────

describe("setCircuitBreakerHalfOpen", () => {
  it("transitions open → half_open", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    const halfOpen = setCircuitBreakerHalfOpen(breaker, OPERATOR);
    expect(halfOpen.state).toBe("half_open");
  });

  it("throws when called on a closed breaker", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    const resolved = resolveCircuitBreaker(breaker, {
      breakerId: "cb-001",
      workspaceId: WS,
      resolvedAt: "t",
      resolvedByUserId: OPERATOR,
    });
    expect(() => setCircuitBreakerHalfOpen(resolved, OPERATOR)).toThrow("half_open");
  });

  it("throws when operatorUserId is empty", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    expect(() => setCircuitBreakerHalfOpen(breaker, "")).toThrow();
  });
});

// ─── incidentRequiresPostIncidentReview ───────────────────────────────────────

describe("incidentRequiresPostIncidentReview", () => {
  it("critical severity requires PIR", () => {
    const incident = buildIncident({ severity: "critical" });
    expect(incidentRequiresPostIncidentReview(incident)).toBe(true);
  });

  it("high severity requires PIR", () => {
    const incident = buildIncident({ severity: "high" });
    expect(incidentRequiresPostIncidentReview(incident)).toBe(true);
  });

  it("medium with featureFlagShutdown requires PIR", () => {
    const incident = buildIncident({
      severity: "medium",
      featureFlagShutdown: true,
      postIncidentReviewRequired: false,
    });
    expect(incidentRequiresPostIncidentReview(incident)).toBe(true);
  });

  it("low severity with no flag shutdown and postIncidentReviewRequired=false does not require PIR", () => {
    const incident = buildIncident({
      severity: "low",
      featureFlagShutdown: false,
      postIncidentReviewRequired: false,
    });
    expect(incidentRequiresPostIncidentReview(incident)).toBe(false);
  });
});

// ─── Workspace isolation ──────────────────────────────────────────────────────

describe("workspace isolation", () => {
  it("incident is scoped to affectedWorkspaceId", () => {
    const incident = buildIncident();
    expect(incident.affectedWorkspaceId).toBe(WS);
  });

  it("updateIncidentStatus blocks cross-workspace access", () => {
    const incident = buildIncident();
    expect(() =>
      updateIncidentStatus(incident, {
        incidentId: "inc-001",
        workspaceId: "ws-attacker",
        status: "closed",
        updatedAt: "t",
      })
    ).toThrow("Access denied");
  });

  it("resolveCircuitBreaker blocks cross-workspace access", () => {
    const breaker = tripCircuitBreaker(baseBreakerInput());
    expect(() =>
      resolveCircuitBreaker(breaker, {
        breakerId: "cb-001",
        workspaceId: "ws-attacker",
        resolvedAt: "t",
        resolvedByUserId: OPERATOR,
      })
    ).toThrow("Access denied");
  });
});
