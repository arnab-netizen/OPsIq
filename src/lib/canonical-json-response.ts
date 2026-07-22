/**
 * CANONICAL JSON RESPONSE ENVELOPE
 *
 * Allows wrapped handlers to specify custom HTTP status codes and safe headers
 * without returning Response/NextResponse objects.
 *
 * Usage in wrapped handlers:
 * ```typescript
 * export const POST = withCanonicalEnforcement(
 *   async (ctx) => {
 *     const result = await createResource(...);
 *     return canonicalJson(result, { status: 201 });
 *   }
 * );
 * ```
 *
 * The wrapper detects this branded object and:
 * 1. Extracts the body
 * 2. Sets the HTTP status code
 * 3. Applies safe headers if specified
 * 4. Returns the NextResponse
 *
 * SECURITY:
 * - Set-Cookie is explicitly blocked (use session middleware instead)
 * - Redirect responses use errors instead (handler throws error)
 * - Streaming/file responses use errors instead (handler throws error)
 * - Headers are allowlisted
 */

/**
 * Branded type for canonical JSON response envelope.
 *
 * Prevents accidental confusion with plain objects.
 * The __canonicalJsonResponse property is the unique marker.
 */
export interface CanonicalJsonResponse {
  readonly __canonicalJsonResponse: true;
  readonly body: any;
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Type guard to check if a value is a canonical JSON response envelope.
 *
 * Uses structural typing to detect the brand across module boundaries.
 */
export function isCanonicalJsonResponse(value: unknown): value is CanonicalJsonResponse {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const obj = value as any;

  // Check for the brand marker
  if (obj.__canonicalJsonResponse !== true) {
    return false;
  }

  // Validate required properties exist
  if (!("body" in obj) || !("status" in obj)) {
    return false;
  }

  // Validate status is a number
  if (typeof obj.status !== "number" || obj.status < 100 || obj.status > 599) {
    return false;
  }

  // Validate headers if present
  if ("headers" in obj && obj.headers !== undefined) {
    if (typeof obj.headers !== "object" || obj.headers === null) {
      return false;
    }
    // All header values must be strings
    for (const [_key, value] of Object.entries(obj.headers)) {
      if (typeof value !== "string") {
        return false;
      }
    }
  }

  return true;
}

/**
 * ALLOWLISTED HEADERS
 *
 * Only these headers can be set via canonicalJson.
 * Set-Cookie is explicitly blocked (use session middleware instead).
 * Custom headers must be explicitly allowlisted.
 */
const ALLOWLISTED_HEADERS = new Set([
  "x-custom-header", // Example: for versioning responses
  "cache-control", // Cache directives (safe, no auth data)
  "etag", // Entity tags (safe, computed)
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "retry-after", // Rate limiting: when to retry after 429
]);

/**
 * Create a canonical JSON response with custom status and optional safe headers.
 *
 * @param body - JSON-serializable response body
 * @param options - Status code and optional headers
 * @returns Branded envelope that the wrapper will recognize and convert to NextResponse
 *
 * @throws TypeError if status is invalid
 * @throws TypeError if headers contain Set-Cookie or other unsafe headers
 * @throws TypeError if headers contain non-string values
 *
 * Example:
 * ```typescript
 * // Created response
 * return canonicalJson(newUser, { status: 201 });
 *
 * // Cached/idempotent response
 * return canonicalJson(cachedResult, { status: 200 });
 *
 * // With safe headers
 * return canonicalJson(data, {
 *   status: 200,
 *   headers: { "cache-control": "max-age=3600" }
 * });
 * ```
 */
export function canonicalJson(
  body: any,
  options: {
    status: number;
    headers?: Record<string, string>;
  }
): CanonicalJsonResponse {
  const { status, headers } = options;

  // Validate status code
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new TypeError(`Invalid HTTP status code: ${status}. Must be integer between 100-599.`);
  }

  // Validate headers if provided
  if (headers) {
    // Check for forbidden headers
    for (const headerName of Object.keys(headers)) {
      const lowerName = headerName.toLowerCase();

      // Explicitly block Set-Cookie (use session middleware instead)
      if (lowerName === "set-cookie") {
        throw new TypeError(
          "Set-Cookie header cannot be set via canonicalJson. Use session middleware for authentication cookies."
        );
      }

      // Explicitly block sensitive headers
      if (lowerName === "authorization" || lowerName === "proxy-authorization") {
        throw new TypeError(`Unsafe header '${headerName}' cannot be set via canonicalJson.`);
      }

      // Ensure header is allowlisted
      if (!ALLOWLISTED_HEADERS.has(lowerName)) {
        throw new TypeError(
          `Header '${headerName}' not allowlisted. Allowlisted headers: ${Array.from(ALLOWLISTED_HEADERS).join(", ")}`
        );
      }

      // Validate header value is string
      const value = headers[headerName];
      if (typeof value !== "string") {
        throw new TypeError(`Header '${headerName}' value must be string, got ${typeof value}`);
      }
    }
  }

  return {
    __canonicalJsonResponse: true,
    body,
    status,
    headers: headers ? Object.freeze(headers) : undefined,
  };
}

/**
 * CANONICAL JSON SERIALIZER
 *
 * Single canonical implementation for serializing route response bodies to JSON.
 *
 * Contract:
 * - BigInt values are converted to decimal strings (e.g. 9007199254740993n → "9007199254740993").
 *   This preserves precision above Number.MAX_SAFE_INTEGER which JS number cannot represent.
 * - All other JSON-serializable types are unchanged: string, number, boolean, null, Date, Array, object.
 * - undefined fields are dropped (standard JSON.stringify behaviour).
 * - Circular references throw TypeError (standard JSON.stringify behaviour — not hidden).
 * - The source value is not mutated.
 *
 * Wire contract for BigInt fields: decimal string.
 * Clients must not coerce these strings to JS number without a BigInt or Decimal library
 * when the value may exceed Number.MAX_SAFE_INTEGER (9007199254740991).
 */
export function stringifyRouteResponse(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item
  );
}
