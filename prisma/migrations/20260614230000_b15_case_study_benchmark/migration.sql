-- B15: Real-World Case-Study Benchmark Library

-- Case studies for benchmarking diagnosis accuracy
CREATE TABLE case_studies (
  id TEXT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,

  -- Business context
  industry VARCHAR(100) NOT NULL,
  business_model VARCHAR(100) NOT NULL,
  business_size VARCHAR(50) NOT NULL, -- startup|small|medium|large|enterprise
  year INTEGER NOT NULL,
  year_start INTEGER NOT NULL,
  year_end INTEGER NOT NULL,

  -- Case data (stored as JSON)
  symptoms JSONB NOT NULL, -- Array of symptoms
  available_data JSONB NOT NULL, -- Array of evidence

  -- Hidden vs expert causes (for blind testing)
  hidden_root_causes JSONB NOT NULL,
  hidden_causes_summary TEXT,
  expert_identified_causes JSONB NOT NULL,
  expert_causes_summary TEXT,

  -- Actions and outcomes
  actions_taken JSONB NOT NULL,
  actual_outcome JSONB NOT NULL,

  -- Source transparency (CRITICAL for compliance)
  sources JSONB NOT NULL, -- Array of sources
  license_or_allowed_use TEXT NOT NULL,

  -- Confidence metrics
  confidence DECIMAL(3,2) DEFAULT 0.7,
  data_completeness DECIMAL(3,2) DEFAULT 0.7,
  expert_validated BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CHECK (data_completeness >= 0.0 AND data_completeness <= 1.0),
  CHECK (business_size IN ('startup', 'small', 'medium', 'large', 'enterprise'))
);

-- Benchmark results: how diagnosis engine performed on cases
CREATE TABLE case_benchmark_results (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  diagnosis_id TEXT NOT NULL,

  -- What was identified
  identified_causes JSONB NOT NULL,
  confidence_scores JSONB NOT NULL,

  -- Scores
  accuracy_score DECIMAL(3,2) NOT NULL,
  precision_score DECIMAL(3,2) NOT NULL,
  recall_score DECIMAL(3,2) NOT NULL,

  -- Analysis
  performance_notes TEXT,
  false_positives TEXT[],
  false_negatives TEXT[],

  -- Timestamp
  tested_at TIMESTAMP DEFAULT now(),

  CHECK (accuracy_score >= 0.0 AND accuracy_score <= 1.0),
  CHECK (precision_score >= 0.0 AND precision_score <= 1.0),
  CHECK (recall_score >= 0.0 AND recall_score <= 1.0)
);

-- Indexes for fast querying and filtering
CREATE INDEX idx_case_studies_industry ON case_studies(industry);
CREATE INDEX idx_case_studies_business_size ON case_studies(business_size);
CREATE INDEX idx_case_studies_year ON case_studies(year);
CREATE INDEX idx_case_studies_confidence ON case_studies(confidence);
CREATE INDEX idx_case_benchmark_results_case ON case_benchmark_results(case_id);
CREATE INDEX idx_case_benchmark_results_diagnosis ON case_benchmark_results(diagnosis_id);
CREATE INDEX idx_case_benchmark_results_tested_at ON case_benchmark_results(tested_at);
