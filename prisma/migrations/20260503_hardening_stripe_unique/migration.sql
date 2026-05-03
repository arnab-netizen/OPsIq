-- Enforce stripeCustomerId uniqueness for fail-closed mapping

-- Create unique constraint on stripe_customer_id
ALTER TABLE billing_accounts ADD CONSTRAINT uk_stripe_customer_id UNIQUE (stripe_customer_id);

-- Remove old index since unique constraint provides the index
DROP INDEX IF EXISTS idx_billing_accounts_stripe_customer_id;
