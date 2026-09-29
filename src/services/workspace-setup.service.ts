/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import { requireServiceContext } from "@/lib/service-auth";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import {
  type WorkspaceSetupStateDTO,
  type WorkspaceSetupInputDTO,
  type WorkspaceSetupMissingDataDTO,
  type WorkspaceSetupProgressDTO,
  type WorkspaceSetupResultDTO,
} from "@/lib/workspace-setup/workspace-setup.dto";

function computeMissingData(input: WorkspaceSetupInputDTO): WorkspaceSetupMissingDataDTO {
  return {
    businessName: !input.businessBasics?.businessName,
    industryCategory: !input.businessBasics?.industryCategory,
    operatingLocationMarket: !input.businessBasics?.operatingLocationMarket,
    revenueModel: !input.businessBasics?.revenueModel,
    monthlyRevenueEstimate:
      !input.financialBasics?.monthlyRevenueEstimate &&
      (!input.financialBasics?.monthlyRevenueRange?.min ||
        !input.financialBasics?.monthlyRevenueRange?.max),
    monthlyCostEstimate:
      !input.financialBasics?.monthlyCostEstimate &&
      (!input.financialBasics?.monthlyCostRange?.min ||
        !input.financialBasics?.monthlyCostRange?.max),
    teamSizeCapacity: !input.capacityBasics?.teamSizeCapacity,
    customerSegment: !input.customerBasics?.customerSegment,
    mainCurrentProblem: !input.customerBasics?.mainCurrentProblem,
    ownerTimeConstraint: !input.ownerConstraints?.ownerTimeConstraint,
  };
}

function computeProgress(
  missingData: WorkspaceSetupMissingDataDTO
): WorkspaceSetupProgressDTO {
  const requiredFields = Object.keys(missingData).length;
  const missingCount = Object.values(missingData).filter((v) => v).length;
  const completedFields = requiredFields - missingCount;
  const progressPercent = Math.round((completedFields / requiredFields) * 100);

  const completedSections: string[] = [];
  const incompleteSections: string[] = [];

  if (!missingData.businessName && !missingData.industryCategory && !missingData.operatingLocationMarket && !missingData.revenueModel) {
    completedSections.push("Business Basics");
  } else {
    incompleteSections.push("Business Basics");
  }

  if (!missingData.monthlyRevenueEstimate && !missingData.monthlyCostEstimate) {
    completedSections.push("Financial Basics");
  } else {
    incompleteSections.push("Financial Basics");
  }

  if (!missingData.teamSizeCapacity) {
    completedSections.push("Capacity Basics");
  } else {
    incompleteSections.push("Capacity Basics");
  }

  if (!missingData.customerSegment && !missingData.mainCurrentProblem) {
    completedSections.push("Customer Basics");
  } else {
    incompleteSections.push("Customer Basics");
  }

  if (!missingData.ownerTimeConstraint) {
    completedSections.push("Owner Constraints");
  } else {
    incompleteSections.push("Owner Constraints");
  }

  return {
    totalRequiredFields: requiredFields,
    completedFields,
    progressPercent,
    completedSections,
    incompleteSections,
  };
}

function determineSetupState(
  missingData: WorkspaceSetupMissingDataDTO
): string {
  const totalMissing = Object.values(missingData).filter((v) => v).length;

  if (totalMissing === Object.keys(missingData).length) {
    return "WORKSPACE_EXISTS";
  }

  if (
    missingData.businessName ||
    missingData.industryCategory ||
    missingData.operatingLocationMarket ||
    missingData.revenueModel
  ) {
    return "BUSINESS_BASICS_MISSING";
  }

  if (missingData.ownerTimeConstraint) {
    return "OWNER_CONSTRAINTS_MISSING";
  }

  if (missingData.monthlyRevenueEstimate || missingData.monthlyCostEstimate) {
    return "FINANCIAL_BASICS_MISSING";
  }

  if (missingData.teamSizeCapacity) {
    return "CAPACITY_BASICS_MISSING";
  }

  if (missingData.customerSegment || missingData.mainCurrentProblem) {
    return "CUSTOMER_BASICS_MISSING";
  }

  if (totalMissing === 0) {
    return "MINIMUM_SETUP_COMPLETE";
  }

  return "NEED_MORE_DATA";
}

