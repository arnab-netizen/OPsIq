/**
 * R10 — Attendance / presence confidence (§33). Pure.
 *
 * Attendance is confidence-based, not binary. Check-in ALONE never proves work was
 * performed — presence confidence is cross-checked against proof / supervisor / multi-
 * source signals. Predictive no-show is preventive only (never a disciplinary conclusion).
 */

import type { AttendanceStatus, PresenceConfidence } from "@/domain/remote-operations/remote-types";

export interface AttendanceInput {
  scheduled: boolean;
  preShiftAcknowledged: boolean;
  acknowledged: boolean;
  checkedIn: boolean;
  checkInLate: boolean;
  locationConfirmed: boolean;
  minutesSinceScheduledStart: number;
}

export function deriveAttendance(i: AttendanceInput): AttendanceStatus {
  if (i.checkedIn && i.checkInLate) return "CHECKED_IN_LATE";
  if (i.checkedIn && !i.locationConfirmed) return "CHECKED_IN_LOCATION_UNCONFIRMED";
  if (i.checkedIn) return "CHECKED_IN";
  if (i.minutesSinceScheduledStart >= 30) return "NO_SHOW_RISK";
  if (i.acknowledged) return "ACKNOWLEDGED";
  if (i.scheduled && !i.preShiftAcknowledged) return "ASSIGNED_NOT_ACKNOWLEDGED";
  return "SCHEDULED";
}

export interface PresenceSignals {
  checkedIn: boolean;
  proofTimeConsistent: boolean;
  supervisorConfirmed: boolean;
  customerConfirmed: boolean;
  multiSourceConsistent: boolean;
  disputed: boolean;
}

/** Check-in alone is weak; presence rises only with corroborating proof/supervisor/multi-source. */
export function presenceConfidence(s: PresenceSignals): PresenceConfidence {
  if (s.disputed) return "PRESENCE_DISPUTED";
  if (s.multiSourceConsistent && s.supervisorConfirmed) return "PRESENCE_SUPPORTED_BY_MULTI_SOURCE_PROOF";
  if (s.supervisorConfirmed) return "PRESENCE_SUPPORTED_BY_SUPERVISOR";
  if (s.proofTimeConsistent) return "PRESENCE_SUPPORTED_BY_TASK_PROOF";
  if (s.checkedIn) return "PRESENCE_CHECKED_IN_WEAK";
  return "PRESENCE_UNCONFIRMED";
}

/** Check-in alone does NOT verify that work was performed. */
export function checkInVerifiesWork(): boolean {
  return false;
}

export interface PredictiveNoShowInput {
  sampleSize: number;
  minSampleSize: number;
  noShowRiskScore: number;
  riskThreshold: number;
  preShiftAckReceived: boolean;
  minutesBeforeShift: number;
  isHighOrCritical: boolean;
}

export type PredictiveNoShowSignal = "NONE" | "SEND_PRE_SHIFT_REMINDER" | "ALERT_MANAGER";

/** Preventive predictive no-show signal (requires sufficient sample; never disciplinary). */
export function predictiveNoShow(i: PredictiveNoShowInput): PredictiveNoShowSignal {
  if (i.sampleSize < i.minSampleSize) return "NONE"; // sample gate — no predictive action below threshold
  if (i.noShowRiskScore <= i.riskThreshold) return "NONE";
  if (i.isHighOrCritical && !i.preShiftAckReceived && i.minutesBeforeShift <= 15) return "ALERT_MANAGER";
  if (!i.preShiftAckReceived && i.minutesBeforeShift <= 30) return "SEND_PRE_SHIFT_REMINDER";
  return "NONE";
}
