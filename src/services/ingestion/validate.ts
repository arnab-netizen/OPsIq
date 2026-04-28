export function validateRows(
  rows: Record<string, string>[]
): {
  score: number;
  issues: string[];
} {
  const issues: string[] = [];

  if (rows.length === 0) {
    issues.push("No rows provided");
    throw new Error("LOW_DATA_QUALITY");
  }

  let totalValues = 0;
  let missingValues = 0;
  let emptyRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values = Object.values(row);
    totalValues += values.length;

    const nonEmptyValues = values.filter((v) => v && v.trim() !== "");
    if (nonEmptyValues.length === 0) {
      emptyRows++;
      issues.push(`Row ${i} is empty`);
    } else {
      missingValues += values.length - nonEmptyValues.length;
    }
  }

  const missingPenalty = totalValues > 0 ? missingValues / totalValues : 0;
  const emptyPenalty = emptyRows / rows.length;
  const score = Math.max(0, Math.min(1, 1 - missingPenalty - emptyPenalty));

  if (score < 0.5) {
    throw new Error("LOW_DATA_QUALITY");
  }

  return { score, issues };
}
