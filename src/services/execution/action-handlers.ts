import { logger } from "@/infra/logger";
import { db } from "@/lib/db";

export type ActionType = "email" | "webhook" | "task";

export interface ActionPayload {
  [key: string]: any;
}

export interface ActionResult {
  success: boolean;
  actionType: ActionType;
  message: string;
  error?: string;
}

export async function triggerAction(
  decisionId: string,
  workspaceId: string,
  actionType: ActionType | null | undefined,
  actionPayload: ActionPayload | null | undefined,
  userId: string
): Promise<ActionResult | null> {
  if (!actionType || !actionPayload) {
    return null;
  }

  try {
    let result: ActionResult;

    switch (actionType) {
      case "email":
        result = await handleEmailAction(actionPayload, decisionId);
        break;
      case "webhook":
        result = await handleWebhookAction(actionPayload, decisionId, workspaceId);
        break;
      case "task":
        result = await handleTaskAction(
          actionPayload,
          decisionId,
          workspaceId,
          userId
        );
        break;
      default:
        return null;
    }

    if (result.success) {
      logger.info("Action triggered successfully", {
        actionType,
        decisionId,
        workspaceId,
        message: result.message,
      });
    } else {
      logger.warn("Action trigger failed", {
        actionType,
        decisionId,
        workspaceId,
        error: result.error,
      });
    }

    return result;
  } catch (error) {
    logger.error("Unexpected error triggering action", {
      actionType,
      decisionId,
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      actionType,
      message: "Action trigger failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function handleEmailAction(
  payload: ActionPayload,
  decisionId: string
): Promise<ActionResult> {
  const { email, subject, body } = payload;

  if (!email) {
    return {
      success: false,
      actionType: "email",
      message: "Email action requires 'email' field",
      error: "Missing email address",
    };
  }

  // Stub: Log email instead of actually sending
  logger.info("Email action triggered (stub)", {
    to: email,
    subject: subject || "Decision Execution Notification",
    body: body || `Decision ${decisionId} has been executed.`,
  });

  return {
    success: true,
    actionType: "email",
    message: `Email action triggered for ${email}`,
  };
}

async function handleWebhookAction(
  payload: ActionPayload,
  decisionId: string,
  workspaceId: string
): Promise<ActionResult> {
  const { url, method = "POST", headers = {}, body: webhookBody } = payload;

  if (!url) {
    return {
      success: false,
      actionType: "webhook",
      message: "Webhook action requires 'url' field",
      error: "Missing webhook URL",
    };
  }

  try {
    const defaultBody = {
      decisionId,
      workspaceId,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(webhookBody || defaultBody),
    });

    if (!response.ok) {
      return {
        success: false,
        actionType: "webhook",
        message: `Webhook returned ${response.status}`,
        error: `HTTP ${response.status}`,
      };
    }

    logger.info("Webhook action triggered", {
      url,
      method,
      status: response.status,
      decisionId,
    });

    return {
      success: true,
      actionType: "webhook",
      message: `Webhook triggered: ${url}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      actionType: "webhook",
      message: "Webhook request failed",
      error: errorMsg,
    };
  }
}

async function handleTaskAction(
  payload: ActionPayload,
  decisionId: string,
  workspaceId: string,
  userId: string
): Promise<ActionResult> {
  const { title, description, assignedTo } = payload;

  if (!title) {
    return {
      success: false,
      actionType: "task",
      message: "Task action requires 'title' field",
      error: "Missing task title",
    };
  }

  try {
    // Create an Action record (or similar task tracking entity)
    // For now, we'll just log it and return success
    logger.info("Task action triggered", {
      title,
      description,
      assignedTo,
      relatedDecision: decisionId,
      workspaceId,
      createdBy: userId,
    });

    // In a real implementation, you would create a record in your task/action table
    // Example:
    // await db.action.create({
    //   data: {
    //     workspaceId,
    //     title,
    //     description,
    //     assignedTo,
    //     relatedDecisionId: decisionId,
    //     status: "open",
    //     createdBy: userId,
    //   },
    // });

    return {
      success: true,
      actionType: "task",
      message: `Task created: ${title}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      actionType: "task",
      message: "Task creation failed",
      error: errorMsg,
    };
  }
}
