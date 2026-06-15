-- B14: Browser-Assisted Import (Restricted Fallback)

-- Browser import session tracking
CREATE TABLE browser_import_sessions (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES external_providers(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'active', -- active|completed|failed|abandoned
  started_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP,
  failure_reason TEXT,
  user_agent TEXT NOT NULL,
  ip_address VARCHAR(45) NOT NULL,

  CHECK (status IN ('active', 'completed', 'failed', 'abandoned'))
);

-- Session events audit trail
CREATE TABLE browser_import_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES browser_import_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- session_started|instruction_shown|data_extracted|export_uploaded|error_encountered|session_completed
  description TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT now()
);

-- Extracted tables (marked as DRAFT until owner approval)
CREATE TABLE browser_extracted_tables (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES browser_import_sessions(id) ON DELETE CASCADE,
  table_name VARCHAR(255) NOT NULL,
  column_headers TEXT[] NOT NULL,
  data_rows JSONB NOT NULL, -- Array of objects
  extraction_method VARCHAR(50) NOT NULL, -- manual_copy|file_export|screenshot
  confidence DECIMAL(3,2) DEFAULT 0.7, -- User's confidence 0.0-1.0
  status VARCHAR(50) DEFAULT 'draft', -- draft|approved|rejected
  record_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  approved_at TIMESTAMP,
  approved_by TEXT,
  rejection_reason TEXT,

  CHECK (status IN ('draft', 'approved', 'rejected')),
  CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

-- User consent tracking (REQUIRED: no credentials stored)
CREATE TABLE browser_import_consents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES browser_import_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  statement_accepted BOOLEAN NOT NULL,
  statement TEXT NOT NULL,
  accepted_at TIMESTAMP DEFAULT now(),
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT NOT NULL
);

-- Indexes for fast querying and compliance
CREATE INDEX idx_browser_import_sessions_workspace ON browser_import_sessions(workspace_id);
CREATE INDEX idx_browser_import_sessions_status ON browser_import_sessions(status);
CREATE INDEX idx_browser_import_sessions_started_at ON browser_import_sessions(started_at);
CREATE INDEX idx_browser_import_events_session ON browser_import_events(session_id);
CREATE INDEX idx_browser_import_events_event_type ON browser_import_events(event_type);
CREATE INDEX idx_browser_import_events_timestamp ON browser_import_events(timestamp);
CREATE INDEX idx_browser_extracted_tables_session ON browser_extracted_tables(session_id);
CREATE INDEX idx_browser_extracted_tables_status ON browser_extracted_tables(status);
CREATE INDEX idx_browser_extracted_tables_created ON browser_extracted_tables(created_at);
CREATE INDEX idx_browser_import_consents_workspace ON browser_import_consents(workspace_id);
CREATE INDEX idx_browser_import_consents_session ON browser_import_consents(session_id);
