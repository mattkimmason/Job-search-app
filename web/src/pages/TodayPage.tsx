import { useUiStore } from "../store/ui";
import { useJobs, useReminders, useRubrics } from "../hooks/queries";
import { useNavigate } from "react-router-dom";
import type { Job, Reminder } from "../types";
import { EmptyState, ErrorState, SkeletonCards } from "../components/States";
import { useQueryClient } from "@tanstack/react-query";
import { calculateAutoScore, pickRubric } from "../lib/scoring";
import { currentVerdict } from "../lib/verdicts";
import type { RubricConfig } from "../types";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Inbox,
  LineChart,
  Phone,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell, SectionHeader } from "@/components/patterns";
import { cn } from "@/lib/cn";

function isTriageEligible(job: Job): boolean {
  if (job.discoveryStatus === "not_a_fit") return false;
  if (
    job.applicationStatus === "applied" ||
    job.applicationStatus === "rejected"
  )
    return false;
  if (job.interviewStatus === "closed") return false;
  if (job.postingStatus === "dead") return false;
  if (
    job.applicationStatus !== "not_started" &&
    job.applicationStatus !== "in_progress"
  )
    return false;
  return true;
}

function jobsAwaitingTriage(jobs: Job[]) {
  return jobs.filter((job) => {
    if (!isTriageEligible(job)) return false;
    if (currentVerdict(job) !== null) return false;
    return true;
  });
}

function jobsBelowFloor(jobs: Job[], rubricConfig: RubricConfig | undefined) {
  return jobs.filter((job) => {
    if (job.discoveryStatus === "not_a_fit") return false;
    if (job.postingStatus === "dead") return false;
    const rubric = pickRubric(rubricConfig, job.lane);
    const score = calculateAutoScore(job, rubric);
    return score < rubric.thresholds.selective;
  });
}

function jobsWithUpcomingDueDates(jobs: Job[]) {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);
  const horizonIso = horizon.toISOString().slice(0, 10);
  return jobs
    .filter(
      (job) => job.dueDate && job.dueDate >= today && job.dueDate <= horizonIso,
    )
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
}

interface HubItem {
  jobId?: string;
  label: string;
}

type Tone = "high" | "medium" | "low";

interface HubCard {
  key: string;
  title: string;
  tone: Tone;
  count: number;
  items: HubItem[];
  emptyMsg: string;
  icon: typeof Inbox;
}

const toneClasses: Record<Tone, string> = {
  high: "border-destructive/40 bg-destructive/[0.04]",
  medium: "border-warning/40 bg-warning/[0.04]",
  low: "border-border bg-card",
};

const toneIconClasses: Record<Tone, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-warning/20 text-warning-foreground",
  low: "bg-secondary text-muted-foreground",
};

const toneBadgeVariant: Record<Tone, "destructive" | "warning" | "secondary"> = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
};

