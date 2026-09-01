import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  /**
   * Richer empty-state content (e.g. a primitives-layer `<EmptyState />` with a
   * title/description/CTA, or a true/filtered-empty distinction) rendered in
   * place of the default bare-text row when `data` is empty. Optional and
   * purely additive — every existing caller that only passes `emptyMessage`
   * keeps its current bare-text row unchanged. The base `Table` primitive
   * deliberately does not hardcode any CTA copy itself (e.g. "Create X") —
   * that stays the caller's responsibility so this stays safe for generic,
   * filtered, read-only, and admin tables alike.
   */
  emptyState?: ReactNode;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data available",
  emptyState,
}: TableProps<T>) {
  if (data.length === 0) {
    if (emptyState) {
      return <>{emptyState}</>;
    }
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-muted/30 py-12">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left font-medium text-muted-foreground ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={keyExtractor(row)}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
