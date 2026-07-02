import { useMemo } from "react";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  MessageSquare,
  Sparkles,
  StickyNote,
  UserPlus,
  XCircle,
} from "lucide-react";

import type { Job } from "../../types";
import {
  useAddEvent,
  useContacts,
  useEvents,
  useNotes,
  usePatchJob,
} from "../../hooks/queries";
import { useUiStore } from "../../store/ui";
import { showToast } from "../../lib/toast";
import { STAGE_SHORT_LABEL, daysSince, stageForJob } from "../../lib/stages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface Props {
  job: Job;
  onRequestReject: () => void;
}

const SYSTEM_EVENT_TYPES = new Set([
  "job_updated",
  "updated",
  "posting_verified",
]);

const EVENT_LABELS: Record<string, string> = {
  job_added: "Job added",
  application_submitted: "Application submitted",
  outreach_sent: "Outreach sent",
  followup_sent: "Follow-up sent",
  recruiter_reply: "Recruiter replied",
  screen_scheduled: "Screen scheduled",
  screen_done: "Screen completed",
  interview_scheduled: "Interview scheduled",
  interview_done: "Interview completed",
  offer_received: "Offer received",
  application_rejected: "Application rejected",
  application_closed: "Application closed",
  posting_verified: "Posting verified",
  job_updated: "Job updated",
  updated: "Job updated",
};

