import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { Briefcase } from "lucide-react";

import { TopBar } from "./TopBar";
import { TabsNav } from "./TabsNav";
import { GuardrailsBadge } from "./Guardrails";
import { AddJobModal } from "./AddJobModal";
import { HelpModal } from "./HelpModal";
import { ShortcutOverlay } from "./ShortcutOverlay";
import { useUiStore } from "../store/ui";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Layout() {
  const setAddJobOpen = useUiStore((s) => s.setAddJobOpen);
  const setHelpOpen = useUiStore((s) => s.setHelpOpen);
  const setShortcutOverlayOpen = useUiStore((s) => s.setShortcutOverlayOpen);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAddJobOpen(false);
        setHelpOpen(false);
        setShortcutOverlayOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setAddJobOpen, setHelpOpen, setShortcutOverlayOpen]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen bg-background text-foreground">
        <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar px-2 py-4">
          <div
            className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Briefcase className="size-5" />
          </div>
          <TabsNav />
          <div className="mt-auto">
            <GuardrailsBadge />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>

        <AddJobModal />
        <HelpModal />
        <ShortcutOverlay />
      </div>
    </TooltipProvider>
  );
}
