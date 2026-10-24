/**
 * Relational check shared by write schemas that take a start and an end: an end before its start is a contradiction, refused
 * on the END field (the one to change). An absent or unparseable side is not judged here (its own field rule does that).
 */
import type { z } from "zod/v4";

export function endNotBeforeStart(startKey: string, endKey: string, message = "End must be on or after the start") {
  return (value: Record<string, unknown>, ctx: z.RefinementCtx): void => {
    const s = value[startKey];
    const e = value[endKey];
    if (s === undefined || s === null || e === undefined || e === null) return;
    const start = new Date(s as string | number | Date).getTime();
    const end = new Date(e as string | number | Date).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return;
    if (end < start) ctx.addIssue({ code: "custom", message, path: [endKey] });
  };
}
