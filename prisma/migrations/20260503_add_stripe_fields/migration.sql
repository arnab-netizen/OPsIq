-- Add Stripe integration fields to billing system

-- Add stripe_customer_id to billing_accounts (optional, for Stripe customer reference)
ALTER TABLE billing_accounts ADD COLUMN stripe_customer_id TEXT;

-- Add stripe_price_id to plans (required for checkout sessions)
ALTER TABLE plans ADD COLUMN stripe_price_id TEXT;

-- Add stripe_subscription_id to subscriptions (for webhook reconciliation)
ALTER TABLE subscriptions ADD COLUMN stripe_subscription_id TEXT;

-- Create index on stripe_customer_id for efficient lookups
CREATE INDEX idx_billing_accounts_stripe_customer_id ON billing_accounts(stripe_customer_id);

-- Create index on stripe_subscription_id for webhook event matching
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
