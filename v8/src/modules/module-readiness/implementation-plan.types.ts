export type ModuleImplementationPhase =
  | 'contract_present'
  | 'schema_designed'
  | 'repository_implemented'
  | 'service_implemented'
  | 'routes_wired'
  | 'ui_wired'
  | 'tests_green'
  | 'production_enabled';

export type ModuleRuntimeExposure = 'none' | 'internal_only' | 'api_beta' | 'production';

export interface ModuleImplementationPlan {
  readonly moduleKey: string;
  readonly packNumber: number;
  readonly moduleName: string;
  readonly objective: string;
  readonly dependencies: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly recommendedDataModels: readonly string[];
  readonly featureFlags: readonly string[];
  readonly permissionKeys: readonly string[];
  readonly enterpriseGates: readonly string[];
  readonly implementationPhases: readonly ModuleImplementationPhase[];
  readonly runtimeExposure: ModuleRuntimeExposure;
}

export interface ModuleImplementationEvidence {
  readonly moduleKey: string;
  readonly phase: ModuleImplementationPhase;
  readonly evidenceType: 'test' | 'migration' | 'route' | 'service' | 'repository' | 'security_review' | 'manual_review' | 'runtime_check';
  readonly evidenceRef: string;
  readonly recordedAt: string;
  readonly recordedBy: string;
}
