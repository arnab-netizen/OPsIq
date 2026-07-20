"use client";

/**
 * Execution blueprint panel — shows business objective and process tasks.
 * No business logic.
 */
interface ProcessTask {
  id: string;
  taskKey: string;
  sourceFamily: string;
  executionRoute: string;
  actionOwner: string;
  approvalLevel: string;
}

interface Props {
  blueprint: Record<string, unknown>;
}

export function ExecutionBlueprintPanel({ blueprint }: Props) {
  const tasks = (blueprint.processExecutionTasks as ProcessTask[] | undefined) ?? [];
  const title = blueprint.title as string | undefined;
  const status = blueprint.status as string | undefined;

  return (
    <div className="execution-blueprint-panel border rounded p-4 mt-6 VALIDATED">
      <div className="flex items-center gap-2 mb-3">
        <p className="font-semibold">Execution Blueprint</p>
        {status && <span className="badge badge-success text-xs VALIDATED">{status}</span>}
      </div>

      {title && <p className="text-sm font-medium mb-3">{title}</p>}

      {tasks.length > 0 && (
        <div className="tasks-table overflow-x-auto">
          <p className="text-xs font-medium mb-2">Process Tasks ({tasks.length})</p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 pr-3">Task</th>
                <th className="py-1 pr-3">Route</th>
                <th className="py-1 pr-3">Owner</th>
                <th className="py-1">Approval</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/30">
                  <td className="py-1.5 pr-3 font-medium">{t.taskKey}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{t.executionRoute}</td>
                  <td className="py-1.5 pr-3">{t.actionOwner}</td>
                  <td className="py-1.5">
                    <span className={`badge badge-outline text-xs ${t.approvalLevel === "AUTO_ALLOWED" ? "VALIDATED" : "BINDING_CONSTRAINT"}`}>
                      {t.approvalLevel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
