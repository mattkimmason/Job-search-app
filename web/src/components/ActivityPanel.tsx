import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, XCircle } from "lucide-react";

import type { Job, StatusModel } from "../types";
import { useUiStore } from "../store/ui";
import { TriagePanel } from "./activity/Triage";
import { NotesPanel } from "./activity/Notes";
import { ContactsPanel } from "./activity/Contacts";
import { EventsPanel } from "./activity/Events";
import { AiAssistPanel } from "./activity/AiAssist";
import { SummaryPanel } from "./activity/Summary";
import {
  useAddEvent,
  usePatchJob,
  useRubrics,
  useVerifyPosting,
} from "../hooks/queries";
import {
  calculateAutoScore,
  pickRubric,
  scoreRisk,
} from "../lib/scoring";
import { VERDICT_LABELS, currentVerdict } from "../lib/verdicts";
import { showToast } from "../lib/toast";
import { ShareRoleBriefButton } from "./activity/ShareRoleBriefButton";
import { STAGE_SHORT_LABEL, stageForJob } from "../lib/stages";
import { InlineConfirm } from "./States";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  StatusPill,
  scoreRiskTone,
  verdictToneKey,
} from "@/components/patterns";
import { cn } from "@/lib/cn";

interface Props {
  job: Job | null;
  statusModel?: StatusModel;
}

const ALL_TABS = [
  { id: "summary", label: "Summary" },
  { id: "triage", label: "Triage" },
  { id: "notes", label: "Notes" },
  { id: "contacts", label: "Contacts" },
  { id: "events", label: "Events" },
  { id: "llm", label: "AI assist" },
] as const;

function ActivityHeader({
  job,
  showVerdict,
  canReject,
  onRequestReject,
}: {
  job: Job;
  showVerdict: boolean;
  canReject: boolean;
  onRequestReject: () => void;
}) {
  const rubricsQuery = useRubrics();
  const rubric = pickRubric(rubricsQuery.data, job.lane);
  const score = calculateAutoScore(job, rubric);
  const verdict = currentVerdict(job);
  const stage = stageForJob(job);
  const risk = scoreRisk(score, rubric.thresholds);
  const verifyPosting = useVerifyPosting();
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setVerifying(true);
    try {
      const payload = await verifyPosting.mutateAsync(job.id);
      const v = payload.verification;
      const tone = v.result === "live" ? "ok" : "warn";
      const label =
        v.result === "live"
          ? "Live"
          : v.result === "dead"
            ? "Closed"
            : "Uncertain";
      showToast(`${label}: ${v.note}`, tone);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Verification failed";
      showToast(`Verification failed: ${message}`, "error");
    } finally {
      setVerifying(false);
    }
  }

  const subBits: string[] = [];
  if (job.company) subBits.push(job.company);
  if (job.location) subBits.push(job.location);
  if (job.lane) subBits.push(job.lane);

  return (
    <header className="flex flex-col gap-3 border-b border-border px-4 pt-4 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {job.title || "Untitled role"}
          </h2>
          {subBits.length ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subBits.join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {job.roleUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open job posting"
                >
                  <a href={job.roleUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open posting</TooltipContent>
            </Tooltip>
          ) : null}
          {job.roleUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleVerify}
                  disabled={verifying}
                  aria-label="Check link"
                >
                  <ShieldCheck className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Check link</TooltipContent>
            </Tooltip>
          ) : null}
          {canReject ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onRequestReject}
                  aria-label="Mark application rejected"
                >
                  <XCircle className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark rejected</TooltipContent>
            </Tooltip>
          ) : null}
          <ShareRoleBriefButton job={job} compact />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill
          tone={scoreRiskTone(risk.className)}
          size="sm"
          numeric
          glyph={risk.glyph}
          title={`${risk.label} · ${rubric.name}`}
          aria-label={`Score ${score} of 100, ${risk.label}`}
        >
          {score}
        </StatusPill>
        <Badge variant="secondary">{STAGE_SHORT_LABEL[stage]}</Badge>
        {job.appliedAt ? (
          <Badge variant="secondary">Applied {job.appliedAt}</Badge>
        ) : null}
        {showVerdict && verdict ? (
          <StatusPill tone={verdictToneKey(verdict)} size="sm">
            {VERDICT_LABELS[verdict]}
          </StatusPill>
        ) : null}
      </div>
    </header>
  );
}

