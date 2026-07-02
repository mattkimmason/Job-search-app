import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** "page" renders an h2 with the 2xl scale; "section" renders an h3 with the lg scale. */
  level?: "page" | "section";
  /** Align the actions/title row across the top edge vs the center. Defaults to "center". */
  align?: "start" | "center";
  className?: string;
  /** Render as `<header>` (default) or a plain `<div>`. */
  as?: "header" | "div";
}

/**
 * Standard page or section header.
 *
 * Title + optional description + optional trailing actions. Matches the
 * existing TodayPage, InsightsPage, and SettingsPage header pattern.
 */
export function SectionHeader({
  title,
  description,
  actions,
  level = "page",
  align = "center",
  className,
  as: As = "header",
}: SectionHeaderProps) {
  const titleClass =
    level === "page"
      ? "text-2xl font-semibold text-foreground"
      : "text-lg font-semibold text-foreground";
  const Heading = level === "page" ? "h2" : "h3";

  return (
    <As
      className={cn(
        "flex flex-wrap gap-4",
        align === "start" ? "items-start" : "items-center",
        actions ? "justify-between" : "",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className={titleClass}>{title}</Heading>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </As>
  );
}
