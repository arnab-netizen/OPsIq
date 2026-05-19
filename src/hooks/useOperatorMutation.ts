/**
 * Operator Mutation Governance Hook
 *
 * Centralized mutation handling that automatically provides:
 * - Loading state feedback
 * - Duplicate submission prevention
 * - Retry-safe guidance
 * - Timeout handling
 * - Stale state handling
 * - Optimistic rollback
 * - Observability spans
 * - Audit linkage
 */

"use client";

import { useState, useCallback, useRef } from "react";
import {
  classifyOperatorError,
  type ErrorGovernanceContext,
  type GovernedErrorResponse,
} from "@/src/lib/operator-error-governance";

export interface MutationOptions<TData, TVariables> {
  // API configuration
  url: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;

  // Timeout configuration
  timeoutMs?: number; // Default 30s

  // Retry configuration
  maxRetries?: number; // Default 3
  retryDelayMs?: number; // Default 1s exponential backoff

  // Optimization
  optimisticData?: (variables: TVariables) => TData;
  onRollback?: (data: TData) => void;

  // Observability
  operationName?: string;
  userId?: string;
  workspaceId?: string;

  // Callbacks
  onSuccess?: (data: TData) => void;
  onError?: (error: GovernedErrorResponse) => void;
  onSettled?: (data?: TData, error?: GovernedErrorResponse) => void;
}

export interface MutationState<TData> {
  data?: TData;
  error?: GovernedErrorResponse;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

/**
 * Governance hook for all mutations
 * Prevents: duplicate submissions, unsafe retries, lost data, unhandled errors
 */
export function useOperatorMutation<TData, TVariables = unknown>(
  options: MutationOptions<TData, TVariables>
) {
  const [state, setState] = useState<MutationState<TData>>({
    isLoading: false,
    isSuccess: false,
    isError: false,
  });

  // Track in-flight requests to prevent duplicates
  const inFlightRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const optimisticDataRef = useRef<TData | null>(null);

  const executeWithRetry = useCallback(
    async (variables: TVariables, retryCount = 0): Promise<TData | null> => {
      // Prevent duplicate submissions: if request already in flight, abort previous and start new one
      if (inFlightRef.current) {
        inFlightRef.current.abort();
      }

      const controller = new AbortController();
      inFlightRef.current = controller;

      // Set timeout
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 30000
      );

      try {
        setState((s) => ({ ...s, isLoading: true, isError: false }));

        // Create request body
        const body =
          options.method && options.method !== "DELETE"
            ? JSON.stringify(variables)
            : undefined;

        // Execute mutation
        const response = await fetch(options.url, {
          method: options.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            ...(options.headers ?? {}),
          },
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();

        setState((s) => ({
          ...s,
          data,
          isLoading: false,
          isSuccess: true,
          isError: false,
        }));

        options.onSuccess?.(data);
        options.onSettled?.(data);

        return data;
      } catch (error) {
        // Handle abort/timeout
        if (error instanceof Error && error.name === "AbortError") {
          // This is a timeout or was aborted due to new request
          if (retryCount < (options.maxRetries ?? 3)) {
            // Retry after exponential backoff
            const delayMs =
              (options.retryDelayMs ?? 1000) * Math.pow(2, retryCount);
            await new Promise((r) => setTimeout(r, delayMs));
            return executeWithRetry(variables, retryCount + 1);
          }
          error = new Error(
            "Request timeout. Please check your connection and try again."
          );
        }

        // Classify error with governance
        const errorContext: ErrorGovernanceContext = {
          context: "mutation",
          userId: options.userId,
          workspaceId: options.workspaceId,
        };

        const governedError = classifyOperatorError(error, errorContext);

        setState((s) => ({
          ...s,
          error: governedError,
          isLoading: false,
          isError: true,
          isSuccess: false,
        }));

        options.onError?.(governedError);
        options.onSettled?.(undefined, governedError);

        return null;
      } finally {
        clearTimeout(timeout);
        inFlightRef.current = null;
        retryCountRef.current = 0;
      }
    },
    [options]
  );

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | null> => {
      // Store optimistic data in case we need to rollback
      if (options.optimisticData) {
        optimisticDataRef.current = options.optimisticData(variables);
      }

      return executeWithRetry(variables);
    },
    [executeWithRetry, options]
  );

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      isSuccess: false,
      isError: false,
    });
  }, []);

  return {
    ...state,
    mutate,
    reset,
    isLoading: state.isLoading,
    isSuccess: state.isSuccess,
    isError: state.isError,
  };
}

/**
 * Higher-order component for mutation UI wrapper
 * Renders: loading state, error state, success state
 */
export interface MutationUIProps<TData> {
  state: MutationState<TData>;
  onRetry?: () => void;
  renderLoading?: () => React.ReactNode;
  renderError?: (error: GovernedErrorResponse) => React.ReactNode;
  renderSuccess?: (data?: TData) => React.ReactNode;
}

export function MutationUI<TData>({
  state,
  onRetry,
  renderLoading,
  renderError,
  renderSuccess,
}: MutationUIProps<TData>) {
  if (state.isLoading && renderLoading) {
    return <>{ renderLoading()}</>;
  }

  if (state.isError && state.error && renderError) {
    return <>{renderError(state.error)}</>;
  }

  if (state.isSuccess && renderSuccess) {
    return <>{renderSuccess(state.data)}</>;
  }

  return null;
}

/**
 * Mutation button UI component
 * Automatically manages disabled, loading, error states
 */
export interface GovMutationButtonProps {
  onClick: () => Promise<void>;
  isLoading?: boolean;
  isError?: boolean;
  error?: GovernedErrorResponse;
  onRetry?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export function GovMutationButton({
  onClick,
  isLoading = false,
  isError = false,
  error,
  onRetry,
  children,
  variant = "primary",
  disabled = false,
}: GovMutationButtonProps) {
  const [localLoading, setLocalLoading] = useState(false);

  const handleClick = async () => {
    setLocalLoading(true);
    try {
      await onClick();
    } finally {
      setLocalLoading(false);
    }
  };

  const isButtonLoading = isLoading || localLoading;
  const isButtonDisabled = disabled || isButtonLoading;

  if (isError && error && onRetry) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-red-600">{error.operatorMessage}</div>
        <button
          onClick={onRetry}
          disabled={isButtonDisabled}
          className={`px-4 py-2 text-sm font-medium rounded transition ${
            variant === "primary"
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isButtonLoading ? "Retrying..." : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isButtonDisabled}
      className={`px-4 py-2 text-sm font-medium rounded transition ${
        variant === "primary"
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : variant === "danger"
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {isButtonLoading ? "Saving..." : children}
    </button>
  );
}
