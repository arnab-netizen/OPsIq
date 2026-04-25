import { NextRequest, NextResponse } from "next/server";
import { ValidationError } from "@/infra/errors";

export function requireIdempotencyKey(request: NextRequest, method: string): string {
  if (method !== "POST") {
    return "";
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    throw new ValidationError("Idempotency-Key header is required for POST requests");
  }

  if (!/^[a-z0-9\-_]{1,255}$/i.test(idempotencyKey)) {
    throw new ValidationError("Idempotency-Key must be alphanumeric with hyphens and underscores, max 255 chars");
  }

  return idempotencyKey;
}
