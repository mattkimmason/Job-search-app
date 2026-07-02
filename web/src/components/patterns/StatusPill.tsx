import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type StatusPillTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "score-good"
  | "score-warn"
  | "score-bad";

export type StatusPillSize = "xs" | "sm";

interface StatusPillProps {
  children: ReactNode;
  tone?: StatusPillTone;
  size?: StatusPillSize;
  /** Render numeric content with `tabular-nums` and `font-semibold`. */
  numeric?: boolean;
  /** Optional leading glyph; renders inside the pill before children. */
  glyph?: ReactNode;
  /** Optional title for hover tooltips. */
  title?: string;
  /** Optional accessible label. Required when content alone is not descriptive (e.g. score pills). */
  "aria-label"?: string;
  className?: string;
}

const toneClass: Record<StatusPillTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  destructive: "bg-destructive/15 text-destructive",
  "score-good": "border border-success/40 bg-success/10 text-success",
  "score-warn": "border border-warning/40 bg-warning/10 text-warning-foreground",
  "score-bad": "border border-destructive/40 bg-destructive/10 text-destructive",
};

const sizeClass: Record<StatusPillSize, string> = {
  xs: "h-5 px-2 text-xs gap-1",
  sm: "h-6 px-2.5 text-xs gap-1",
};

/**
 * Compact rounded-full status pill.
 *
 * Use the `Badge` primitive for plain semantic labels. Use `StatusPill` for
 * tone-coded read-only indicators that need a leading glyph, numeric tabular
 * formatting, or the bordered score-tone treatment (see scoring.ts risk
 * tones).
 */
export function StatusPill({
  children,
  tone = "neutral",
  size = "xs",
  numeric = false,
  glyph,
  title,
  className,
  "aria-label": ariaLabel,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-medium",
        sizeClass[size],
        toneClass[tone],
        numeric && "tabular-nums font-semibold",
        className,
      )}
      title={title}
      aria-label={ariaLabel}
    >
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      <span>{children}</span>
    </span>
  );
}

/** Map `scoreRisk().className` to a StatusPill tone. */
export function scoreRiskTone(
  className: "good" | "warn" | "bad",
): StatusPillTone {
  const map: Record<typeof className, StatusPillTone> = {
    good: "score-good",
    warn: "score-warn",
    bad: "score-bad",
  };
  return map[className] ?? "neutral";
}

/** Map triage verdict keys to StatusPill tones. */
export function verdictToneKey(verdict: string): StatusPillTone {
  const map: Record<string, StatusPillTone> = {
    apply_now: "success",
    selective: "warning",
    skip: "neutral",
    not_a_fit: "destructive",
  };
  return map[verdict] ?? "neutral";
}
