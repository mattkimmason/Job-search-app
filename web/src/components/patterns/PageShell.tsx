import type { ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/cn";

type PageShellWidth = "4xl" | "6xl";
type PageShellGap = "4" | "6";

interface PageShellProps {
  children: ReactNode;
  width?: PageShellWidth;
  gap?: PageShellGap;
  className?: string;
  innerClassName?: string;
}

const widthClass: Record<PageShellWidth, string> = {
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
};

const gapClass: Record<PageShellGap, string> = {
  "4": "gap-4",
  "6": "gap-6",
};

/**
 * Standard workspace page shell.
 *
 * Wraps page content in a scroll area with the canonical max-width and padding
 * rhythm defined in design.md. Use `width="4xl"` for settings/forms.
 */
export function PageShell({
  children,
  width = "6xl",
  gap = "6",
  className,
  innerClassName,
}: PageShellProps) {
  return (
    <ScrollArea className={cn("h-full", className)}>
      <div
        className={cn(
          "mx-auto flex w-full flex-col px-6 py-6",
          widthClass[width],
          gapClass[gap],
          innerClassName,
        )}
      >
        {children}
      </div>
    </ScrollArea>
  );
}
