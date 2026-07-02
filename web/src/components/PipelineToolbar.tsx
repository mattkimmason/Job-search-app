import { useState } from "react";
import { ChevronDown, X } from "lucide-react";

import {
  useDeleteSavedView,
  useInvalidateJobs,
  useSaveSavedView,
  useSavedViews,
  useStatusModel,
} from "../hooks/queries";
import { useUiStore } from "../store/ui";
import type { QuickFilter, SortMode } from "../store/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

const DECIDE_QUICK_FILTERS: { id: QuickFilter; label: string; hint: string }[] =
  [
    { id: "live_only", label: "Live only", hint: "Only postings verified live" },
    {
      id: "unapplied",
      label: "Not yet applied",
      hint: "Application status is not_started or in_progress",
    },
    {
      id: "needs_triage",
      label: "Needs triage",
      hint: "Discovery=new, no priority tier yet",
    },
  ];

const TRACK_QUICK_FILTERS: { id: QuickFilter; label: string; hint: string }[] =
  [
    {
      id: "needs_follow_up",
      label: "Needs follow-up",
      hint: "Has a next action due today or earlier",
    },
    {
      id: "waiting",
      label: "Waiting",
      hint: "Applied roles with no response yet",
    },
    {
      id: "interview_scheduled",
      label: "Interview scheduled",
      hint: "Screen or interview on the calendar",
    },
    {
      id: "no_contact",
      label: "No contact yet",
      hint: "No recorded next action or outreach",
    },
    {
      id: "stale",
      label: "Stale",
      hint: "Applied 14+ days ago with no recent movement",
    },
    {
      id: "reverify",
      label: "Re-verify",
      hint: "Posting flagged for re-verification",
    },
  ];

const DECIDE_SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "score_desc", label: "Score" },
  { value: "date_desc", label: "Newest" },
  { value: "company_asc", label: "Company" },
];

const TRACK_PRESETS: {
  id: string;
  label: string;
  quickFilter: QuickFilter;
  sortMode: SortMode;
  hint: string;
}[] = [
  {
    id: "needs-followup",
    label: "Needs follow-up",
    quickFilter: "needs_follow_up",
    sortMode: "needs_action",
    hint: "Past-due actions, urgent first",
  },
  {
    id: "active-interviews",
    label: "Active interviews",
    quickFilter: "interview_scheduled",
    sortMode: "upcoming_interview",
    hint: "Screens and interviews on the calendar",
  },
  {
    id: "waiting",
    label: "Waiting on response",
    quickFilter: "waiting",
    sortMode: "oldest_applied",
    hint: "Applied but no recruiter movement yet",
  },
  {
    id: "no-contact",
    label: "No contact yet",
    quickFilter: "no_contact",
    sortMode: "needs_action",
    hint: "No next action recorded",
  },
  {
    id: "stale",
    label: "Stale postings",
    quickFilter: "stale",
    sortMode: "oldest_applied",
    hint: "Applied 14+ days ago without movement",
  },
];

const TRACK_SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "needs_action", label: "Action due" },
  { value: "oldest_applied", label: "Oldest" },
  { value: "recently_updated", label: "Updated" },
  { value: "upcoming_interview", label: "Interview" },
  { value: "company_asc", label: "Company" },
];

function activePresetId(
  quickFilter: QuickFilter,
  sortMode: SortMode,
): string | null {
  const match = TRACK_PRESETS.find(
    (preset) =>
      preset.quickFilter === quickFilter && preset.sortMode === sortMode,
  );
  return match?.id ?? null;
}

