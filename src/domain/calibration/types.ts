export type CalibrationRecord = {
  id: string;

  operatorItemId: string;

  predictedImpact: number;
  actualImpact: number;

  confidence: number;

  deviation: number;

  createdAt: string;
};

export type CalibrationSummary = {
  totalRecords: number;
  avgDeviation: number;
  accuracyScore: number;
};
