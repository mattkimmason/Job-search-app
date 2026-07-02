import { useEffect } from "react";

import { useUiStore } from "../store/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SECTIONS: {
  title: string;
  items: { keys: string[]; label: string }[];
}[] = [
  {
    title: "Pipeline navigation",
    items: [
      { keys: ["j", "↓"], label: "Move to next role" },
      { keys: ["k", "↑"], label: "Move to previous role" },
      { keys: ["g", "g"], label: "Jump to top of list" },
      { keys: ["G"], label: "Jump to end of list" },
      { keys: ["Enter"], label: "Focus the verdict row" },
    ],
  },
  {
    title: "Triage verdicts",
    items: [
      { keys: ["1"], label: "Apply now" },
      { keys: ["2"], label: "Pursue" },
      { keys: ["3"], label: "Skip" },
      { keys: ["4"], label: "Not a fit" },
      { keys: ["u"], label: "Undo last verdict (when toast is up)" },
    ],
  },
  {
    title: "App",
    items: [
      { keys: ["?"], label: "Show this overlay" },
      { keys: ["Esc"], label: "Close modals + overlays" },
      { keys: ["n"], label: "Add a job" },
      { keys: ["h"], label: "Open help" },
    ],
  },
];

export function ShortcutOverlay() {
  const open = useUiStore((s) => s.shortcutOverlayOpen);
  const setOpen = useUiStore((s) => s.setShortcutOverlayOpen);
  const setAddJobOpen = useUiStore((s) => s.setAddJobOpen);
  const setHelpOpen = useUiStore((s) => s.setHelpOpen);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "n") {
        event.preventDefault();
        setAddJobOpen(true);
        return;
      }
      if (event.key === "h") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen, setAddJobOpen, setHelpOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press the listed keys anywhere outside a text field.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-3">
          {SECTIONS.map((section) => (
            <section key={section.title} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <ul className="flex flex-col gap-2 text-sm">
                {section.items.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="inline-flex items-center gap-1">
                      {item.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span className="text-muted-foreground">{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <DialogFooter className="text-xs text-muted-foreground sm:justify-start">
          <span>
            Press{" "}
            <kbd className="rounded-md border border-border bg-muted px-1 font-mono text-[11px]">
              ?
            </kbd>{" "}
            any time to reopen.
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
