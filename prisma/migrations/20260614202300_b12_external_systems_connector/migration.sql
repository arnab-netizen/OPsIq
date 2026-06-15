-- B12: External Systems Connector Layer — Export Imports Schema

-- External provider registry
CREATE TABLE external_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL, -- e.g., "HubSpot", "Salesforce", "Zoho CRM", "QuickBooks"
  category VARCHAR(50) NOT NULL, -- e.g., "CRM", "accounting", "POS", "ads"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Import templates per provider
CREATE TABLE external_import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES external_providers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  description TEXT,
  expected_columns TEXT[] NOT NULL, -- CSV header columns expected
  required_columns TEXT[] NOT NULL, -- Must be present
  field_mappings JSONB NOT NULL, -- { "csv_column": { "target_field": "...", "type": "..." } }
  is_template BOOLEAN DEFAULT true, -- true = template, false = instance
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Raw imported records (before fact transformation)
CREATE TABLE external_raw_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  engagement_id UUID NOT NULL,
  provider_id UUID NOT NULL REFERENCES external_providers(id),
  template_id UUID NOT NULL REFERENCES external_import_templates(id),
  raw_data JSONB NOT NULL, -- Original record from CSV/import
  parsed_data JSONB, -- After parsing/normalization
  fact_id VARCHAR(255), -- Links to business fact after processing
  status VARCHAR(50) DEFAULT 'pending', -- pending|processed|failed|approved
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Field mappings for provider exports
CREATE TABLE external_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES external_import_templates(id) ON DELETE CASCADE,
  source_field VARCHAR(255) NOT NULL, -- Field from provider export
  target_field VARCHAR(255) NOT NULL, -- Field in business fact contract
  transformation_rule JSONB, -- e.g., { "type": "multiply", "factor": 1000 }
  confidence DECIMAL(3,2) DEFAULT 0.8,
  created_at TIMESTAMP DEFAULT now()
);

-- Data lineage tracking (source → processed → fact)
CREATE TABLE external_data_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  source_record_id UUID NOT NULL REFERENCES external_raw_records(id) ON DELETE CASCADE,
  processed_record_id UUID,
  fact_id VARCHAR(255),
  lineage_chain TEXT[], -- ["import:provider_id", "normalize:rule_id", "map:template_id"]
  created_at TIMESTAMP DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX idx_external_providers_active ON external_providers(is_active);
CREATE INDEX idx_external_import_templates_workspace ON external_import_templates(workspace_id);
CREATE INDEX idx_external_import_templates_provider ON external_import_templates(provider_id);
CREATE INDEX idx_external_raw_records_workspace ON external_raw_records(workspace_id);
CREATE INDEX idx_external_raw_records_engagement ON external_raw_records(engagement_id);
CREATE INDEX idx_external_raw_records_provider ON external_raw_records(provider_id);
CREATE INDEX idx_external_raw_records_status ON external_raw_records(status);
CREATE INDEX idx_external_raw_records_fact ON external_raw_records(fact_id);
CREATE INDEX idx_external_field_mappings_template ON external_field_mappings(template_id);
CREATE INDEX idx_external_data_lineage_workspace ON external_data_lineage(workspace_id);
CREATE INDEX idx_external_data_lineage_source ON external_data_lineage(source_record_id);
CREATE INDEX idx_external_data_lineage_fact ON external_data_lineage(fact_id);
