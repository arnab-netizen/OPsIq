import { AuditRecord } from "@/domain/audit/types";

export function logDecision(record: AuditRecord): void {
  console.log(JSON.stringify(record));
}
