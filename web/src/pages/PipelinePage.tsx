import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Table as TableIcon,
} from "lucide-react";

import { PipelineToolbar } from "../components/PipelineToolbar";
import { JobRow } from "../components/JobRow";
import { ActivityPanel } from "../components/ActivityPanel";
import {
  usePatchJob,
  useJobs,
  useRubrics,
  useStatusModel,
} from "../hooks/queries";
import { useUiStore } from "../store/ui";
import {
  EmptyState,
  ErrorState,
  InlineConfirm,
  SkeletonRows,
} from "../components/States";
import { useQueryClient } from "@tanstack/react-query";
import {
  bucketForScore,
  calculateAutoScore,
  pickRubric,
  scoreRisk,
} from "../lib/scoring";
import { showToast } from "../lib/toast";
import { currentVerdict } from "../lib/verdicts";
import { mapUnifiedStatusToModel } from "../lib/format";
import {
  FUNNEL_STAGES,
  STAGE_META,
  STAGE_SHORT_LABEL,
  daysSince,
  isTrackStage,
  stageForJob,
  type Stage,
} from "../lib/stages";
import type { Job } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill, scoreRiskTone } from "@/components/patterns";
import { cn } from "@/lib/cn";

type BulkAction = "not_a_fit" | "posting_dead" | "rescore";
type QuickDecision = "shortlist" | "apply" | "skip";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function jobTimestamp(job: Job): number {
  const candidates = [job.createdAt, job.updatedAt];
  for (const cand of candidates) {
    if (!cand) continue;
    const ts = new Date(cand).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
}

function appliedTimestamp(job: Job): number {
  if (!job.appliedAt) return Number.POSITIVE_INFINITY;
  const ts = new Date(job.appliedAt).getTime();
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
}

function updatedTimestamp(job: Job): number {
  const candidate = job.updatedAt || job.createdAt;
  if (!candidate) return 0;
  const ts = new Date(candidate).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function dueTimestamp(job: Job): number {
  if (!job.dueDate) return Number.POSITIVE_INFINITY;
  const ts = new Date(job.dueDate).getTime();
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
}

const MS_PER_DAY = 86400000;

function actionUrgencyKey(job: Job, now: number): number {
  const due = dueTimestamp(job);
  if (Number.isFinite(due)) {
    return due;
  }
  if (job.applicationStatus === "applied") {
    const applied = appliedTimestamp(job);
    if (Number.isFinite(applied)) {
      const daysSinceApplied = (now - applied) / MS_PER_DAY;
      if (daysSinceApplied >= 14) return now - daysSinceApplied;
    }
  }
  return now + MS_PER_DAY * 365 - updatedTimestamp(job);
}

function compareTrackBySort(
  a: Job,
  b: Job,
  sortMode: string,
  now: number,
): number {
  switch (sortMode) {
    case "oldest_applied":
      return appliedTimestamp(a) - appliedTimestamp(b);
    case "recently_updated":
      return updatedTimestamp(b) - updatedTimestamp(a);
    case "company_asc":
      return (a.company || "").localeCompare(b.company || "");
    case "upcoming_interview": {
      const interviewStages = new Set([
        "interview_scheduled",
        "screen_scheduled",
      ]);
      const aPriority = interviewStages.has(a.interviewStatus) ? 0 : 1;
      const bPriority = interviewStages.has(b.interviewStatus) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return dueTimestamp(a) - dueTimestamp(b);
    }
    case "needs_action":
    default:
      return actionUrgencyKey(a, now) - actionUrgencyKey(b, now);
  }
}

function matchesTrackQuickFilter(
  job: Job,
  quickFilter: string,
  now: number,
): boolean {
  if (quickFilter === "") return true;
  switch (quickFilter) {
    case "needs_follow_up": {
      const due = dueTimestamp(job);
      return Number.isFinite(due) && due <= now;
    }
    case "waiting":
      return (
        job.applicationStatus === "applied" &&
        job.interviewStatus === "waiting"
      );
    case "interview_scheduled":
      return (
        job.interviewStatus === "interview_scheduled" ||
        job.interviewStatus === "screen_scheduled"
      );
    case "no_contact":
      return !job.nextAction;
    case "stale": {
      if (job.applicationStatus !== "applied") return false;
      const applied = appliedTimestamp(job);
      if (!Number.isFinite(applied)) return false;
      return (now - applied) / MS_PER_DAY >= 14;
    }
    case "reverify":
      return Boolean(job.needsVerification);
    default:
      return true;
  }
}

function appliedMeta(job: Job): string {
  if (!job.appliedAt) return "";
  const days = daysSince(job.appliedAt);
  if (days === null) return "";
  if (days === 0) return "applied today";
  if (days === 1) return "applied 1d ago";
  return `applied ${days}d ago`;
}

function activityMeta(job: Job): string {
  const applied = appliedMeta(job);
  if (applied) return applied;
  const days = daysSince(job.updatedAt);
  if (days === null) return "";
  if (days === 0) return "updated today";
  if (days === 1) return "updated 1d ago";
  return `updated ${days}d ago`;
}

export function PipelinePage() {
  const ui = useUiStore();
  const queryClient = useQueryClient();
  const { data: statusModel } = useStatusModel();
  const patchJob = usePatchJob();
  const rubricsQuery = useRubrics();
  const jobsQuery = useJobs({
    search: ui.search,
    discoveryStatus: ui.discoveryFilter,
    applicationStatus: ui.applicationFilter,
  });
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const isLoading = jobsQuery.isLoading && !jobsQuery.data;
  const isError = jobsQuery.isError;

  const mode = ui.pipelineMode;

  const scoreOf = useCallback(
    (job: Job) =>
      calculateAutoScore(job, pickRubric(rubricsQuery.data, job.lane)),
    [rubricsQuery.data],
  );

  const filteredJobs = useMemo(() => {
    const filtered = jobs.filter((job) => {
      if (!ui.showClosed && job.postingStatus === "dead") return false;
      if (!ui.showHidden && ui.discoveryFilter !== "not_a_fit") {
        if (job.discoveryStatus === "not_a_fit") return false;
      }
      const score = scoreOf(job);
      if (ui.scoreFloor > 0 && score < ui.scoreFloor) return false;
      if (ui.quickFilter === "live_only") {
        if (job.postingStatus !== "live") return false;
      } else if (ui.quickFilter === "unapplied") {
        const app = job.applicationStatus || "not_started";
        if (app !== "not_started" && app !== "in_progress") return false;
      } else if (ui.quickFilter === "needs_triage") {
        const verdict = currentVerdict(job);
        const isNew = (job.discoveryStatus || "new") === "new";
        if (!isNew && verdict !== null) return false;
      }
      return true;
    });
    const withScores = filtered.map((job) => ({ job, score: scoreOf(job) }));
    withScores.sort((a, b) => {
      switch (ui.sortMode) {
        case "date_desc":
          return jobTimestamp(b.job) - jobTimestamp(a.job);
        case "company_asc":
          return (a.job.company || "").localeCompare(b.job.company || "");
        case "score_desc":
        default:
          return b.score - a.score;
      }
    });
    return withScores.map((entry) => entry.job);
  }, [
    jobs,
    scoreOf,
    ui.showClosed,
    ui.showHidden,
    ui.discoveryFilter,
    ui.scoreFloor,
    ui.quickFilter,
    ui.sortMode,
  ]);

  const decideJobs = useMemo(
    () => filteredJobs.filter((job) => stageForJob(job) === "decide"),
    [filteredJobs],
  );

  const trackGroups = useMemo(() => {
    const groups: Record<Stage, Job[]> = {
      decide: [],
      shortlisted: [],
      applied: [],
      screening: [],
      interviewing: [],
      offer: [],
      closed: [],
    };
    const now = Date.now();
    const searchLower = ui.search.trim().toLowerCase();
    for (const job of jobs) {
      if (
        searchLower &&
        !`${job.company || ""} ${job.title || ""} ${job.summary || ""}`
          .toLowerCase()
          .includes(searchLower)
      ) {
        continue;
      }
      if (!ui.showClosed && job.postingStatus === "dead") continue;
      if (!ui.showHidden && job.discoveryStatus === "not_a_fit") continue;
      if (!matchesTrackQuickFilter(job, ui.quickFilter, now)) continue;
      groups[stageForJob(job)].push(job);
    }
    const sortMode = ui.sortMode;
    for (const key of [
      "shortlisted",
      "applied",
      "screening",
      "interviewing",
      "offer",
      "closed",
    ] as const) {
      groups[key].sort((a, b) => compareTrackBySort(a, b, sortMode, now));
    }
    return groups;
  }, [
    jobs,
    ui.search,
    ui.showClosed,
    ui.showHidden,
    ui.quickFilter,
    ui.sortMode,
  ]);

  const trackStagesToShow = useMemo<Stage[]>(() => {
    const list: Stage[] = [...FUNNEL_STAGES];
    if (ui.showClosed && trackGroups.closed.length) list.push("closed");
    return list;
  }, [trackGroups, ui.showClosed]);

  const trackFlat = useMemo(
    () => trackStagesToShow.flatMap((stage) => trackGroups[stage]),
    [trackStagesToShow, trackGroups],
  );

  const decideCount = useMemo(
    () => jobs.filter((job) => stageForJob(job) === "decide").length,
    [jobs],
  );
  const trackCount = useMemo(
    () =>
      jobs.filter((job) => {
        const stage = stageForJob(job);
        return isTrackStage(stage) && stage !== "closed";
      }).length,
    [jobs],
  );

  const displayJobs = mode === "decide" ? decideJobs : trackFlat;

  function nextUntriagedIndexFrom(startIndex: number): number {
    for (let offset = 1; offset <= displayJobs.length; offset++) {
      const idx = (startIndex + offset) % displayJobs.length;
      const candidate = displayJobs[idx];
      if (!candidate) continue;
      if (mode === "track") return idx;
      const verdict = currentVerdict(candidate);
      const isNew = (candidate.discoveryStatus || "new") === "new";
      if (verdict === null || isNew) return idx;
    }
    if (displayJobs.length === 0) return -1;
    return (startIndex + 1) % displayJobs.length;
  }

  const autoAdvanceToken = ui.autoAdvanceToken;
  useEffect(() => {
    if (autoAdvanceToken === 0) return;
    if (!displayJobs.length) return;
    const currentIndex = Math.max(
      0,
      displayJobs.findIndex((j) => j.id === ui.selectedJobId),
    );
    const target = nextUntriagedIndexFrom(currentIndex);
    if (target >= 0 && displayJobs[target]) {
      ui.setSelectedJobId(displayJobs[target].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvanceToken]);

  useEffect(() => {
    if (!displayJobs.length) {
      if (ui.selectedJobId) ui.setSelectedJobId("");
      return;
    }
    if (!displayJobs.find((j) => j.id === ui.selectedJobId)) {
      ui.setSelectedJobId(displayJobs[0].id);
    }
  }, [displayJobs, ui.selectedJobId, ui]);

  const lastGRef = useRef<number>(0);
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (!displayJobs.length) return;

      const currentIndex = Math.max(
        0,
        displayJobs.findIndex((j) => j.id === ui.selectedJobId),
      );

      const move = (nextIndex: number) => {
        const clamped = Math.max(
          0,
          Math.min(displayJobs.length - 1, nextIndex),
        );
        ui.setSelectedJobId(displayJobs[clamped].id);
      };

      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          move(currentIndex + 1);
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          move(currentIndex - 1);
          break;
        case "g": {
          const now = Date.now();
          if (now - lastGRef.current < 500) {
            event.preventDefault();
            move(0);
            lastGRef.current = 0;
          } else {
            lastGRef.current = now;
          }
          break;
        }
        case "G":
          event.preventDefault();
          move(displayJobs.length - 1);
          break;
        case "Enter": {
          const first = document.querySelector<HTMLButtonElement>(
            "#activityPane-triage .verdict-btn",
          );
          if (first) {
            event.preventDefault();
            first.focus();
          }
          break;
        }
        default:
          break;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [displayJobs, ui]);

  const selectedJob =
    displayJobs.find((job) => job.id === ui.selectedJobId) ||
    jobs.find((job) => job.id === ui.selectedJobId) ||
    null;

  useEffect(() => {
    setSelectedSet((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(decideJobs.map((j) => j.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [decideJobs]);

  const toggleCheck = useCallback((id: string, checked: boolean) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const checkedJobs = useMemo(
    () => decideJobs.filter((job) => selectedSet.has(job.id)),
    [decideJobs, selectedSet],
  );

  const allChecked =
    decideJobs.length > 0 && checkedJobs.length === decideJobs.length;

  function toggleAll() {
    setSelectedSet((prev) => {
      if (prev.size === decideJobs.length && decideJobs.length > 0) {
        return new Set();
      }
      return new Set(decideJobs.map((j) => j.id));
    });
  }

  function bodyForBulk(action: BulkAction, job: Job): Record<string, unknown> {
    if (action === "not_a_fit") {
      return {
        discoveryStatus: "not_a_fit",
        applicationStatus: "rejected",
        interviewStatus: "closed",
      };
    }
    if (action === "posting_dead") {
      return { postingStatus: "dead" };
    }
    if (action === "rescore") {
      const rubric = pickRubric(rubricsQuery.data, job.lane);
      const score = calculateAutoScore(job, rubric);
      return {
        score,
        priorityTier: bucketForScore(score, rubric.thresholds),
      };
    }
    return {};
  }

  async function applyBulk(action: BulkAction) {
    if (!checkedJobs.length) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const job of checkedJobs) {
      const body = bodyForBulk(action, job);
      try {
        await patchJob.mutateAsync({ id: job.id, body });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkBusy(false);
    setBulkAction(null);
    setSelectedSet(new Set());
    const tone = fail > 0 ? "warn" : "ok";
    showToast(`${ok} updated${fail ? `, ${fail} failed` : ""}`, tone);
  }

  const quickDecision = useCallback(
    async (job: Job, kind: QuickDecision) => {
      if (!statusModel) return;
      const target =
        kind === "shortlist"
          ? "target"
          : kind === "apply"
            ? "applied"
            : "not_a_fit";
      const body = mapUnifiedStatusToModel(job, target, statusModel);
      try {
        await patchJob.mutateAsync({ id: job.id, body });
        const label =
          kind === "shortlist"
            ? "Shortlisted"
            : kind === "apply"
              ? "Applied"
              : "Skipped";
        showToast(
          `${label} — ${job.company}`,
          kind === "skip" ? "warn" : "ok",
        );
        ui.requestAutoAdvance();
      } catch {
        showToast("Update failed", "error");
      }
    },
    [statusModel, patchJob, ui],
  );

  const bulkLabel: Record<BulkAction, string> = {
    not_a_fit: "Mark not a fit",
    posting_dead: "Mark posting dead",
    rescore: "Re-score with current rubric",
  };

  const bulkBody: Record<BulkAction, string> = {
    not_a_fit:
      "These postings will be hidden from the default view, with discovery=not_a_fit, application=rejected, interview=closed.",
    posting_dead:
      "These postings will be flagged as dead. They stay in the pipeline but get filtered unless you opt in.",
    rescore:
      "Recompute the score and priority tier with the current rubric. No status changes.",
  };

  const hiddenClosedCount = ui.showClosed
    ? 0
    : jobs.filter((job) => job.postingStatus === "dead").length;
  const hiddenNotFitCount = ui.showHidden
    ? 0
    : jobs.filter((job) => job.discoveryStatus === "not_a_fit").length;

  return (
    <div className="grid h-full min-w-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Pipeline mode"
              value={mode}
              onChange={(next) => ui.setPipelineMode(next)}
              size="md"
              options={[
                { id: "decide", label: "Decide", count: decideCount },
                { id: "track", label: "Track", count: trackCount },
              ]}
            />
            <div className="ml-auto flex flex-wrap items-center gap-2 text-[10px]">
              {hiddenClosedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => ui.setShowClosed(true)}
                  className="min-h-0 border-0 bg-transparent p-0 font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {hiddenClosedCount} closed hidden
                </button>
              ) : null}
              {hiddenNotFitCount > 0 ? (
                <button
                  type="button"
                  onClick={() => ui.setShowHidden(true)}
                  className="min-h-0 border-0 bg-transparent p-0 font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {hiddenNotFitCount} not-fit hidden
                </button>
              ) : null}
            </div>
          </div>

          {mode === "decide" ? (
            <p className="text-xs text-muted-foreground">
              A shrinking queue of roles you haven&rsquo;t decided on yet.{" "}
              <span
                className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title="j/k move, Enter focuses verdict, g g top, G bottom"
              >
                <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd>{" "}
                nav · <kbd className="font-mono">1</kbd>–
                <kbd className="font-mono">4</kbd> verdict ·{" "}
                <kbd className="font-mono">?</kbd> shortcuts
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Everything you&rsquo;ve committed to, by stage. Oldest waits float
              to the top of <em>Applied</em>.
            </p>
          )}

          <PipelineToolbar />
        </div>

        <ScrollArea className="flex-1">
          <div className="px-4 py-3">
            {mode === "decide" ? (
              <DecideView
                jobs={decideJobs}
                selectedJobId={ui.selectedJobId}
                onSelect={(id) => ui.setSelectedJobId(id)}
                selectedSet={selectedSet}
                onCheckChange={toggleCheck}
                checkedJobs={checkedJobs}
                allChecked={allChecked}
                onToggleAll={toggleAll}
                onClearChecks={() => setSelectedSet(new Set())}
                onBulkAction={setBulkAction}
                bulkBusy={bulkBusy}
                isError={isError}
                isLoading={isLoading}
                error={jobsQuery.error}
                onRetry={() =>
                  queryClient.invalidateQueries({ queryKey: ["jobs"] })
                }
                onAddJob={() => ui.setAddJobOpen(true)}
                onDecision={quickDecision}
                hiddenCount={hiddenClosedCount + hiddenNotFitCount}
              />
            ) : (
              <TrackView
                groups={trackGroups}
                stagesToShow={trackStagesToShow}
                layout={ui.trackLayout}
                collapsed={ui.collapsedStages}
                onToggleStage={ui.toggleStage}
                onSetLayout={ui.setTrackLayout}
                selectedJobId={ui.selectedJobId}
                onSelect={(id) => ui.setSelectedJobId(id)}
                scoreOf={scoreOf}
                isError={isError}
                isLoading={isLoading}
                error={jobsQuery.error}
                onRetry={() =>
                  queryClient.invalidateQueries({ queryKey: ["jobs"] })
                }
                onAddJob={() => ui.setAddJobOpen(true)}
                showClosedAvailable={
                  !ui.showClosed && trackGroups.closed.length > 0
                }
                onShowClosed={() => ui.setShowClosed(true)}
                closedHiddenCount={trackGroups.closed.length}
              />
            )}

            {bulkAction ? (
              <div className="mt-3">
                <InlineConfirm
                  title={`${bulkLabel[bulkAction]} - ${checkedJobs.length} role${checkedJobs.length === 1 ? "" : "s"}`}
                  body={bulkBody[bulkAction]}
                  confirmLabel="Apply"
                  cancelLabel="Cancel"
                  busy={bulkBusy}
                  onConfirm={() => applyBulk(bulkAction)}
                  onCancel={() => setBulkAction(null)}
                />
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </div>

      <div className="min-h-0 overflow-hidden bg-card/30">
        <ActivityPanel job={selectedJob} statusModel={statusModel} />
      </div>
    </div>
  );
}

// ============================================================
// Decide view
// ============================================================

interface DecideViewProps {
  jobs: Job[];
  selectedJobId: string;
  onSelect: (id: string) => void;
  selectedSet: Set<string>;
  onCheckChange: (id: string, checked: boolean) => void;
  checkedJobs: Job[];
  allChecked: boolean;
  onToggleAll: () => void;
  onClearChecks: () => void;
  onBulkAction: (action: BulkAction) => void;
  bulkBusy: boolean;
  isError: boolean;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onAddJob: () => void;
  onDecision: (job: Job, kind: QuickDecision) => void;
  hiddenCount: number;
}

function DecideView(props: DecideViewProps) {
  const {
    jobs,
    selectedJobId,
    onSelect,
    selectedSet,
    onCheckChange,
    checkedJobs,
    allChecked,
    onToggleAll,
    onClearChecks,
    onBulkAction,
    bulkBusy,
    isError,
    isLoading,
    error,
    onRetry,
    onAddJob,
    onDecision,
    hiddenCount,
  } = props;

  return (
    <div className="flex flex-col gap-2">
      {checkedJobs.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2"
          role="region"
          aria-label="Bulk triage"
        >
          <span className="text-xs font-medium text-foreground">
            {checkedJobs.length} selected
          </span>
          {!allChecked ? (
            <Button variant="link" size="xs" onClick={onToggleAll}>
              Select all {jobs.length}
            </Button>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onBulkAction("not_a_fit")}
              disabled={bulkBusy}
            >
              Mark not a fit
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onBulkAction("posting_dead")}
              disabled={bulkBusy}
            >
              Mark dead
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onBulkAction("rescore")}
              disabled={bulkBusy}
            >
              Re-score
            </Button>
            <Button
              variant="link"
              size="xs"
              onClick={onClearChecks}
              disabled={bulkBusy}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div id="jobList" className="flex flex-col gap-1">
        {isError ? (
          <ErrorState
            title="We couldn't load your pipeline."
            error={error}
            onRetry={onRetry}
          />
        ) : isLoading ? (
          <SkeletonRows count={6} />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="Nothing to decide right now"
            body={
              hiddenCount > 0
                ? "Some postings are hidden by your filters. Bring them back, or add a new role."
                : "Every uploaded role has been triaged. Switch to Track to see what's in flight, or add more roles."
            }
            actions={<Button onClick={onAddJob}>Add job</Button>}
          />
        ) : (
          jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              isSelected={job.id === selectedJobId}
              onSelect={onSelect}
              showCheckbox
              isChecked={selectedSet.has(job.id)}
              onCheckChange={onCheckChange}
              trailing={
                <div className="flex items-center gap-2.5 text-[11px] leading-none">
                  <button
                    type="button"
                    onClick={() => onDecision(job, "shortlist")}
                    title="Decide to pursue (moves to Track)"
                    className="min-h-0 border-0 bg-transparent p-0 font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    Shortlist
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecision(job, "skip")}
                    title="Not a fit (hides it)"
                    className="min-h-0 border-0 bg-transparent p-0 font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecision(job, "apply")}
                    title="Mark applied (moves to Track)"
                    className="min-h-0 border-0 bg-transparent p-0 font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    Apply
                  </button>
                </div>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// Track view
// ============================================================

interface TrackViewProps {
  groups: Record<Stage, Job[]>;
  stagesToShow: Stage[];
  layout: "sections" | "table";
  collapsed: Set<string>;
  onToggleStage: (key: string) => void;
  onSetLayout: (layout: "sections" | "table") => void;
  selectedJobId: string;
  onSelect: (id: string) => void;
  scoreOf: (job: Job) => number;
  isError: boolean;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onAddJob: () => void;
  showClosedAvailable: boolean;
  onShowClosed: () => void;
  closedHiddenCount: number;
}

function TrackView(props: TrackViewProps) {
  const {
    groups,
    stagesToShow,
    layout,
    collapsed,
    onToggleStage,
    onSetLayout,
    selectedJobId,
    onSelect,
    scoreOf,
    isError,
    isLoading,
    error,
    onRetry,
    onAddJob,
    showClosedAvailable,
    onShowClosed,
    closedHiddenCount,
  } = props;

  const totalTracked = FUNNEL_STAGES.reduce(
    (sum, stage) => sum + groups[stage].length,
    0,
  );

  if (isError) {
    return (
      <ErrorState
        title="We couldn't load your pipeline."
        error={error}
        onRetry={onRetry}
      />
    );
  }
  if (isLoading) {
    return <SkeletonRows count={6} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1.5"
        role="list"
        aria-label="Pipeline funnel"
      >
        {FUNNEL_STAGES.map((stage, index) => (
          <button
            key={stage}
            type="button"
            role="listitem"
            onClick={() => {
              if (layout === "table") onSetLayout("sections");
              if (collapsed.has(stage)) onToggleStage(stage);
              const first = groups[stage][0];
              if (first) onSelect(first.id);
            }}
            title={`Jump to ${STAGE_SHORT_LABEL[stage]}`}
            className="group inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {groups[stage].length}
            </span>
            <span>{STAGE_SHORT_LABEL[stage]}</span>
            {index < FUNNEL_STAGES.length - 1 ? (
              <ChevronRight
                className="size-2.5 text-muted-foreground/50"
                aria-hidden="true"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {totalTracked} role{totalTracked === 1 ? "" : "s"} in flight
        </span>
        <div className="ml-auto flex items-center gap-2">
          {showClosedAvailable ? (
            <button
              type="button"
              onClick={onShowClosed}
              className="min-h-0 border-0 bg-transparent p-0 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {closedHiddenCount} closed hidden
            </button>
          ) : null}
          <SegmentedControl
            ariaLabel="Track layout"
            value={layout}
            onChange={(next) => onSetLayout(next)}
            size="sm"
            options={[
              { id: "sections", label: "Sections", icon: LayoutGrid },
              { id: "table", label: "Table", icon: TableIcon },
            ]}
          />
        </div>
      </div>

      {totalTracked === 0 && groups.closed.length === 0 ? (
        <EmptyState
          title="Nothing in flight yet"
          body="Shortlist or apply to roles in Decide and they'll show up here by stage."
          actions={<Button onClick={onAddJob}>Add job</Button>}
        />
      ) : layout === "table" ? (
        <TrackTable
          groups={groups}
          stagesToShow={stagesToShow}
          selectedJobId={selectedJobId}
          onSelect={onSelect}
          scoreOf={scoreOf}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {stagesToShow.map((stage) => {
            const list = groups[stage];
            if (!list.length) return null;
            const isCollapsed = collapsed.has(stage);
            const meta = STAGE_META[stage];
            return (
              <section
                key={stage}
                className="overflow-hidden rounded-lg border border-border bg-card/40"
              >
                <button
                  type="button"
                  onClick={() => onToggleStage(stage)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent/40"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-foreground">
                    {meta.label}
                  </span>
                  <Badge variant="secondary" className="h-5">
                    {list.length}
                  </Badge>
                  {meta.hint ? (
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {meta.hint}
                    </span>
                  ) : null}
                </button>
                {!isCollapsed ? (
                  <div className="flex flex-col gap-0.5 border-t border-border px-2 py-1.5">
                    {list.map((job) => (
                      <JobRow
                        key={job.id}
                        job={job}
                        isSelected={job.id === selectedJobId}
                        onSelect={onSelect}
                        variant="track"
                        meta={
                          <span className="text-muted-foreground">
                            {activityMeta(job)}
                          </span>
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TrackTableProps {
  groups: Record<Stage, Job[]>;
  stagesToShow: Stage[];
  selectedJobId: string;
  onSelect: (id: string) => void;
  scoreOf: (job: Job) => number;
}

function TrackTable({
  groups,
  stagesToShow,
  selectedJobId,
  onSelect,
  scoreOf,
}: TrackTableProps) {
  const rows = stagesToShow.flatMap((stage) =>
    groups[stage].map((job) => ({ job, stage })),
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Company</th>
            <th className="px-2 py-1.5 text-left font-medium">Title</th>
            <th className="px-2 py-1.5 text-left font-medium">Score</th>
            <th className="px-2 py-1.5 text-left font-medium">Stage</th>
            <th className="px-2 py-1.5 text-left font-medium">Applied</th>
            <th className="px-2 py-1.5 text-left font-medium">Days</th>
            <th className="px-2 py-1.5 text-left font-medium">Next action</th>
            <th className="px-2 py-1.5 text-left font-medium">Posting</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ job, stage }) => {
            const score = scoreOf(job);
            const risk = scoreRisk(score);
            const appliedDays = daysSince(job.appliedAt);
            const isDead = job.postingStatus === "dead";
            const isSelected = job.id === selectedJobId;
            return (
              <tr
                key={job.id}
                className={cn(
                  "border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/30",
                  isSelected && "bg-accent",
                  isDead && "opacity-70",
                )}
                onClick={() => onSelect(job.id)}
                tabIndex={0}
                aria-selected={isSelected}
                aria-label={`${job.company} — ${job.title}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(job.id);
                  }
                }}
              >
                <td className="px-2 py-1.5 font-medium text-foreground">
                  {job.company}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{job.title}</td>
                <td className="px-2 py-1.5">
                  <StatusPill
                    tone={scoreRiskTone(risk.className)}
                    numeric
                    glyph={risk.glyph}
                    aria-label={`Score ${score} of 100, ${risk.label}`}
                  >
                    {score}
                  </StatusPill>
                </td>
                <td className="px-2 py-1.5">
                  <Badge variant="secondary" className="h-5">
                    {STAGE_SHORT_LABEL[stage]}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {job.appliedAt || "—"}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {appliedDays === null
                    ? "—"
                    : appliedDays === 0
                      ? "today"
                      : `${appliedDays}d`}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {job.nextAction || "—"}
                </td>
                <td className="px-2 py-1.5">
                  {isDead ? (
                    <Badge variant="destructive" className="h-5">
                      Closed
                    </Badge>
                  ) : job.postingStatus === "live" ? (
                    <Badge variant="success" className="h-5">
                      Live
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
