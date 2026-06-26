import { describe, it, expect } from "vitest";
import { validateChecklistProofBinding, assessProof, type ChecklistItem, type ProofAuthenticitySignals } from "@/domain/remote-operations/proof";
import { assessOfflineProof, type OfflineProofRecord } from "@/domain/remote-operations/offline-integrity";

const clean = (over: Partial<ProofAuthenticitySignals> = {}): ProofAuthenticitySignals => ({
  requiredProofPresent: true, hasRequiredView: true, beforeAfterPaired: true, authorizedSubmitter: true, withinWindow: true,
  imageQualityOk: true, relatedToChecklistItem: true, metadataPresent: true, duplicateSuspected: false, samePhotoBeforeAndAfter: false,
  noVisibleChangeWhereExpected: false, timestampSuspicious: false, locationMismatch: false, contradictedByComplaint: false,
  resolutionBelowMinimum: false, multiSource: false, ...over,
});

describe("[R12] checklist-proof binding", () => {
  const item = (label: string, done: boolean, proof: ChecklistItem["attachedProof"]): ChecklistItem => ({ label, critical: true, done, attachedProof: proof });
  it("a critical 'bathroom cleaned' tick without an after photo is unbound", () => {
    expect(validateChecklistProofBinding([item("Bathroom cleaned", true, [])])).toContain("Bathroom cleaned:requires:AFTER_PHOTO");
  });
  it("the binding is satisfied when the required proof is attached", () => {
    expect(validateChecklistProofBinding([item("Bathroom cleaned", true, ["AFTER_PHOTO"])])).toEqual([]);
  });
  it("a key-return tick requires key-return proof", () => {
    expect(validateChecklistProofBinding([item("Key returned", true, [])])).toContain("Key returned:requires:KEY_RETURN_PROOF");
  });
});

describe("[R13] proof status/strength/authenticity — weak proof never becomes strong", () => {
  it("clean proof is accepted (standard) and multi-source is high-confidence", () => {
    expect(assessProof(clean(), "STANDARD").status).toBe("ACCEPTED");
    expect(assessProof(clean({ multiSource: true }), "STANDARD").strength).toBe("MULTI_SOURCE_PROOF");
  });
  it("missing required proof blocks verification", () => {
    const a = assessProof(clean({ requiredProofPresent: false }), "STANDARD");
    expect(a.status).toBe("MISSING"); expect(a.blocksVerification).toBe(true);
  });
  it("a reused/duplicate photo is disputed and blocks", () => {
    const a = assessProof(clean({ duplicateSuspected: true }), "HIGH");
    expect(a.status).toBe("DUPLICATE_SUSPECTED"); expect(a.strength).toBe("DISPUTED_PROOF"); expect(a.blocksVerification).toBe(true);
  });
  it("same photo as before+after / no visible change is contradictory", () => {
    expect(assessProof(clean({ samePhotoBeforeAndAfter: true }), "HIGH").status).toBe("CONTRADICTORY");
    expect(assessProof(clean({ noVisibleChangeWhereExpected: true }), "HIGH").strength).toBe("CONTRADICTORY_PROOF");
  });
  it("a suspicious timestamp yields weak proof and blocks", () => {
    const a = assessProof(clean({ timestampSuspicious: true }), "HIGH");
    expect(a.status).toBe("TIMESTAMP_SUSPICIOUS"); expect(a.strength).toBe("WEAK_PROOF"); expect(a.blocksVerification).toBe(true);
  });
  it("clean HIGH/CRITICAL proof still requires human review (AI/auto cannot certify alone)", () => {
    expect(assessProof(clean(), "HIGH").requiresHumanReview).toBe(true);
    expect(assessProof(clean({ multiSource: true }), "CRITICAL").requiresHumanReview).toBe(true);
  });
});

describe("[R11] offline integrity seal", () => {
  const base = (over: Partial<OfflineProofRecord> = {}): OfflineProofRecord => ({
    offlineCaptured: true, deviceCaptureAtMs: 1000, serverUploadAtMs: 2000, deviceOrSessionId: "dev1", submitterId: "s1",
    syncStatus: "SYNCED", realTimeLocationCaptured: true, claimsLocationMetadata: true, ...over,
  });
  it("synced offline proof with both timestamps can verify", () => {
    expect(assessOfflineProof(base()).canVerify).toBe(true);
  });
  it("a capture→upload gap beyond the window triggers TIMESTAMP_SUSPICIOUS (backdating block)", () => {
    const a = assessOfflineProof(base({ deviceCaptureAtMs: 0, serverUploadAtMs: 24 * 60 * 60 * 1000 }));
    expect(a.timestampSuspicious).toBe(true);
    expect(a.flags).toContain("TIMESTAMP_SUSPICIOUS");
    expect(a.canVerify).toBe(false);
  });
  it("offline proof cannot claim location metadata it never captured", () => {
    expect(assessOfflineProof(base({ realTimeLocationCaptured: false })).flags).toContain("offline_location_metadata_unfounded");
  });
  it("missing device/server timestamp is flagged", () => {
    expect(assessOfflineProof(base({ deviceCaptureAtMs: undefined })).flags).toContain("missing_device_capture_timestamp");
  });
  it("unsynced offline proof cannot verify a task", () => {
    expect(assessOfflineProof(base({ syncStatus: "UPLOAD_PENDING" })).canVerify).toBe(false);
  });
});
