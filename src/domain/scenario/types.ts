export type ScenarioInput = {
  baseRevenue: number;
  baseCost: number;

  deltaRevenue: number;
  deltaCost: number;
};

export type ScenarioResult = {
  impactExpected: number;
  impactLow: number;
  impactHigh: number;
};