export function TodayPage() {
  const showStartHere = useUiStore((s) => s.showStartHere);
  const setShowStartHere = useUiStore((s) => s.setShowStartHere);
  const setSelectedJobId = useUiStore((s) => s.setSelectedJobId);
  const setAddJobOpen = useUiStore((s) => s.setAddJobOpen);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jobsQuery = useJobs({});
  const remindersQuery = useReminders();
  const rubricsQuery = useRubrics();
  const jobs = jobsQuery.data ?? [];
  const reminders = remindersQuery.data ?? [];
  const rubricConfig = rubricsQuery.data;
  const isLoading =
    (jobsQuery.isLoading && !jobsQuery.data) ||
    (remindersQuery.isLoading && !remindersQuery.data);
  const isError = jobsQuery.isError || remindersQuery.isError;
  const loadError = jobsQuery.error ?? remindersQuery.error;

  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const highReminders = reminders.filter((item) => item.severity === "high");
  const mediumReminders = reminders.filter(
    (item) => item.severity === "medium",
  );
  const lowNonVerify = reminders.filter(
    (item) => item.severity === "low" && item.type !== "verify_posting",
  );
  const verifyReminders = reminders.filter(
    (item) => item.type === "verify_posting",
  );
  const toScore = jobsAwaitingTriage(jobs);
  const belowFloor = jobsBelowFloor(jobs, rubricConfig);
  const upcoming = jobsWithUpcomingDueDates(jobs);
  const defaultRubric = pickRubric(rubricConfig);
  const floorThreshold = defaultRubric.thresholds.selective;

  const toLabel = (r: Reminder) => `${r.detail} - ${r.title}`;

  const cards: HubCard[] = [
    {
      key: "outreach",
      title: "Outreach due",
      tone: "high",
      icon: Phone,
      count: highReminders.length,
      items: highReminders.slice(0, 4).map((r) => ({
        jobId: r.jobId,
        label: toLabel(r),
      })),
      emptyMsg: "No urgent outreach right now.",
    },
    {
      key: "followups",
      title: "Follow-ups + overdue",
      tone: "medium",
      icon: Clock,
      count: mediumReminders.length + lowNonVerify.length,
      items: [...mediumReminders, ...lowNonVerify].slice(0, 4).map((r) => ({
        jobId: r.jobId,
        label: toLabel(r),
      })),
      emptyMsg: "Nothing overdue.",
    },
    {
      key: "triage",
      title: "Awaiting triage",
      tone: "medium",
      icon: Inbox,
      count: toScore.length,
      items: toScore.slice(0, 4).map((j) => {
        const rubric = pickRubric(rubricConfig, j.lane);
        const score = calculateAutoScore(j, rubric);
        return {
          jobId: j.id,
          label: `${j.company} - ${j.title} (score ${score})`,
        };
      }),
      emptyMsg: "Every active role is triaged.",
    },
    {
      key: "below_floor",
      title: `Below score floor (${floorThreshold}+)`,
      tone: "low",
      icon: AlertTriangle,
      count: belowFloor.length,
      items: belowFloor.slice(0, 4).map((j) => {
        const rubric = pickRubric(rubricConfig, j.lane);
        const score = calculateAutoScore(j, rubric);
        return {
          jobId: j.id,
          label: `${j.company} - ${j.title} (score ${score})`,
        };
      }),
      emptyMsg: "No roles below your score floor.",
    },
    {
      key: "reverify",
      title: "Postings to re-verify",
      tone: "low",
      icon: RefreshCw,
      count: verifyReminders.length,
      items: verifyReminders.slice(0, 4).map((r) => ({
        jobId: r.jobId,
        label: r.detail,
      })),
      emptyMsg: "All postings recently verified.",
    },
    {
      key: "due",
      title: "Due this week",
      tone: "low",
      icon: LineChart,
      count: upcoming.length,
      items: upcoming.slice(0, 4).map((j) => ({
        jobId: j.id,
        label: `${j.company} - ${j.title} (${j.dueDate})`,
      })),
      emptyMsg: "No upcoming due dates this week.",
    },
  ];

  const totalAttention = cards.reduce((sum, card) => sum + card.count, 0);

  const tonePriority: Record<Tone, number> = { high: 0, medium: 1, low: 2 };
  const heroIndex = (() => {
    const candidates = cards
      .map((card, index) => ({ card, index }))
      .filter((entry) => entry.card.count > 0)
      .sort((a, b) => {
        const toneDiff =
          tonePriority[a.card.tone] - tonePriority[b.card.tone];
        if (toneDiff !== 0) return toneDiff;
        return b.card.count - a.card.count;
      });
    return candidates[0]?.index ?? -1;
  })();

  function goToJob(jobId?: string) {
    if (!jobId) return;
    setSelectedJobId(jobId);
    navigate("/pipeline");
  }

  return (
    <PageShell>
      <SectionHeader
        title="Today"
        description="Your most important moves right now. Limited to keep focus."
        actions={
          <Badge variant="secondary" className="h-7 px-3 text-xs">
            {dateLabel}
          </Badge>
        }
      />

        {showStartHere ? (
          <Card className="border-primary/30 bg-primary/[0.04]">
            <CardHeader className="flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <CardTitle>Start here</CardTitle>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setShowStartHere(false)}
                aria-label="Hide start here"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>This app helps you run a focused job search in five loops:</p>
              <ol className="ml-5 list-decimal space-y-1.5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Add</span>{" "}
                  target roles (Manual, Markdown import, or Lookup).
                </li>
                <li>
                  <span className="font-medium text-foreground">Score</span>{" "}
                  each role against your rubric in Pipeline.
                </li>
                <li>
                  <span className="font-medium text-foreground">Apply</span>{" "}
                  and log the application date.
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    Follow up
                  </span>{" "}
                  when reminders surface here on Today.
                </li>
                <li>
                  <span className="font-medium text-foreground">Track</span>{" "}
                  outcomes in Insights and adjust strategy.
                </li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Reopen this any time with the Help button up top.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {isError ? (
          <ErrorState
            title="We couldn't load Today."
            error={loadError}
            onRetry={() => {
              queryClient.invalidateQueries({ queryKey: ["jobs"] });
              queryClient.invalidateQueries({ queryKey: ["reminders"] });
            }}
          />
        ) : isLoading ? (
          <SkeletonCards count={6} />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No roles tracked yet."
            body="Add your first target role and Today will surface the next move."
            actions={
              <Button onClick={() => setAddJobOpen(true)}>Add job</Button>
            }
          />
        ) : totalAttention === 0 ? (
          <Card className="border-success/30 bg-success/[0.04]">
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-success/15 text-success">
                  <CheckCircle2 className="size-5" />
                </div>
                <CardTitle>All clear</CardTitle>
              </div>
              <span className="text-3xl font-semibold tabular-nums text-success">
                0
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Nothing demands your attention right now. Use Pipeline to keep
                moving, or add a new role.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, index) => {
              const isHero = index === heroIndex;
              const isEmpty = card.count === 0;
              const Icon = card.icon;
              return (
                <Card
                  key={card.key}
                  className={cn(
                    "flex flex-col gap-3 transition-colors",
                    toneClasses[card.tone],
                    isHero && "sm:col-span-2",
                    isEmpty && "opacity-70",
                  )}
                >
                  <CardHeader className="flex-row items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          toneIconClasses[card.tone],
                        )}
                      >
                        <Icon className="size-4.5" />
                      </div>
                      <CardTitle className="truncate leading-snug">
                        {card.title}
                      </CardTitle>
                    </div>
                    <div
                      className={cn(
                        "text-2xl font-semibold tabular-nums leading-none",
                        isHero ? "text-3xl" : "",
                        card.tone === "high" && "text-destructive",
                        card.tone === "medium" && "text-warning-foreground",
                        card.tone === "low" && "text-foreground",
                        isEmpty && "text-muted-foreground",
                      )}
                    >
                      {card.count}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {card.items.length ? (
                      <ul className="flex flex-col">
                        {card.items.map((item, itemIndex) => (
                          <li
                            key={`${card.key}-${itemIndex}`}
                            className="border-b border-border last:border-b-0"
                          >
                            {item.jobId ? (
                              <button
                                type="button"
                                onClick={() => goToJob(item.jobId)}
                                className="group flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm leading-snug text-foreground transition-colors hover:text-primary"
                              >
                                <span className="truncate">{item.label}</span>
                                <ArrowRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                              </button>
                            ) : (
                              <span className="block py-2.5 text-sm leading-snug text-muted-foreground">
                                {item.label}
                              </span>
                            )}
                          </li>
                        ))}
                        {card.count > card.items.length ? (
                          <li className="pt-2 text-xs text-muted-foreground">
                            +{card.count - card.items.length} more
                          </li>
                        ) : null}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {card.emptyMsg}
                      </p>
                    )}
                  </CardContent>
                  {isHero && card.count > 0 ? (
                    <div className="px-4 pb-1">
                      <Badge
                        variant={toneBadgeVariant[card.tone]}
                        className="h-5 px-2 text-[10px] uppercase tracking-wider"
                      >
                        Top focus
                      </Badge>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
    </PageShell>
  );
}
