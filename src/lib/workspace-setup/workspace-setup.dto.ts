export type WorkspaceSetupState =
  | "NO_WORKSPACE"
  | "WORKSPACE_EXISTS"
  | "BUSINESS_BASICS_MISSING"
  | "OWNER_CONSTRAINTS_MISSING"
  | "FINANCIAL_BASICS_MISSING"
  | "CAPACITY_BASICS_MISSING"
  | "CUSTOMER_BASICS_MISSING"
  | "MINIMUM_SETUP_COMPLETE"
  | "FIRST_VALUE_READY"
  | "NEED_MORE_DATA"
  | "CANNOT_DETERMINE";

export type WorkspaceMode = "LIVE" | "DEMO";

export interface WorkspaceSetupBusinessBasics {
  businessName?: string;
  industryCategory?: string;
  operatingLocationMarket?: string;
  revenueModel?: string;
}

export interface WorkspaceSetupOwnerConstraints {
  ownerTimeConstraint?: string;
  primaryOwnerRole?: string;
  executionCapability?: string;
}

export interface WorkspaceSetupFinancialBasics {
  monthlyRevenueEstimate?: string;
  monthlyRevenueRange?: {
    min?: number;
    max?: number;
  };
  monthlyCostEstimate?: string;
  monthlyCostRange?: {
    min?: number;
    max?: number;
  };
}

export interface WorkspaceSetupCapacityBasics {
  teamSizeCapacity?: string;
  keyConstraints?: string[];
}

export interface WorkspaceSetupCustomerBasics {
  customerSegment?: string;
  mainCurrentProblem?: string;
  customerCount?: string;
}

export interface WorkspaceSetupInputDTO {
  businessBasics?: WorkspaceSetupBusinessBasics;
  ownerConstraints?: WorkspaceSetupOwnerConstraints;
  financialBasics?: WorkspaceSetupFinancialBasics;
  capacityBasics?: WorkspaceSetupCapacityBasics;
  customerBasics?: WorkspaceSetupCustomerBasics;
}

export interface WorkspaceSetupMissingDataDTO {
  businessName: boolean;
  industryCategory: boolean;
  operatingLocationMarket: boolean;
  revenueModel: boolean;
  monthlyRevenueEstimate: boolean;
  monthlyCostEstimate: boolean;
  teamSizeCapacity: boolean;
  customerSegment: boolean;
  mainCurrentProblem: boolean;
  ownerTimeConstraint: boolean;
}

export interface WorkspaceSetupProgressDTO {
  totalRequiredFields: number;
  completedFields: number;
  progressPercent: number;
  completedSections: string[];
  incompleteSections: string[];
}

export interface WorkspaceSetupStateDTO {
  workspaceId: string;
  setupState: WorkspaceSetupState;
  workspaceMode: WorkspaceMode;
  businessBasics: WorkspaceSetupBusinessBasics;
  ownerConstraints: WorkspaceSetupOwnerConstraints;
  financialBasics: WorkspaceSetupFinancialBasics;
  capacityBasics: WorkspaceSetupCapacityBasics;
  customerBasics: WorkspaceSetupCustomerBasics;
  progress: WorkspaceSetupProgressDTO;
  missingData: WorkspaceSetupMissingDataDTO;
  firstValueReady: boolean;
  nextStep: string;
  safetyWarnings: string[];
  generatedAt: string;
}

export interface WorkspaceSetupResultDTO {
  success: boolean;
  workspaceId: string;
  setupState: WorkspaceSetupState;
  missingData?: WorkspaceSetupMissingDataDTO;
  progressPercent?: number;
  firstValueReady?: boolean;
  nextStep?: string;
}

export interface WorkspaceSetupExportDTO {
  exportType: "WORKSPACE_SETUP_PROOF_PACKET";
  workspaceId: string;
  workspaceName: string;
  workspaceMode: WorkspaceMode;
  generatedAt: string;
  generatedBy?: string;
  expiresAt: string;
  setupState: WorkspaceSetupState;
  businessBasics: WorkspaceSetupBusinessBasics;
  ownerConstraints: WorkspaceSetupOwnerConstraints;
  financialBasics: WorkspaceSetupFinancialBasics;
  capacityBasics: WorkspaceSetupCapacityBasics;
  customerBasics: WorkspaceSetupCustomerBasics;
  progress: WorkspaceSetupProgressDTO;
  missingData: WorkspaceSetupMissingDataDTO;
  firstValueReady: boolean;
  nextStep: string;
  safetyWarnings: string[];
  documentVersion: string;
}