function humanizeEventLabel(eventType: string): string {
  if (EVENT_LABELS[eventType]) return EVENT_LABELS[eventType];
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface RawEvent {
  id?: string;
  event_type: string;
  event_date: string;
  details?: string;
  created_at?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type DueTone = "danger" | "warn" | "ok";

function formatDueLabel(
  dueDate?: string,
): { text: string; tone: DueTone } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (!Number.isFinite(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diff = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  if (diff < -1) return { text: `${Math.abs(diff)} days overdue`, tone: "danger" };
  if (diff === -1) return { text: "due yesterday", tone: "danger" };
  if (diff === 0) return { text: "due today", tone: "warn" };
  if (diff === 1) return { text: "due tomorrow", tone: "ok" };
  return { text: `due in ${diff} days`, tone: "ok" };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function PostingLabel(status: string | undefined) {
  if (status === "live") return "Live";
  if (status === "dead") return "Closed";
  return "Unknown";
}

export function SummaryPanel({ job, onRequestReject }: Props) {
  const setActivityTab = useUiStore((s) => s.setActivityTab);
  const addEvent = useAddEvent(job.id);
  const patchJob = usePatchJob();
  const { data: events = [] } = useEvents(job.id);
  const { data: notes = [] } = useNotes(job.id);
  const { data: contacts = [] } = useContacts(job.id);

  const stage = stageForJob(job);
  const appliedDays = daysSince(job.appliedAt);
  const dueLabel = formatDueLabel(job.dueDate);
  const isClosedStage = stage === "closed";
  const isDecideStage = stage === "decide";

  const recentMilestones = useMemo(() => {
    const filtered = (events as RawEvent[]).filter(
      (event) => !SYSTEM_EVENT_TYPES.has(event.event_type),
    );
    return filtered.slice(0, 4);
  }, [events]);

  const lastMilestone = recentMilestones[0] || null;

  const summary = (job.summary || "").trim();
  const keywords = Array.isArray(job.keywords)
    ? job.keywords.filter((kw) => typeof kw === "string" && kw.trim().length > 0)
    : [];
  const fitHooks = Array.isArray(job.aiAnalysis?.fitHooks)
    ? job.aiAnalysis!.fitHooks!.filter(Boolean)
    : [];
  const risks = Array.isArray(job.aiAnalysis?.risks)
    ? job.aiAnalysis!.risks!.filter(Boolean)
    : [];
  const aiRationale = (job.aiAnalysis?.rationale || "").trim();
  const hasAi = aiRationale.length > 0 || fitHooks.length > 0 || risks.length > 0;

  async function logEvent(eventType: string, details?: string) {
    try {
      await addEvent.mutateAsync({
        eventType,
        eventDate: todayIso(),
        details: details || "",
      });
      showToast(`Logged: ${humanizeEventLabel(eventType)}`, "ok");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to log event";
      showToast(message, "error");
    }
  }

  async function transition(
    interviewStatus: string | undefined,
    eventType: string,
    label: string,
  ) {
    try {
      if (interviewStatus) {
        await patchJob.mutateAsync({
          id: job.id,
          body: { interviewStatus },
        });
      }
      await addEvent.mutateAsync({
        eventType,
        eventDate: todayIso(),
        details: "",
      });
      showToast(`${label} logged`, "ok");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unable to log ${label}`;
      showToast(message, "error");
    }
  }

  const dueToneClass: Record<DueTone, string> = {
    danger: "bg-destructive/10 text-destructive border-destructive/30",
    warn: "bg-warning/15 text-warning-foreground border-warning/40",
    ok: "bg-success/10 text-success-foreground border-success/30",
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Now / next action */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3">
        <SectionTitle>Now</SectionTitle>
        {job.nextAction ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 text-sm font-medium text-foreground">
              {job.nextAction}
            </p>
            {dueLabel ? (
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium",
                  dueToneClass[dueLabel.tone],
                )}
              >
                {dueLabel.text}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No next action recorded.{" "}
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => setActivityTab("triage")}
            >
              Set one in Triage
            </button>
            .
          </p>
        )}
      </section>

      {/* Job summary (JD content) */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Job summary</SectionTitle>
          {summary ? (
            <button
              type="button"
              onClick={() => setActivityTab("llm")}
              className="inline-flex min-h-0 items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-medium leading-none text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Sparkles className="size-3" />
              Re-extract with AI
            </button>
          ) : null}
        </div>
        {summary ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {summary}
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card/30 p-3">
            <p className="text-sm text-muted-foreground">
              No job-description summary on file yet.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setActivityTab("llm")}
                className="gap-1"
              >
                <Sparkles className="size-3" />
                Generate with AI
              </Button>
              {job.roleUrl ? (
                <Button
                  asChild
                  variant="ghost"
                  size="xs"
                  className="gap-1 text-muted-foreground"
                >
                  <a
                    href={job.roleUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open job posting"
                  >
                    <ExternalLink className="size-3" />
                    Open posting
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {keywords.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionTitle>Keywords</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {keywords.slice(0, 24).map((kw) => (
              <Badge key={kw} variant="secondary" className="h-5">
                {kw}
              </Badge>
            ))}
            {keywords.length > 24 ? (
              <span className="text-xs text-muted-foreground">
                +{keywords.length - 24} more
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasAi ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3">
          <SectionTitle>AI rationale</SectionTitle>
          {aiRationale ? (
            <p className="text-sm leading-relaxed text-foreground">
              {aiRationale}
            </p>
          ) : null}
          {fitHooks.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Fit hooks
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">
                {fitHooks.map((hook, idx) => (
                  <li key={idx}>{hook}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {risks.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Risks</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">
                {risks.map((risk, idx) => (
                  <li key={idx}>{risk}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Application + posting facts */}
      <section className="flex flex-col gap-2">
        <SectionTitle>Application</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Stage
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {STAGE_SHORT_LABEL[stage]}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Applied
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {job.appliedAt ? (
                <>
                  {job.appliedAt}
                  {appliedDays !== null ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      · {appliedDays === 0 ? "today" : `${appliedDays}d ago`}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">Not applied yet</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Posting
            </dt>
            <dd className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span>{PostingLabel(job.postingStatus)}</span>
              {job.needsVerification ? (
                <Badge variant="warning" className="h-5">
                  Re-verify
                </Badge>
              ) : null}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Source
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {job.source || (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Lane
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {job.lane || (
                <span className="text-muted-foreground">Unset</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Contacts
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {contacts.length > 0 ? (
                `${contacts.length} on file`
              ) : (
                <span className="text-muted-foreground">None yet</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* Quick actions — most useful for tracked jobs but available always */}
      {!isDecideStage ? (
        <section className="flex flex-col gap-2">
          <SectionTitle>Quick actions</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="xs"
              onClick={() => logEvent("followup_sent")}
              disabled={isClosedStage}
              className="gap-1"
            >
              <CalendarClock className="size-3" />
              Followed up
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => logEvent("recruiter_reply")}
              disabled={isClosedStage}
              className="gap-1"
            >
              <MessageSquare className="size-3" />
              Recruiter replied
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                transition(
                  "screen_scheduled",
                  "screen_scheduled",
                  "Screen scheduled",
                )
              }
              disabled={isClosedStage}
            >
              Screen scheduled
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                transition(
                  "interview_scheduled",
                  "interview_scheduled",
                  "Interview scheduled",
                )
              }
              disabled={isClosedStage}
            >
              Interview scheduled
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setActivityTab("notes")}
              className="gap-1"
            >
              <StickyNote className="size-3" />
              Add note
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setActivityTab("contacts")}
              className="gap-1"
            >
              <UserPlus className="size-3" />
              Add contact
            </Button>
            <Button
              variant="destructive"
              size="xs"
              onClick={onRequestReject}
              disabled={isClosedStage}
              className="gap-1"
            >
              <XCircle className="size-3" />
              Mark rejected
            </Button>
          </div>
        </section>
      ) : null}

      {/* Recent activity */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Recent activity</SectionTitle>
        <button
          type="button"
          onClick={() => setActivityTab("events")}
          className="min-h-0 border-0 bg-transparent p-0 text-[11px] font-medium leading-none text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          View all
        </button>
        </div>
        {recentMilestones.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {recentMilestones.map((event) => (
              <li
                key={event.id || `${event.event_date}-${event.event_type}`}
                className="flex items-center justify-between rounded-md border border-border bg-card/40 px-2.5 py-1.5"
              >
                <span className="text-sm text-foreground">
                  {humanizeEventLabel(event.event_type)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {event.event_date}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No meaningful activity yet.
            {!isDecideStage
              ? " Log a follow-up or recruiter reply above."
              : " Move this role through Triage to start the timeline."}
          </p>
        )}
      </section>

      {notes.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionTitle>Notes preview</SectionTitle>
            <Button
              variant="link"
              size="xs"
              onClick={() => setActivityTab("notes")}
              className="h-auto gap-1 px-0 text-[10px] leading-none"
            >
              <FileText className="size-3" />
              Open notes
            </Button>
          </div>
          <p className="rounded-md border border-border bg-card/40 px-2.5 py-2 text-sm text-foreground">
            {(notes[0]?.note || "").slice(0, 220)}
            {(notes[0]?.note || "").length > 220 ? "..." : ""}
          </p>
        </section>
      ) : null}

      {lastMilestone && lastMilestone.details ? (
        <p className="text-xs text-muted-foreground">
          Latest detail: {lastMilestone.details}
        </p>
      ) : null}
    </div>
  );
}
