import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { z } from "zod";

// External decision submission schema (less strict than internal)
const ExternalDecisionSchema = z.object({
  workspaceSlug: z.string(),
  submitterEmail: z.string().email(),
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(2000),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  risk: z.enum(["low", "medium", "high"]).optional().default("medium"),
  financialInputs: z.object({
    revenue: z.number().optional().default(0),
    cost: z.number().optional().default(0),
    expectedROI: z.number().optional().default(0),
  }).optional(),
  externalId: z.string().optional(), // External system's decision ID for tracking
});

type ExternalDecisionInput = z.infer<typeof ExternalDecisionSchema>;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = ExternalDecisionSchema.parse(body);

    // Get workspace
    const workspace = await db.workspace.findUnique({
      where: { slug: input.workspaceSlug },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get or create submitter user
    let submitter = await db.user.findUnique({
      where: { email: input.submitterEmail },
    });

    if (!submitter) {
      submitter = await db.user.create({
        data: {
          email: input.submitterEmail,
          name: input.submitterEmail.split("@")[0],
        },
      });
    }

    // Ensure submitter is in workspace
    const membership = await db.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: submitter.id,
        },
      },
    });

    if (!membership || !membership.isActive) {
      // Auto-add submitter to workspace as "submitter" role
      try {
        await db.workspaceMembership.create({
          data: {
            workspaceId: workspace.id,
            userId: submitter.id,
            role: "submitter",
            addedBy: workspace.createdBy,
          },
        });
      } catch {
        // User already exists, ensure active
        await db.workspaceMembership.updateMany({
          where: {
            workspaceId: workspace.id,
            userId: submitter.id,
          },
          data: {
            isActive: true,
            removedAt: null,
          },
        });
      }
    }

    // Calculate impact
    const impactExpected = (input.financialInputs?.revenue || 0) - (input.financialInputs?.cost || 0);
    const impactRange = Math.abs(impactExpected * 0.3);

    // Create decision
    const decision = await db.operatorItem.create({
      data: {
        workspaceId: workspace.id,
        ownerUserId: submitter.id,
        createdBy: submitter.id,

        problem: input.title,
        action: input.description,
        confidence: input.confidence || 0.5,

        impactExpected,
        impactLow: impactExpected - impactRange,
        impactHigh: impactExpected + impactRange,

        status: "pending",
        blockStage: null,
        blockReason: null,
        decisionType: "general",
        problemType: input.risk === "high" ? "growth_block" : "revenue_leak",

        inputsSnapshot: {
          title: input.title,
          description: input.description,
          confidence: input.confidence || 0.5,
          risk: input.risk || "medium",
          financialInputs: input.financialInputs,
          externalId: input.externalId,
          submissionMethod: "external_api",
          createdAt: new Date().toISOString(),
        },

        priorityScore: 0.5,
        executionStatus: "not_started",
        engineVersion: "v1.0.0",
      },
    });

    // Log audit event
    await logAuditEvent({
      eventName: "DECISION_SUBMITTED_EXTERNAL",
      entityType: "Decision",
      entityId: decision.id,
      actorId: submitter.id,
      role: null,
      before: null,
      after: {
        id: decision.id,
        status: "pending",
        title: input.title,
        impactExpected,
      },
      metadata: {
        action: "submit_external_decision",
        submissionMethod: "api",
        externalId: input.externalId,
        confidence: input.confidence || 0.5,
        risk: input.risk || "medium",
        createdAt: new Date().toISOString(),
      },
      workspaceId: workspace.id,
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
    });

    return NextResponse.json(
      {
        decisionId: decision.id,
        status: "pending",
        createdAt: decision.createdAt,
        externalId: input.externalId,
        message: "Decision submitted successfully",
        viewUrl: `/dashboard/decision/${decision.id}`,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`External decision submission failed: ${message}`);

    return NextResponse.json(
      { error: "Submission failed", details: message },
      { status: 500 }
    );
  }
}
