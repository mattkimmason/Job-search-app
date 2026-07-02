import { NavLink } from "react-router-dom";
import {
  CalendarCheck,
  Briefcase,
  BarChart3,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TabItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const TABS: TabItem[] = [
  { to: "/today", label: "Today", icon: CalendarCheck },
  { to: "/pipeline", label: "Pipeline", icon: Briefcase },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function TabsNav() {
  return (
    <nav
      className="flex w-full flex-col items-center gap-1"
      aria-label="Workspaces"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <Tooltip key={tab.to}>
            <TooltipTrigger asChild>
              <NavLink
                to={tab.to}
                aria-label={tab.label}
                className={({ isActive }) =>
                  cn(
                    "grid size-10 place-items-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                <Icon className="block size-5 shrink-0" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">{tab.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

export { TABS as workspaceTabs };
