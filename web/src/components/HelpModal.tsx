import { useUiStore } from "../store/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function HelpModal() {
  const open = useUiStore((s) => s.helpOpen);
  const setOpen = useUiStore((s) => s.setHelpOpen);
  const setShortcutOverlayOpen = useUiStore((s) => s.setShortcutOverlayOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>How to use this app</DialogTitle>
          <DialogDescription>
            Five loops that drive a focused, local job search.
          </DialogDescription>
        </DialogHeader>
        <ol className="ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Today</span> tells
            you what to do next: overdue follow-ups, postings to re-verify,
            jobs awaiting scoring, due dates.
          </li>
          <li>
            <span className="font-medium text-foreground">Pipeline</span> is
            the working list. Expand a job to score it, change status, add
            notes/contacts/events, and trigger LLM drafts.
          </li>
          <li>
            <span className="font-medium text-foreground">Insights</span> shows
            weekly funnel performance and source effectiveness. Use it for
            retros.
          </li>
          <li>
            <span className="font-medium text-foreground">Settings</span> is
            where you configure your search strategy, LLM key, JSON backup, and
            guardrails.
          </li>
          <li>
            Click{" "}
            <span className="font-medium text-foreground">+ Add Job</span> any
            time to paste markdown from deep research, add a job manually, or
            lookup new roles.
          </li>
          <li>
            For each job, use{" "}
            <span className="font-medium text-foreground">Still live?</span> to
            mark a posting as Live or Dead. Closed postings get de-emphasized;
            unverified ones get nudged on Today.
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span>
              Press{" "}
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                ?
              </kbd>{" "}
              any time to see the full list of keyboard shortcuts.
            </span>
            <Button
              variant="link"
              size="xs"
              onClick={() => {
                setOpen(false);
                setShortcutOverlayOpen(true);
              }}
            >
              Open shortcuts now
            </Button>
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
