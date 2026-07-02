import type { ReactNode } from "react";
import type { Job } from "../types";
import {
  bucketForScore,
  calculateScoreBreakdown,
  pickRubric,
  scoreRisk,
} from "../lib/scoring";
import { getUnifiedStatus } from "../lib/format";
import { STAGE_SHORT_LABEL, daysSince, stageForJob } from "../lib/stages";
import { VERDICT_LABELS } from "../lib/verdicts";
import { useRubrics } from "../hooks/queries";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import {
  StatusPill,
  scoreRiskTone,
  verdictToneKey,
} from "@/components/patterns";

export type JobRowVariant = "decide" | "track";

interface Props {
  job: Job;
  isSelected: boolean;
  onSelect: (id: string) => void;
  isChecked?: boolean;
  onCheckChange?: (id: string, checked: boolean) => void;
  showCheckbox?: boolean;
  trailing?: ReactNode;
  meta?: ReactNode;
  variant?: JobRowVariant;
}

function formatDueLabel(dueDate?: string): string | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (!Number.isFinite(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diff = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  if (diff < -1) return `${Math.abs(diff)}d overdue`;
  if (diff === -1) return "due yesterday";
  if (diff === 0) return "due today";
  if (diff === 1) return "due tomorrow";
  return `due in ${diff}d`;
}

export function JobRow({
  job,
  isSelected,
  onSelect,
  isChecked = false,
  onCheckChange,
  showCheckbox = false,
  trailing,
  meta,
  variant = "decide",
}: Props) {
  const rubricsQuery = useRubrics();
  const rubric = pickRubric(rubricsQuery.data, job.lane);
  const score = calculateScoreBreakdown(job, rubric).total;
  const risk = scoreRisk(score, rubric.thresholds);
  const tier = bucketForScore(score, rubric.thresholds);
  const statusPill = getUnifiedStatus(job).replace(/_/g, " ");
  const showLivenessPill =
    job.postingStatus === "dead" || job.postingStatus === "live";
  const verdict = job.discoveryStatus === "not_a_fit" ? "not_a_fit" : tier;

  const isTrack = variant === "track";
  const stage = stageForJob(job);
  const daysApplied = daysSince(job.appliedAt);
  const dueLabel = formatDueLabel(job.dueDate);
  const isDead = job.postingStatus === "dead";

  return (
    <article
      className={cn(
        "group/jobrow flex w-full min-w-0 cursor-pointer flex-wrap items-start gap-x-2.5 gap-y-1.5 rounded-lg border border-transparent px-3 py-2 text-left transition-colors outline-none",
        "hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/40",
        isSelected
          ? "border-primary/30 bg-accent"
          : "border-border/0 hover:border-border/40",
        isDead && "opacity-60",
      )}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("input[type='checkbox']")) return;
        onSelect(isSelected ? "" : job.id);
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${job.company} — ${job.title}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(isSelected ? "" : job.id);
        }
      }}
    >
      {showCheckbox && onCheckChange ? (
        <label
          className="flex shrink-0 items-center pt-1"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(event) => onCheckChange(job.id, event.target.checked)}
            aria-label={`Select ${job.company} ${job.title}`}
            className="size-4 cursor-pointer rounded border border-border bg-background text-primary accent-primary"
          />
        </label>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {job.company} <span className="text-muted-foreground">—</span>{" "}
          {job.title}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {isTrack ? (
            <>
              {job.appliedAt ? (
                <>
                  applied {job.appliedAt}
                  {daysApplied !== null
                    ? ` · ${daysApplied === 0 ? "today" : `${daysApplied}d ago`}`
                    : ""}
                </>
              ) : (
                <>{job.location || "Location unknown"}</>
              )}
              {job.nextAction ? ` · next: ${job.nextAction}` : ""}
              {dueLabel ? ` · ${dueLabel}` : ""}
            </>
          ) : (
            <>
              {job.location || "Location unknown"}
              {job.salary?.label ? ` · ${job.salary.label}` : ""}
              {job.dueDate ? ` · due ${job.dueDate}` : ""}
            </>
          )}
        </div>
        {!isTrack && job.summary ? (
          <p
            className={cn(
              "text-xs text-muted-foreground/80",
              isSelected ? "line-clamp-3" : "line-clamp-1",
            )}
            title={job.summary}
          >
            {job.summary}
          </p>
        ) : null}
        {meta ? (
          <div className="text-xs text-muted-foreground">{meta}</div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {isTrack ? (
          <>
            <Badge variant="secondary" className="h-5">
              {STAGE_SHORT_LABEL[stage]}
            </Badge>
            {job.postingStatus === "dead" ? (
              <Badge variant="destructive" className="h-5">
                Closed
              </Badge>
            ) : null}
            {job.needsVerification ? (
              <Badge variant="warning" className="h-5">
                Re-verify
              </Badge>
            ) : null}
            {!job.nextAction ? (
              <Badge variant="ghost" className="h-5">
                no next action
              </Badge>
            ) : null}
          </>
        ) : (
          <>
            <StatusPill
              tone={scoreRiskTone(risk.className)}
              numeric
              glyph={risk.glyph}
              title={`${risk.label} · ${rubric.name}`}
              aria-label={`Score ${score} of 100, ${risk.label}`}
            >
              {score}
            </StatusPill>
            <StatusPill
              tone={verdictToneKey(verdict)}
              title="Current verdict"
            >
              {VERDICT_LABELS[verdict as keyof typeof VERDICT_LABELS] ??
                verdict}
            </StatusPill>
            <Badge
              variant="secondary"
              className="h-5"
              title="Pipeline status"
            >
              {statusPill}
            </Badge>
            {showLivenessPill ? (
              <Badge
                variant={job.postingStatus === "live" ? "success" : "destructive"}
                className="h-5"
              >
                {job.postingStatus === "live" ? "Live" : "Closed"}
              </Badge>
            ) : null}
            {job.needsVerification ? (
              <Badge variant="warning" className="h-5">
                Re-verify
              </Badge>
            ) : null}
            {Number.isFinite(job.aiScore) && job.aiScore !== null ? (
              <Badge
                variant="outline"
                className="h-5 border-primary/40 text-primary"
                title="AI match analysis"
              >
                AI {job.aiScore}
              </Badge>
            ) : null}
          </>
        )}
      </div>

      {trailing ? (
        <div
          className="ml-1 flex shrink-0 items-center gap-0.5"
          onClick={(event) => event.stopPropagation()}
        >
          {trailing}
        </div>
      ) : null}
    </article>
  );
}
