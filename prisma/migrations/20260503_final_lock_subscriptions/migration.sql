-- Add ordering enforcement to subscriptions

-- Add last_event_timestamp to track when last webhook updated this subscription
ALTER TABLE subscriptions ADD COLUMN last_event_timestamp TIMESTAMP;

-- Create index for efficient ordering checks
CREATE INDEX idx_subscriptions_last_event_timestamp ON subscriptions(last_event_timestamp);
