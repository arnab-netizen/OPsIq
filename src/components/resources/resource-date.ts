/**
 * "September 24, 2026" for a resource's YYYY-MM-DD date. Formatted in UTC so
 * the rendered day always equals the authored day, whatever the build
 * machine's timezone.
 */
export function formatResourceDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
