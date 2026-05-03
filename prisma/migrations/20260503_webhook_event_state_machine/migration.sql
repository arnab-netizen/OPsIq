-- Add state machine columns to webhook_events table

-- Add status column with processing as default
ALTER TABLE webhook_events ADD COLUMN status TEXT NOT NULL DEFAULT 'processing';

-- Add attempts counter
ALTER TABLE webhook_events ADD COLUMN attempts INT NOT NULL DEFAULT 0;

-- Add last error message
ALTER TABLE webhook_events ADD COLUMN last_error TEXT;

-- Make processed_at optional (it's filled only after success)
ALTER TABLE webhook_events ALTER COLUMN processed_at DROP NOT NULL;

-- Add updated_at timestamp
ALTER TABLE webhook_events ADD COLUMN updated_at TIMESTAMP DEFAULT now();

-- Create index on status for efficient state machine queries
CREATE INDEX idx_webhook_events_status ON webhook_events(status);

-- Create composite index for processing queries (find failed/processing events)
CREATE INDEX idx_webhook_events_status_attempts ON webhook_events(status, attempts);
