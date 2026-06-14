-- B13: External Systems Connector Layer — OAuth Token Lifecycle & Sync Management

-- OAuth connections for workspace integrations
CREATE TABLE external_connections (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES external_providers(id) ON DELETE RESTRICT,
  connection_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active', -- active|revoked|expired|error
  last_sync_at TIMESTAMP,
  last_error_at TIMESTAMP,
  last_error_message TEXT,
  oauth_scope TEXT[] DEFAULT ARRAY[]::TEXT[],
  disconnect_token TEXT, -- Optional token for disconnect flow
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  UNIQUE(workspace_id, provider_id),
  CHECK (status IN ('active', 'revoked', 'expired', 'error'))
);

-- Encrypted OAuth tokens (access and refresh tokens)
CREATE TABLE external_oauth_tokens (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL UNIQUE REFERENCES external_connections(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL, -- encrypted at rest
  refresh_token TEXT, -- encrypted at rest, optional
  expires_at TIMESTAMP,
  token_type VARCHAR(20) DEFAULT 'Bearer',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Connection consent audit trail
CREATE TABLE external_connection_consents (
  id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  consented_at TIMESTAMP DEFAULT now(),
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- Sync job tracking for import operations
CREATE TABLE external_sync_jobs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending', -- pending|running|completed|failed
  records_imported INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),

  CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- Indexes for fast querying
CREATE INDEX idx_external_connections_workspace ON external_connections(workspace_id);
CREATE INDEX idx_external_connections_status ON external_connections(status);
CREATE INDEX idx_external_connections_provider ON external_connections(provider_id);
CREATE INDEX idx_external_oauth_tokens_connection ON external_oauth_tokens(connection_id);
CREATE INDEX idx_external_connection_consents_workspace ON external_connection_consents(workspace_id);
CREATE INDEX idx_external_connection_consents_connection ON external_connection_consents(connection_id);
CREATE INDEX idx_external_sync_jobs_connection ON external_sync_jobs(connection_id);
CREATE INDEX idx_external_sync_jobs_status ON external_sync_jobs(status);
