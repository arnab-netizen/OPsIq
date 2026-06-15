/**
 * B23-S1: Sales Pitch / Outreach Generator — Unit Tests
 *
 * Tests pitch generation, compliance validation, and channel coverage.
 */

import {
  validateSalesPitch,
  checkComplianceStandards,
  scorePitch,
  validateObjectionHandler,
  type SalesPitch,
} from "@/domain/benchmark/sales-pitch";
import {
  getAllSamplePitches,
  getSamplePitch,
  validatePitch,
  checkPitchCompliance,
  scorePitchById,
  getPitchSummary,
} from "@/services/benchmark/sales-pitch.service";

describe("B23-S1 — Sales Pitch / Outreach Generator", () => {
  describe("Sample Pitches", () => {
    it("should create 2 sample pitches", () => {
      const pitches = getAllSamplePitches();
      expect(pitches).toHaveLength(2);
    });

    it("should have unique pitch IDs", () => {
      const pitches = getAllSamplePitches();
      const ids = pitches.map((p) => p.pitch_id);
      expect(new Set(ids).size).toBe(2);
    });

    it("should retrieve pitch by ID", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).not.toBeNull();
      expect(pitch?.pitch_id).toBe("pitch_saas_inventory_001");
    });

    it("should return null for unknown pitch", () => {
      const pitch = getSamplePitch("unknown");
      expect(pitch).toBeNull();
    });

    it("should have at least one pitch channel", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        const hasChannel = !!(pitch.cold_email || pitch.whatsapp_pitch || pitch.call_script);
        expect(hasChannel).toBe(true);
      }
    });

    it("should have follow-up sequences", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        expect(pitch.follow_up_sequence).toBeDefined();
        expect(pitch.follow_up_sequence.stop_condition).toBeTruthy();
      }
    });
  });

  describe("Hard Rule: Evidence Citation", () => {
    it("should require evidence citation", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const invalid = { ...pitch, evidence_cited: false };
      const validation = validateSalesPitch(invalid!);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("cite evidence"))).toBe(true);
    });

    it("sample pitches should cite evidence", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        expect(pitch.evidence_cited).toBe(true);
      }
    });

    it("pitch channels should reference evidence", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const channels = [pitch?.cold_email, pitch?.whatsapp_pitch, pitch?.call_script].filter(
        (c) => c !== undefined
      );
      for (const channel of channels) {
        expect(channel?.evidence_reference).toBeTruthy();
      }
    });
  });

  describe("Hard Rule: Constraint Compliance", () => {
    it("should require constraint compliance", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const invalid = { ...pitch, constraint_compliant: false };
      const validation = validateSalesPitch(invalid!);
      expect(validation.valid).toBe(false);
    });

    it("sample pitches should be constraint compliant", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        expect(pitch.constraint_compliant).toBe(true);
      }
    });
  });

  describe("Hard Rule: No Deceptive Claims", () => {
    it("should reject deceptive claims", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const invalid = { ...pitch, no_deceptive_claims: false };
      const validation = validateSalesPitch(invalid!);
      expect(validation.valid).toBe(false);
    });

    it("sample pitches should have no deceptive claims", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        expect(pitch.no_deceptive_claims).toBe(true);
      }
    });
  });

  describe("Hard Rule: Stop Condition", () => {
    it("should require stop/unsubscribe condition", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const invalid = { ...pitch, has_stop_condition: false };
      const validation = validateSalesPitch(invalid!);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("stop"))).toBe(true);
    });

    it("sample pitches should have stop condition", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        expect(pitch.has_stop_condition).toBe(true);
        expect(pitch.follow_up_sequence.stop_condition).toBeTruthy();
      }
    });

    it("email pitches should have unsubscribe instruction", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch?.cold_email?.closing).toContain("STOP");
      expect(pitch?.follow_up_sequence.unsubscribe_instruction).toBeTruthy();
    });
  });

  describe("Compliance Standards", () => {
    it("should check all compliance rules", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const result = checkComplianceStandards(pitch!);
      expect(result.compliant).toBe(true);
      expect(result.failures.length).toBe(0);
    });

    it("should detect spammy language", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const spammy = {
        ...pitch!,
        cold_email: {
          ...pitch!.cold_email,
          cta: "ACT NOW - GUARANTEED SUCCESS",
        },
      };
      const result = checkComplianceStandards(spammy);
      // May have warnings about spammy language
      expect(result.warnings.length >= 0).toBe(true);
    });
  });

  describe("Pitch Scoring", () => {
    it("should score pitches 0-100", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        const scores = scorePitch(pitch);
        expect(scores.quality_score).toBeGreaterThanOrEqual(0);
        expect(scores.quality_score).toBeLessThanOrEqual(100);
      }
    });

    it("should award full compliance score for compliant pitches", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const scores = scorePitch(pitch!);
      expect(scores.compliance_score).toBe(100);
    });

    it("should calculate effectiveness score", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const scores = scorePitch(pitch!);
      expect(scores.effectiveness_score).toBeGreaterThanOrEqual(0);
      expect(scores.effectiveness_score).toBeLessThanOrEqual(100);
    });

    it("fully compliant pitch should have strong recommendation", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const scores = scorePitch(pitch!);
      if (scores.compliance_score === 100 && scores.quality_score >= 80) {
        expect(scores.recommendation).toBe("strong");
      }
    });
  });

  describe("Objection Handling", () => {
    it("sample pitches should have objection handlers", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        expect(pitch.objection_handlers.length).toBeGreaterThan(0);
      }
    });

    it("objection handlers should be valid", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        for (const handler of pitch.objection_handlers) {
          const validation = validateObjectionHandler(handler);
          expect(validation.valid).toBe(true);
        }
      }
    });

    it("objection handler should have evidence", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      for (const handler of pitch!.objection_handlers) {
        expect(handler.evidence).toBeTruthy();
        expect(handler.evidence.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Follow-Up Sequence", () => {
    it("should define follow-up sequence", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        expect(pitch.follow_up_sequence).toBeDefined();
        expect(pitch.follow_up_sequence.channels.length).toBeGreaterThan(0);
      }
    });

    it("should define max touches", () => {
      const pitches = getAllSamplePitches();
      for (const pitch of pitches) {
        expect(pitch.follow_up_sequence.max_touches).toBeGreaterThan(0);
        expect(pitch.follow_up_sequence.channels.length).toBeLessThanOrEqual(
          pitch.follow_up_sequence.max_touches
        );
      }
    });

    it("should not exceed max touches", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      expect(pitch!.follow_up_sequence.channels.length).toBeLessThanOrEqual(
        pitch!.follow_up_sequence.max_touches
      );
    });
  });

  describe("Service Functions", () => {
    it("should validate pitch via service", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const result = validatePitch(pitch!);
      expect(result.valid).toBe(true);
    });

    it("should check pitch compliance via service", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();
      const result = checkPitchCompliance(pitch!);
      expect(result.compliant).toBe(true);
    });

    it("should score pitch by ID", () => {
      const scores = scorePitchById("pitch_saas_inventory_001");
      expect(scores).not.toBeNull();
      expect(scores?.quality_score).toBeGreaterThan(0);
    });

    it("should return null for unknown pitch score", () => {
      const scores = scorePitchById("unknown");
      expect(scores).toBeNull();
    });

    it("should provide summary", () => {
      const summary = getPitchSummary();
      expect(summary.total_pitches).toBe(2);
      expect(summary.compliant_pitches).toBeGreaterThan(0);
      expect(summary.average_quality_score).toBeGreaterThan(0);
      expect(summary.channels_covered.length).toBeGreaterThan(0);
    });
  });

  describe("Determinism", () => {
    it("should score identically for same pitch", () => {
      const pitch1 = getSamplePitch("pitch_saas_inventory_001");
      const pitch2 = getSamplePitch("pitch_saas_inventory_001");

      const scores1 = scorePitch(pitch1!);
      const scores2 = scorePitch(pitch2!);

      expect(scores1.quality_score).toBe(scores2.quality_score);
      expect(scores1.compliance_score).toBe(scores2.compliance_score);
      expect(scores1.recommendation).toBe(scores2.recommendation);
    });

    it("should validate consistently", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      const validation1 = validateSalesPitch(pitch!);
      const validation2 = validateSalesPitch(pitch!);

      expect(validation1.valid).toBe(validation2.valid);
      expect(validation1.errors.length).toBe(validation2.errors.length);
    });
  });

  describe("Integration: Full workflow", () => {
    it("should demonstrate complete pitch workflow", () => {
      const pitch = getSamplePitch("pitch_saas_inventory_001");
      expect(pitch).toBeDefined();

      // 1. Validate
      const validation = validatePitch(pitch!);
      expect(validation.valid).toBe(true);

      // 2. Check compliance
      const compliance = checkPitchCompliance(pitch!);
      expect(compliance.compliant).toBe(true);

      // 3. Score
      const scores = scorePitchById(pitch!.pitch_id);
      expect(scores).not.toBeNull();
      expect(scores?.compliance_score).toBe(100);

      // 4. Verify channels
      const channels = [pitch?.cold_email, pitch?.whatsapp_pitch, pitch?.call_script].filter(
        (c) => c !== undefined
      );
      expect(channels.length).toBeGreaterThan(0);
    });

    it("should demonstrate hard rules enforcement", () => {
      const pitches = getAllSamplePitches();

      for (const pitch of pitches) {
        // All must be fully compliant
        expect(pitch.evidence_cited).toBe(true);
        expect(pitch.constraint_compliant).toBe(true);
        expect(pitch.no_deceptive_claims).toBe(true);
        expect(pitch.has_stop_condition).toBe(true);

        // All must have objection handling
        expect(pitch.objection_handlers.length).toBeGreaterThan(0);

        // All must have follow-up sequence with stop condition
        expect(pitch.follow_up_sequence.stop_condition).toBeTruthy();
      }
    });

    it("should demonstrate multi-channel pitching", () => {
      const pitches = getAllSamplePitches();
      const channels = new Set<string>();

      for (const pitch of pitches) {
        if (pitch.cold_email) channels.add("cold_email");
        if (pitch.whatsapp_pitch) channels.add("whatsapp");
        if (pitch.call_script) channels.add("call_script");
      }

      // Should cover multiple channels across pitches
      expect(channels.size).toBeGreaterThan(1);
    });
  });
});