async function getWorkspaceSetup(
  ctx: CanonicalAuthContext,
  workspaceId: string
): Promise<WorkspaceSetupStateDTO> {
  requireServiceContext(ctx, workspaceId);

  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  const engagement = await db.engagement.findFirst({
    where: { workspaceId },
  });

  const setupInput: WorkspaceSetupInputDTO = {
    businessBasics: {
      businessName: workspace.name,
      industryCategory: (engagement?.metadata as any)?.industryCategory || undefined,
      operatingLocationMarket: (engagement?.metadata as any)?.operatingLocation || undefined,
      revenueModel: (engagement?.metadata as any)?.revenueModel || undefined,
    },
    ownerConstraints: {
      ownerTimeConstraint: (engagement?.metadata as any)?.ownerTimeConstraint || undefined,
      primaryOwnerRole: (engagement?.metadata as any)?.primaryOwnerRole || undefined,
      executionCapability: (engagement?.metadata as any)?.executionCapability || undefined,
    },
    financialBasics: {
      monthlyRevenueEstimate: (engagement?.metadata as any)?.monthlyRevenueEstimate || undefined,
      monthlyCostEstimate: (engagement?.metadata as any)?.monthlyCostEstimate || undefined,
    },
    capacityBasics: {
      teamSizeCapacity: (engagement?.metadata as any)?.teamSizeCapacity || undefined,
    },
    customerBasics: {
      customerSegment: (engagement?.metadata as any)?.customerSegment || undefined,
      mainCurrentProblem: (engagement?.metadata as any)?.mainCurrentProblem || undefined,
    },
  };

  const missingData = computeMissingData(setupInput);
  const progress = computeProgress(missingData);
  const setupState = determineSetupState(missingData);

  const isDemo = workspace.name.includes("DEMO");
  const firstValueReady = Object.values(missingData).every((v) => !v);

  const safetyWarnings: string[] = [];
  if (isDemo) {
    safetyWarnings.push(
      "DEMO workspace. All setup data is sample only."
    );
  }
  if (setupState !== "MINIMUM_SETUP_COMPLETE" && setupState !== "FIRST_VALUE_READY") {
    safetyWarnings.push(
      "Setup is incomplete. First-value visibility cannot be computed yet."
    );
  }

  return {
    workspaceId,
    setupState: setupState as any,
    workspaceMode: isDemo ? "DEMO" : "LIVE",
    businessBasics: setupInput.businessBasics || {},
    ownerConstraints: setupInput.ownerConstraints || {},
    financialBasics: setupInput.financialBasics || {},
    capacityBasics: setupInput.capacityBasics || {},
    customerBasics: setupInput.customerBasics || {},
    progress,
    missingData,
    firstValueReady,
    nextStep: firstValueReady
      ? "Continue to First-Value Visibility"
      : `Complete: ${progress.incompleteSections.join(", ")}`,
    safetyWarnings,
    generatedAt: new Date().toISOString(),
  };
}

async function saveWorkspaceSetup(
  ctx: CanonicalAuthContext,
  workspaceId: string,
  input: WorkspaceSetupInputDTO
): Promise<WorkspaceSetupResultDTO> {
  requireServiceContext(ctx, workspaceId);

  await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  let engagement = await db.engagement.findFirst({
    where: { workspaceId },
  });

  const metadata = {
    ...((engagement?.metadata as object) || {}),
    businessName: input.businessBasics?.businessName,
    industryCategory: input.businessBasics?.industryCategory,
    operatingLocation: input.businessBasics?.operatingLocationMarket,
    revenueModel: input.businessBasics?.revenueModel,
    monthlyRevenueEstimate: input.financialBasics?.monthlyRevenueEstimate,
    monthlyCostEstimate: input.financialBasics?.monthlyCostEstimate,
    teamSizeCapacity: input.capacityBasics?.teamSizeCapacity,
    customerSegment: input.customerBasics?.customerSegment,
    mainCurrentProblem: input.customerBasics?.mainCurrentProblem,
    ownerTimeConstraint: input.ownerConstraints?.ownerTimeConstraint,
    primaryOwnerRole: input.ownerConstraints?.primaryOwnerRole,
    executionCapability: input.ownerConstraints?.executionCapability,
    setupSavedAt: new Date().toISOString(),
  };

  if (!engagement) {
    engagement = await db.engagement.create({
      data: {
        id: crypto.randomUUID(),
        code: `WS-${workspaceId.slice(0, 8)}`,
        title: `${input.businessBasics?.businessName || "Setup"} Engagement`,
        clientId: crypto.randomUUID(),
        serviceTier: "standard",
        engagementMode: "advisory",
        workspaceId,
        metadata,
      },
    });
  } else {
    await db.engagement.update({
      where: { id: engagement.id },
      data: { metadata },
    });
  }

  const missingData = computeMissingData(input);
  const progress = computeProgress(missingData);
  const setupState = determineSetupState(missingData);
  const firstValueReady = Object.values(missingData).every((v) => !v);

  return {
    success: true,
    workspaceId,
    setupState: setupState as any,
    missingData,
    progressPercent: progress.progressPercent,
    firstValueReady,
    nextStep: firstValueReady
      ? "Continue to First-Value Visibility"
      : `Complete: ${progress.incompleteSections.join(", ")}`,
  };
}

export { getWorkspaceSetup, saveWorkspaceSetup };
