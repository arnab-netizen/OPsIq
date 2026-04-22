import { Badge } from "@/ui/primitives";

export interface InterventionState {
  mode: string;
  phase: string;
}

const MODE_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  recovery: "destructive",
  stabilization: "warning",
  growth: "success",
  shock_response: "destructive",
  mixed: "muted",
};

const PHASE_VARIANTS: Record<string, "default" | "success" | "warning" | "destructive" | "muted"> = {
  triage: "warning",
  stabilize: "warning",
  repair: "muted",
  strengthen: "default",
  grow: "success",
  protect: "default",
};

export function InterventionStateDisplay({ mode, phase }: InterventionState) {
  if (!mode || !phase) {
    return (
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Intervention State</p>
        <p className="mt-2 text-sm text-muted-foreground">Not yet set</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">Intervention State</p>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <Badge variant={MODE_VARIANTS[mode] ?? "muted"}>
            {mode.replace("_", " ")}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Phase:</span>
          <Badge variant={PHASE_VARIANTS[phase] ?? "muted"}>
            {phase.replace("_", " ")}
          </Badge>
        </div>
      </div>
    </div>
  );
}
