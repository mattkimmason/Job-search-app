import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

const groupVariants = cva(
  "inline-flex max-w-full flex-wrap items-center rounded-lg border border-border bg-card p-0.5",
  {
    variants: {
      size: {
        sm: "min-h-7",
        md: "min-h-8",
      },
    },
    defaultVariants: { size: "md" },
  },
);

const itemVariants = cva(
  "inline-flex min-h-0 shrink-0 items-center gap-1 rounded-md text-[11px] font-medium leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      size: {
        sm: "h-6 px-2",
        md: "h-7 px-2.5",
      },
      active: {
        true: "bg-primary text-primary-foreground",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { size: "md", active: false },
  },
);

export interface SegmentedOption<TValue extends string> {
  id: TValue;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

interface SegmentedControlProps<TValue extends string>
  extends VariantProps<typeof groupVariants> {
  options: ReadonlyArray<SegmentedOption<TValue>>;
  value: TValue;
  onChange: (next: TValue) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Shared segmented-control primitive used by Pipeline mode (Decide / Track),
 * Pipeline Track layout (Sections / Table), and Settings Appearance theme.
 * Replaces three hand-rolled toggles with one source of truth (#BUG-260604-0015,
 * #BUG-260604-0023).
 */
export function SegmentedControl<TValue extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size,
  className,
}: SegmentedControlProps<TValue>) {
  return (
    <div
      className={cn(groupVariants({ size }), className)}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={option.disabled}
            className={itemVariants({ size, active })}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            <span>{option.label}</span>
            {typeof option.count === "number" ? (
              <Badge
                variant={active ? "outline" : "secondary"}
                className={cn(
                  "h-4 min-w-[1.25rem] justify-center px-1 text-[10px] tabular-nums",
                  active
                    ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground"
                    : "",
                )}
              >
                {option.count}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
