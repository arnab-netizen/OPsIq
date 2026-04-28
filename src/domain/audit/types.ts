export interface AuditRecord {
  id: string;
  timestamp: string;
  inputSnapshot: string;
  outputSnapshot: string;
  ruleId: string;
}
