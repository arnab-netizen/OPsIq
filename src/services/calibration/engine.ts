export function calculateDeviation(
  predicted: number,
  actual: number
): number {
  if (predicted === 0) {
    return 1;
  }

  const deviation = Math.abs(predicted - actual) / Math.abs(predicted);

  return deviation;
}
