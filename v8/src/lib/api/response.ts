import { NextResponse } from "next/server";
import { isAppError, toAppError } from "@/lib/errors/app-error";

export interface ApiMeta {
  requestId?: string;
  correlationId?: string;
  warnings?: string[];
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ApiMeta;
}

export function apiSuccess<T>(data: T, meta: ApiMeta = {}, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data, meta }, { status });
}

export function apiFailure(error: unknown, meta: ApiMeta = {}): NextResponse<ApiFailure> {
  const normalized = toAppError(error);
  const body: ApiFailure = {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
    meta,
  };
  return NextResponse.json(body, { status: isAppError(error) ? normalized.status : 500 });
}
