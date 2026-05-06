export enum ExecutionOutcome {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
  CANCELLED = "CANCELLED",
}

export interface ExecutionAuditEvent {
  event_id: string;
  action_id: string;
  decision_id: string;
  workspace_id: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  actor: string; // UUID or "system"
  outcome: ExecutionOutcome;
  timestamp: Date;
  tags: string[];
  error_message?: string;
}

export interface AuditEventInput {
  action_id: string;
  decision_id: string;
  workspace_id: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  actor: string;
  outcome: ExecutionOutcome;
  error_message?: string;
  tags?: string[];
}

export interface AuditEventFilter {
  action_id?: string;
  decision_id?: string;
  workspace_id?: string;
  start_time?: Date;
  end_time?: Date;
  outcome?: ExecutionOutcome;
  tags?: string[];
  actor?: string;
}

export interface AuditEventQuery {
  filters: AuditEventFilter;
  limit?: number;
  offset?: number;
}

export interface AuditEventQueryResult {
  events: ExecutionAuditEvent[];
  total_count: number;
  returned_count: number;
}
