import { z } from "zod/v4";
import { ValidationError } from "@/infra/errors";

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const formatted = z.prettifyError(result.error);
    throw new ValidationError("Validation failed", {
      errors: formatted,
      fieldErrors: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export async function parseRequestBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Invalid JSON in request body");
  }

  // Reject unknown fields for simple ZodObject schemas only.
  // Discriminated unions and other composite schemas handle unknown-field rejection
  // via parseOrThrow (Zod's own schema validation). Applying this guard to
  // non-ZodObject schemas produces schemaKeys=[] which falsely rejects all fields.
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    schema instanceof z.ZodObject
  ) {
    const schemaKeys = Object.keys(schema.shape);
    const bodyKeys = Object.keys(body as Record<string, unknown>);
    const unknownKeys = bodyKeys.filter((key) => !schemaKeys.includes(key));
    if (unknownKeys.length > 0) {
      throw new ValidationError("Unknown fields in request body", {
        unknownFields: unknownKeys,
        fieldErrors: unknownKeys.map((key) => ({ path: key, message: "Unknown field" })),
      });
    }
  }

  return parseOrThrow(schema, body);
}

export const uuidSchema = z.string().uuid();

// Canonical identity-email schema. `User.email` carries only a plain,
// case-sensitive `@unique` constraint in the schema (no functional
// `lower(email)` index) — Postgres therefore treats "Test@Example.com" and
// "test@example.com" as two distinct rows. Application-layer normalization
// is the sole guarantee against case-variant (or whitespace-padded)
// duplicate identities, so every route that creates, updates, or looks up a
// User by email MUST validate the field through this schema — never a bare
// `z.email()`. Trim + lowercase run BEFORE the email-format check (via
// `.pipe`), so a padded address like " test@example.com " is normalized and
// accepted as the same identity rather than rejected outright, and the
// value the handler receives downstream is always the canonical form that
// is safe to persist or query.
export const identityEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Invalid email address"));

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const sortSchema = z.object({
  sortBy: z.string().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export function parseSearchParams<T>(
  url: string,
  schema: z.ZodType<T>
): T {
  const searchParams = new URL(url).searchParams;
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return parseOrThrow(schema, params);
}
