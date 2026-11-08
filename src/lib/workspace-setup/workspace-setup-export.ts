import type { WorkspaceSetupStateDTO, WorkspaceSetupExportDTO } from "./workspace-setup.dto";

export function generateSetupExportPacket(
  setup: WorkspaceSetupStateDTO,
  generatedBy?: string
): WorkspaceSetupExportDTO {
  return {
    exportType: "WORKSPACE_SETUP_PROOF_PACKET",
    workspaceId: setup.workspaceId,
    workspaceName: `Workspace ${setup.workspaceId.slice(0, 8)}`,
    workspaceMode: setup.workspaceMode,
    generatedAt: new Date().toISOString(),
    generatedBy,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    setupState: setup.setupState,
    businessBasics: setup.businessBasics,
    ownerConstraints: setup.ownerConstraints,
    financialBasics: setup.financialBasics,
    capacityBasics: setup.capacityBasics,
    customerBasics: setup.customerBasics,
    progress: setup.progress,
    missingData: setup.missingData,
    firstValueReady: setup.firstValueReady,
    nextStep: setup.nextStep,
    safetyWarnings: setup.safetyWarnings,
    documentVersion: "1.0",
  };
}

export function sanitizeExportForDisplay(
  packet: WorkspaceSetupExportDTO
): WorkspaceSetupExportDTO {
  const sanitized = JSON.parse(JSON.stringify(packet));

  const stringified = JSON.stringify(sanitized);
  if (
    stringified.match(
      /password|secret|token|key|DATABASE_URL|STRIPE|credential/i
    )
  ) {
    throw new Error("Export packet contains sensitive data");
  }

  return sanitized;
}
