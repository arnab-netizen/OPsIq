/**
 * Public commercial copy inputs. The sellable price is an OWNER decision (PRICING_DECISION_REQUIRED):
 * until it is governed and set here, the public pricing page says paid plans are not open yet and
 * invents no number. The same amount must be configured on the Paddle price.
 */
export const PUBLIC_PLAN_NAME = "OpsIQ Pro";

/** e.g. "US$__ per month" once approved. null ⇒ pricing page states the price is not yet announced. */
export const PUBLIC_PRICE_DISPLAY: string | null = null;

/** Days the owner stays on paid access after a missed renewal while Paddle retries (see resolveAccess). */
export const PUBLIC_GRACE_DAYS_COPY = 7;
