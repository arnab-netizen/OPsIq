export function parseCSV(input: string): Record<string, string>[] {
  if (!input || input.trim().length === 0) {
    throw new Error("CSV input cannot be empty");
  }

  const lines = input.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const record: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] || "";
    }

    records.push(record);
  }

  return records;
}
