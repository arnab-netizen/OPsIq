/**
 * Client instrumentation (runs in the browser).
 *
 * Initialises observability for the client runtime. Fail-open: with no
 * NEXT_PUBLIC_SENTRY_DSN configured this is a no-op and the app is unaffected.
 */
import { initObservability } from "@/infra/observability";

void initObservability("client");
