import type { Job } from "../types";

/**
 * Pipeline stages derived from the three status axes
 * (discovery / application / interview) plus posting liveness.
 *
 * `decide` is the inbound queue: active roles you haven't committed to yet.
 * Everything else is a "track" stage — things you've decided to pursue and are
 * moving through the funnel. `closed` collects dead/rejected/not-a-fit roles.
 *
 * This is a pure presentation layer over the existing status taxonomy; it does
 * not introduce new status values.
 */
export type Stage =
  | "decide"
  | "shortlisted"
  | "applied"
  | "screening"
  | "interviewing"
  | "offer"
  | "closed";

/** Stages that belong to the Track funnel, in funnel order. */
export const FUNNEL_STAGES: Exclude<Stage, "decide" | "closed">[] = [
  "shortlisted",
  "applied",
  "screening",
  "interviewing",
  "offer",
];

export interface StageMeta {
  key: Stage;
  label: string;
  hint?: string;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  decide: { key: "decide", label: "To review" },
  shortlisted: {
    key: "shortlisted",
    label: "Shortlisted",
    hint: "decided to pursue, not applied yet",
  },
  applied: {
    key: "applied",
    label: "Applied · awaiting",
    hint: "sorted by oldest first",
  },
  screening: { key: "screening", label: "Screening" },
  interviewing: { key: "interviewing", label: "Interviewing" },
  offer: { key: "offer", label: "Offer" },
  closed: { key: "closed", label: "Closed / not a fit" },
};

export const STAGE_SHORT_LABEL: Record<Stage, string> = {
  decide: "To review",
  shortlisted: "Shortlisted",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

/**
 * Map a job to a single stage. Evaluated most-advanced first so that interview
 * progress always wins over application/discovery state.
 */
export function stageForJob(job: Job): Stage {
  const discovery = job.discoveryStatus || "new";
  const application = job.applicationStatus || "not_started";
  const interview = job.interviewStatus || "waiting";
  const posting = job.postingStatus || "unknown";

  if (
    discovery === "not_a_fit" ||
    application === "rejected" ||
    interview === "closed" ||
    posting === "dead"
  ) {
    return "closed";
  }
  if (interview === "offer") return "offer";
  if (interview === "interview_scheduled" || interview === "interview_done") {
    return "interviewing";
  }
  if (interview === "screen_scheduled" || interview === "screen_done") {
    return "screening";
  }
  if (application === "applied") return "applied";
  if (discovery === "target") return "shortlisted";
  if (application === "in_progress") return "shortlisted";
  return "decide";
}

export function isTrackStage(stage: Stage): boolean {
  return stage !== "decide";
}

/** Whole-days elapsed since an ISO timestamp, or null if unparseable. */
export function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = Date.now() - then;
  if (diff < 0) return 0;
  return Math.floor(diff / 86400000);
}
