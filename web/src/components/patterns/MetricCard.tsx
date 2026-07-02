import type { ReactNode } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** Use the larger hero size and primary-tinted card. */
  hero?: boolean;
  className?: string;
}

/**
 * Canonical KPI / metric card.
 *
 * Standardizes the uppercase label, tabular-num value, and optional supporting
 * detail used across Insights and similar surfaces.
 */
export function MetricCard({
  label,
  value,
  sub,
  hero = false,
  className,
}: MetricCardProps) {
  return (
    <Card
      className={cn(hero && "border-primary/30 bg-primary/[0.04]", className)}
    >
      <CardHeader className="gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "font-semibold tabular-nums text-foreground",
            hero ? "text-4xl" : "text-2xl",
          )}
        >
          {value}
        </div>
        {sub ? (
          <div className="text-xs text-muted-foreground">{sub}</div>
        ) : null}
      </CardHeader>
    </Card>
  );
}