export function PipelineToolbar() {
  const ui = useUiStore();
  const { data: statusModel } = useStatusModel();
  const { data: savedViews = [] } = useSavedViews();
  const saveView = useSaveSavedView();
  const deleteView = useDeleteSavedView();
  const invalidateJobs = useInvalidateJobs();
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isTrack = ui.pipelineMode === "track";
  const quickFilters = isTrack ? TRACK_QUICK_FILTERS : DECIDE_QUICK_FILTERS;
  const sortOptions = isTrack ? TRACK_SORT_OPTIONS : DECIDE_SORT_OPTIONS;
  const activePreset = isTrack
    ? activePresetId(ui.quickFilter, ui.sortMode)
    : null;

  const hasActiveFilters =
    Boolean(ui.search) ||
    Boolean(ui.discoveryFilter) ||
    Boolean(ui.applicationFilter) ||
    ui.showHidden ||
    ui.showClosed ||
    (!isTrack && ui.scoreFloor > 0) ||
    ui.quickFilter !== "";

  function resetFilters() {
    ui.setSearch("");
    ui.setDiscoveryFilter("");
    ui.setApplicationFilter("");
    ui.setShowHidden(false);
    ui.setShowClosed(false);
    ui.setScoreFloor(0);
    ui.setQuickFilter("");
  }

  async function handleSaveCurrent() {
    const trimmed = viewName.trim();
    if (!trimmed) return;
    setSavingView(true);
    try {
      await saveView.mutateAsync({
        name: trimmed,
        filter: {
          search: ui.search,
          discoveryStatus: ui.discoveryFilter,
          applicationStatus: ui.applicationFilter,
          showHidden: ui.showHidden,
        },
      });
      setViewName("");
    } finally {
      setSavingView(false);
    }
  }

  function applyPreset(presetId: string) {
    if (presetId === "__none") {
      ui.setQuickFilter("");
      return;
    }
    const preset = TRACK_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    ui.setQuickFilter(preset.quickFilter);
    ui.setSortMode(preset.sortMode);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={ui.search}
          onChange={(event) => ui.setSearch(event.target.value)}
          placeholder="Company, title, summary"
          className="h-7 max-w-xs text-xs"
          aria-label="Search pipeline"
        />
        <Select
          value={ui.sortMode}
          onValueChange={(value) => ui.setSortMode(value as SortMode)}
        >
          <SelectTrigger className="h-6 w-28" aria-label="Sort pipeline">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isTrack ? (
          <>
            <Select
              value={ui.discoveryFilter || "__all"}
              onValueChange={(value) =>
                ui.setDiscoveryFilter(value === "__all" ? "" : value)
              }
            >
              <SelectTrigger className="h-6 w-28" aria-label="Discovery status">
                <SelectValue placeholder="Discovery" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Discovery</SelectItem>
                {statusModel?.discoveryStatus.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={ui.applicationFilter || "__all"}
              onValueChange={(value) =>
                ui.setApplicationFilter(value === "__all" ? "" : value)
              }
            >
              <SelectTrigger
                className="h-6 w-28"
                aria-label="Application status"
              >
                <SelectValue placeholder="Application" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Application</SelectItem>
                {statusModel?.applicationStatus.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <Select
            value={activePreset ?? "__none"}
            onValueChange={applyPreset}
          >
            <SelectTrigger className="h-6 w-28" aria-label="Track preset">
              <SelectValue placeholder="Preset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No preset</SelectItem>
              {TRACK_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id} title={preset.hint}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={ui.quickFilter || "__all"}
          onValueChange={(value) =>
            ui.setQuickFilter(value === "__all" ? "" : (value as QuickFilter))
          }
        >
          <SelectTrigger className="h-6 w-28" aria-label="Quick filter">
            <SelectValue placeholder="Quick filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All roles</SelectItem>
            {quickFilters.map((qf) => (
              <SelectItem key={qf.id} value={qf.id} title={qf.hint}>
                {qf.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="xs"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="pipeline-more-filters"
          className="gap-1 border border-border/60 bg-card/60"
        >
          <ChevronDown
            className={cn(
              "size-3 transition-transform",
              moreOpen && "rotate-180",
            )}
          />
          More filters
        </Button>

        {hasActiveFilters ? (
          <Button
            variant="link"
            size="xs"
            onClick={resetFilters}
            className="ml-auto"
          >
            Reset filters
          </Button>
        ) : null}
      </div>

      {moreOpen ? (
        <div
          id="pipeline-more-filters"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
        >
          {!isTrack ? (
            <label className="flex min-w-[11rem] flex-1 items-center gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">
                Score floor{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {ui.scoreFloor}+
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={ui.scoreFloor}
                onChange={(event) =>
                  ui.setScoreFloor(Number(event.target.value))
                }
                className="h-1 min-w-[5rem] flex-1 cursor-pointer accent-primary"
                aria-label="Score floor"
              />
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={ui.showHidden}
              onChange={(event) => ui.setShowHidden(event.target.checked)}
              className="size-3.5 accent-primary"
            />
            <span>Show hidden / not-a-fit</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={ui.showClosed}
              onChange={(event) => ui.setShowClosed(event.target.checked)}
              className="size-3.5 accent-primary"
            />
            <span>Show closed postings</span>
          </label>
        </div>
      ) : null}

      {savedViews.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Saved views"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Saved views
          </span>
          {savedViews.map((view) => (
            <span key={view.id} className="inline-flex items-center">
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  ui.applySavedViewFilter(view.filter || {});
                  invalidateJobs();
                }}
                title={`Updated ${new Date(view.updatedAt).toLocaleDateString()}`}
              >
                {view.name}
              </Button>
              <button
                type="button"
                aria-label={`Delete saved view ${view.name}`}
                onClick={() => deleteView.mutate(view.id)}
                className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveCurrent();
            }}
          >
            <Input
              type="text"
              placeholder="Save current as..."
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              aria-label="Save current filters as a view"
              className="h-7 w-40 text-xs"
            />
            <Button
              type="submit"
              variant="ghost"
              size="xs"
              disabled={!viewName.trim() || savingView}
            >
              Save view
            </Button>
          </form>
        </div>
      ) : (
        <details className="text-xs text-muted-foreground">
          <summary className="inline-flex cursor-pointer items-center gap-1 select-none text-xs text-muted-foreground hover:text-foreground">
            Save this filter
          </summary>
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveCurrent();
            }}
          >
            <Input
              type="text"
              placeholder="Name this saved view"
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              aria-label="Save current filters as a view"
              className="h-7 w-48 text-xs"
            />
            <Button
              type="submit"
              variant="ghost"
              size="xs"
              disabled={!viewName.trim() || savingView}
            >
              Save view
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
