-- B16-S1: Public Dataset Test Harness — Deterministic Calculation Tests

-- Public datasets for testing
CREATE TABLE public_datasets (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  dataset_type VARCHAR(100) NOT NULL, -- retail|ecommerce|restaurant|saas|marketing|cashflow|inventory|financial_statement
  description TEXT NOT NULL,
  raw_data JSONB NOT NULL, -- Array of transaction/record objects
  source_url TEXT,
  license_type VARCHAR(100) NOT NULL,
  allowed_use TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Deterministic calculation tests
CREATE TABLE dataset_calculations (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES public_datasets(id) ON DELETE CASCADE,
  calculation_type VARCHAR(100) NOT NULL, -- revenue_sum|average_transaction|growth_rate|margin_percent|churn_rate|conversion_rate|inventory_turnover|cash_position
  description TEXT NOT NULL,

  -- Test definition
  input JSONB NOT NULL, -- { filters?: {...}, parameters?: {...} }
  expected_output JSONB NOT NULL, -- { value: number|string|boolean, tolerance?: number }

  -- Test result
  actual_output JSONB, -- { value: number|string|boolean, calculatedAt: Date }
  passed BOOLEAN,
  error_message TEXT,

  tested_at TIMESTAMP,
  execution_time_ms INTEGER
);

-- Calculation execution logs
CREATE TABLE calculation_logs (
  id TEXT PRIMARY KEY,
  calculation_id TEXT NOT NULL REFERENCES dataset_calculations(id) ON DELETE CASCADE,
  execution_time_ms INTEGER NOT NULL,
  memory_used_mb INTEGER,
  notes TEXT,
  recorded_at TIMESTAMP DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_public_datasets_type ON public_datasets(dataset_type);
CREATE INDEX idx_public_datasets_created ON public_datasets(created_at);
CREATE INDEX idx_dataset_calculations_dataset ON dataset_calculations(dataset_id);
CREATE INDEX idx_dataset_calculations_type ON dataset_calculations(calculation_type);
CREATE INDEX idx_dataset_calculations_passed ON dataset_calculations(passed);
CREATE INDEX idx_dataset_calculations_tested ON dataset_calculations(tested_at);
CREATE INDEX idx_calculation_logs_calculation ON calculation_logs(calculation_id);
CREATE INDEX idx_calculation_logs_recorded ON calculation_logs(recorded_at);
