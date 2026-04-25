import { z } from "zod/v4";
import { ValidationError } from "@/infra/errors";

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const formatted = z.prettifyError(result.error);
    throw new ValidationError("Validation failed", {
      errors: formatted,
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

  // Reject unknown fields for object schemas
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const schemaKeys = schema instanceof z.ZodObject ? Object.keys(schema.shape) : [];
    const bodyKeys = Object.keys(body as Record<string, unknown>);
    const unknownKeys = bodyKeys.filter((key) => !schemaKeys.includes(key));
    if (unknownKeys.length > 0) {
      throw new ValidationError("Unknown fields in request body", {
        unknownFields: unknownKeys,
      });
    }
  }

  return parseOrThrow(schema, body);
}

export const uuidSchema = z.string().uuid();

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
