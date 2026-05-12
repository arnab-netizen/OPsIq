/**
 * Notification Detail API
 *
 * Get individual notification and mark as read.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getNotification,
  markAsRead,
} from "@/services/notifications/notification-service";

/**
 * GET /api/notifications/[id]
 * Get a specific notification
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Notification ID is required" },
        { status: 400 }
      );
    }

    const notification = await getNotification(id);

    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const requestedWorkspace = request.headers.get("x-workspace-id") || "default";
    if (notification.workspaceId !== requestedWorkspace) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get notification" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications/[id]/read
 * Mark notification as read
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Notification ID is required" },
        { status: 400 }
      );
    }

    // Verify notification exists and belongs to workspace
    const notification = await getNotification(id);
    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    const requestedWorkspace = request.headers.get("x-workspace-id") || "default";
    if (notification.workspaceId !== requestedWorkspace) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    await markAsRead(id);

    return NextResponse.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to mark notification as read" },
      { status: 500 }
    );
  }
}
