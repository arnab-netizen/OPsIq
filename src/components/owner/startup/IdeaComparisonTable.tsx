"use client";

interface Props {
  ideas: Record<string, unknown>[];
  recommendedId?: string | null;
}

export function IdeaComparisonTable({ ideas, recommendedId }: Props) {
  if (ideas.length < 2) return null;
  return (
    <div className="idea-comparison-table overflow-x-auto mt-4">
      <p className="text-sm font-semibold mb-2">Idea Comparison</p>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-3">Idea</th>
            <th className="py-1 pr-3">Screening</th>
            <th className="py-1 pr-3">Economic Class</th>
            <th className="py-1">Readiness</th>
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea) => {
            const id = idea.id as string;
            const isRecommended = id === recommendedId;
            const readiness = (idea.readinessAssessments as Record<string, unknown>[] | undefined)?.[0];
            const econ = idea.economicModel as Record<string, unknown> | undefined;
            return (
              <tr key={id} className={`border-b ${isRecommended ? "bg-success/10 VALIDATED font-semibold" : ""}`}>
                <td className="py-1.5 pr-3">
                  {idea.name as string}
                  {isRecommended && <span className="ml-1 badge badge-success text-xs SYSTEM_RECOMMENDATION">Recommended</span>}
                </td>
                <td className="py-1.5 pr-3">{idea.screeningStatus as string ?? "—"}</td>
                <td className="py-1.5 pr-3">{econ?.economicClassification as string ?? "—"}</td>
                <td className="py-1.5">{readiness?.readinessStatus as string ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