export function ActivityPanel({ job, statusModel }: Props) {
  const activityTab = useUiStore((s) => s.activityTab);
  const setActivityTab = useUiStore((s) => s.setActivityTab);
  const pipelineMode = useUiStore((s) => s.pipelineMode);
  const stage = job ? stageForJob(job) : "decide";
  const isDecisionContext = Boolean(
    job && pipelineMode === "decide" && stage === "decide",
  );
  const canReject = Boolean(job && stage !== "decide" && stage !== "closed");
  // Per #BUG-260604-0010, every Pipeline job exposes the full tab set so
  // Triage stays available as a secondary tab even after a job moves past
  // Decide. The default tab is Summary in both modes.
  const tabs = useMemo(() => ALL_TABS, []);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  const patchJob = usePatchJob();
  const addEvent = useAddEvent(job?.id || "");

  useEffect(() => {
    setRejectOpen(false);
  }, [job?.id]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activityTab)) {
      setActivityTab("summary");
    }
  }, [activityTab, setActivityTab, tabs]);

  // When the selected job changes, reset the active tab to Summary so each new
  // selection lands on the JD summary (#BUG-260604-0010). Only `job.id` matters
  // here; we reset on identity changes, not on every job-data refresh.
  useEffect(() => {
    if (!job) return;
    setActivityTab("summary");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, setActivityTab]);

  async function confirmReject() {
    if (!job) return;
    setRejectBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      await patchJob.mutateAsync({
        id: job.id,
        body: {
          applicationStatus: "rejected",
          interviewStatus: "closed",
        },
      });
      try {
        await addEvent.mutateAsync({
          eventType: "application_rejected",
          eventDate: today,
          details: "Marked rejected from Activity panel",
        });
      } catch {
        // Event log failure shouldn't block the status change.
      }
      showToast(`Marked rejected — ${job.company}`, "warn");
      setRejectOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to mark rejected";
      showToast(message, "error");
    } finally {
      setRejectBusy(false);
    }
  }

  if (!job) {
    return (
      <section className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-4">
          <h2 className="text-base font-semibold text-foreground">Activity</h2>
          <p className="text-xs text-muted-foreground">
            Pick a job on the left to start.
          </p>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
          Select a role to review details →
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col">
      <ActivityHeader
        job={job}
        showVerdict={isDecisionContext}
        canReject={canReject}
        onRequestReject={() => setRejectOpen(true)}
      />

      {rejectOpen ? (
        <div className="px-4 pt-3">
          <InlineConfirm
            title={`Mark ${job.company} rejected?`}
            body="Sets application status to rejected and interview status to closed. The role moves out of active Track unless you opt in to closed roles. A rejection event is logged to the timeline."
            confirmLabel="Mark rejected"
            cancelLabel="Cancel"
            busy={rejectBusy}
            onConfirm={confirmReject}
            onCancel={() => setRejectOpen(false)}
          />
        </div>
      ) : null}

      <Tabs
        value={activityTab}
        onValueChange={(value) =>
          setActivityTab(value as (typeof ALL_TABS)[number]["id"])
        }
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList
          variant="line"
          className="shrink-0 border-b border-border px-2"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              variant="line"
              id={`activityTab-${tab.id}`}
              aria-controls={`activityPane-${tab.id}`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea className="flex-1">
          <div id="activityPanel">
            <div
              id="activityPane-summary"
              role="tabpanel"
              aria-labelledby="activityTab-summary"
              className={cn(
                "px-4 py-4",
                activityTab !== "summary" && "hidden",
              )}
            >
              <SummaryPanel
                job={job}
                onRequestReject={() => setRejectOpen(true)}
              />
            </div>
            <div
              id="activityPane-triage"
              role="tabpanel"
              aria-labelledby="activityTab-triage"
              className={cn(
                "px-4 py-4",
                activityTab !== "triage" && "hidden",
              )}
            >
              <TriagePanel
                job={job}
                statusModel={statusModel}
                shortcutsEnabled={activityTab === "triage"}
              />
            </div>
            <div
              id="activityPane-notes"
              role="tabpanel"
              aria-labelledby="activityTab-notes"
              className={cn(
                "px-4 py-4",
                activityTab !== "notes" && "hidden",
              )}
            >
              <NotesPanel jobId={job.id} />
            </div>
            <div
              id="activityPane-contacts"
              role="tabpanel"
              aria-labelledby="activityTab-contacts"
              className={cn(
                "px-4 py-4",
                activityTab !== "contacts" && "hidden",
              )}
            >
              <ContactsPanel jobId={job.id} />
            </div>
            <div
              id="activityPane-events"
              role="tabpanel"
              aria-labelledby="activityTab-events"
              className={cn(
                "px-4 py-4",
                activityTab !== "events" && "hidden",
              )}
            >
              <EventsPanel jobId={job.id} />
            </div>
            <div
              id="activityPane-llm"
              role="tabpanel"
              aria-labelledby="activityTab-llm"
              className={cn(
                "px-4 py-4",
                activityTab !== "llm" && "hidden",
              )}
            >
              <AiAssistPanel job={job} />
            </div>
          </div>
        </ScrollArea>
      </Tabs>
    </section>
  );
}
