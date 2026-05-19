"use client";

import Link from "next/link";

/**
 * Governed Empty State Component
 *
 * Prevents "dead-end" empty states that confuse operators.
 * Every empty state must:
 * - Explain why it's empty
 * - Show next steps
 * - Provide guidance (not just "no data")
 */

export interface GovernedEmptyStateProps {
  reason:
    | "no_actions"
    | "no_engagements"
    | "no_recommendations"
    | "no_evidence"
    | "no_findings"
    | "no_results"
    | "no_data"
    | "filtering_no_match"
    | "loading_failed"
    | "permission_denied";
  primaryAction?: {
    label: string;
    onClick: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    href?: string;
  };
  helpText?: string;
}

/**
 * Empty state message definitions
 * Maps reason codes to operator-friendly explanations
 */
const EMPTY_STATE_CONTENT: Record<
  GovernedEmptyStateProps["reason"],
  {
    icon: string;
    title: string;
    description: string;
    guidance: string;
  }
> = {
  no_actions: {
    icon: "✓",
    title: "All caught up",
    description: "No pending actions right now.",
    guidance:
      "Good news! When new actions arrive, they'll appear here. Check back tomorrow or enable notifications.",
  },

  no_engagements: {
    icon: "📋",
    title: "No engagements yet",
    description: "You haven't created any engagements.",
    guidance:
      'Click "New Engagement" to start planning your first intervention or consulting engagement.',
  },

  no_recommendations: {
    icon: "💡",
    title: "No recommendations yet",
    description: "The system hasn't generated recommendations yet.",
    guidance:
      "This usually means we're still analyzing your data. Check back in a few hours, or you can create manual recommendations.",
  },

  no_evidence: {
    icon: "🔍",
    title: "No evidence collected yet",
    description: "We haven't collected any supporting evidence yet.",
    guidance:
      "Evidence is gathered over time as the engagement progresses. You can also manually add evidence.",
  },

  no_findings: {
    icon: "🔎",
    title: "No findings yet",
    description: "We haven't identified any key findings.",
    guidance:
      "Findings appear as we analyze evidence and uncover insights. Check back as the engagement progresses.",
  },

  no_results: {
    icon: "🔍",
    title: "No results found",
    description: "Your search didn't match anything.",
    guidance:
      "Try adjusting your filters or search terms. Or start fresh to see all available items.",
  },

  no_data: {
    icon: "📊",
    title: "No data available",
    description: "We're still loading your data.",
    guidance: "Please refresh the page in a moment. If problems persist, contact support.",
  },

  filtering_no_match: {
    icon: "🔎",
    title: "No matches",
    description: "Nothing matched your filters.",
    guidance:
      "Try removing some filters or adjusting your criteria to see more options.",
  },

  loading_failed: {
    icon: "⚠️",
    title: "Couldn't load",
    description: "Something went wrong loading this page.",
    guidance:
      "Try refreshing or contact support if the problem persists. Your data is safe.",
  },

  permission_denied: {
    icon: "🔒",
    title: "Access restricted",
    description: "You don't have permission to view this.",
    guidance:
      "Contact your workspace admin to request access, or ask them to share this with you.",
  },
};

/**
 * Main governed empty state component
 */
export function GovernedEmptyState({
  reason,
  primaryAction,
  secondaryAction,
  helpText,
}: GovernedEmptyStateProps) {
  const content = EMPTY_STATE_CONTENT[reason];

  if (!content) {
    console.warn(`Unknown empty state reason: ${reason}`);
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] px-4 py-12 text-center">
      {/* Icon */}
      <div className="text-5xl mb-4">{content.icon}</div>

      {/* Title and description */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {content.title}
      </h3>
      <p className="text-gray-600 mb-4 max-w-sm">{content.description}</p>

      {/* Guidance */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 max-w-sm">
        <p className="text-sm text-blue-900">{content.guidance}</p>
      </div>

      {/* Custom help text */}
      {helpText && (
        <p className="text-sm text-gray-500 mb-6 max-w-sm italic">{helpText}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {primaryAction && primaryAction.href ? (
          <Link
            href={primaryAction.href}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
          >
            {primaryAction.label}
          </Link>
        ) : primaryAction ? (
          <button
            onClick={primaryAction.onClick}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
          >
            {primaryAction.label}
          </button>
        ) : null}
        {secondaryAction && secondaryAction.href ? (
          <Link
            href={secondaryAction.href}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 transition"
          >
            {secondaryAction.label}
          </Link>
        ) : secondaryAction ? (
          <button
            onClick={secondaryAction.onClick}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 transition"
          >
            {secondaryAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Compact empty state - for sidebars, small containers
 */
export function CompactEmptyState({
  reason,
  action,
}: {
  reason: GovernedEmptyStateProps["reason"];
  action?: { label: string; onClick: () => void };
}) {
  const content = EMPTY_STATE_CONTENT[reason];

  return (
    <div className="p-4 text-center">
      <div className="text-3xl mb-2">{content.icon}</div>
      <h4 className="font-medium text-gray-900 mb-1">{content.title}</h4>
      <p className="text-sm text-gray-600 mb-3">{content.guidance}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

/**
 * Loading state with message
 */
export function LoadingState({
  message = "Loading...",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-gray-600">{message}</p>
    </div>
  );
}

/**
 * Error state (separate from empty - means something failed)
 */
export function ErrorState({
  message = "Something went wrong",
  onRetry,
  onDismiss,
}: {
  message?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 px-4">
      <div className="text-4xl">⚠️</div>
      <p className="text-gray-900 font-medium max-w-sm text-center">{message}</p>
      <p className="text-sm text-gray-600 max-w-sm text-center">
        Your data is safe. Please try again or contact support.
      </p>
      <div className="flex gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
          >
            Try again
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 transition"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
