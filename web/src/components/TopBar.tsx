import { useLocation } from "react-router-dom";
import { HelpCircle, Plus, Search } from "lucide-react";

import { useProfile } from "../hooks/queries";
import { useUiStore } from "../store/ui";
import { workspaceTabs } from "./TabsNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function TopBar() {
  const { data: profile } = useProfile();
  const setAddJobOpen = useUiStore((s) => s.setAddJobOpen);
  const setHelpOpen = useUiStore((s) => s.setHelpOpen);
  const search = useUiStore((s) => s.search);
  const setSearch = useUiStore((s) => s.setSearch);

  const location = useLocation();
  const candidateName = profile?.candidate?.displayName || "Job Search";
  const activeTab = workspaceTabs.find((t) =>
    location.pathname.startsWith(t.to),
  );

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
      <div className="flex min-w-0 flex-col">
        <h1
          id="candidateName"
          className="truncate text-base font-semibold leading-tight text-foreground"
        >
          {activeTab?.label || "Today"}
        </h1>
        <span className="truncate text-xs text-muted-foreground">
          {candidateName}
        </span>
      </div>

      <div className="ml-4 max-w-sm flex-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search jobs..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 border-0 bg-secondary pl-8 text-xs shadow-none focus-visible:bg-background"
            aria-label="Search jobs"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setHelpOpen(true)}
              aria-label="Help"
            >
              <HelpCircle className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Help (h)</TooltipContent>
        </Tooltip>
        <Button
          size="xs"
          onClick={() => setAddJobOpen(true)}
          className="gap-1"
        >
          <Plus className="size-3.5" />
          Add job
        </Button>
      </div>
    </header>
  );
}
