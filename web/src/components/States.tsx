import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Shared loading / error / empty state components.
 *
 * Honest waits (Wabi-Sabi) and inviting empty states (Chi) — no dead ends.
 * Errors use extra spacing for visual recovery.
 */

interface SkeletonProps {
  className?: string;
  count?: number;
}

export function SkeletonRows({ count = 3, className }: SkeletonProps) {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-10 rounded-lg bg-muted animate-pulse"
        />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4, className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-32 rounded-xl border border-border bg-muted animate-pulse"
        />
      ))}
    </div>
  );
}

export function SkeletonLines({ count = 3, className }: SkeletonProps) {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-3 rounded-full bg-muted animate-pulse"
          style={{ width: index === count - 1 ? "40%" : "100%" }}
        />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
}

function readErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return null;
}

export function ErrorState({
  title = "We hit a snag loading this.",
  message,
  error,
  onRetry,
  retryLabel = "Try again",
}: ErrorStateProps) {
  const detail = message || readErrorMessage(error);
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6"
    >
      <div className="text-base font-semibold text-foreground">{title}</div>
      <p className="text-sm text-muted-foreground">
        {detail
          ? detail
          : "This usually fixes itself with a retry. If it persists, check the server log."}
      </p>
      {onRetry ? (
        <Button onClick={onRetry} size="sm">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ title, body, actions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
      <div className="text-base font-semibold text-foreground">{title}</div>
      {body ? (
        <div className="text-sm text-muted-foreground">{body}</div>
      ) : null}
      {actions ? <div className="mt-1 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface InlineConfirmProps {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function InlineConfirm({
  title,
  body,
  confirmLabel = "Save anyway",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: InlineConfirmProps) {
  return (
    <div
      role="alertdialog"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4"
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {body ? (
        <div className="text-sm text-muted-foreground">{body}</div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
