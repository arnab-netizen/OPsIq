-- Final lock for webhook events: dead-letter state and replay protection

-- Add stripe_timestamp for replay protection (Unix epoch seconds)
ALTER TABLE webhook_events ADD COLUMN stripe_timestamp INT;

-- Create index for efficient timestamp checks
CREATE INDEX idx_webhook_events_stripe_timestamp ON webhook_events(stripe_timestamp);

-- Update status column comment to include dead_letter state
-- (Note: In PostgreSQL, we can't directly update comments through ALTER, but the schema reflects this)
