import type { Job } from "../types";

/**
 * The four user-facing triage verdicts.
 * Internal status names (apply_now/selective/skip/not_a_fit) are kept stable
 * for parity with the existing data shape and analytics labels.
 */
export type Verdict = "apply_now" | "selective" | "skip" | "not_a_fit";

export const VERDICT_LABELS: Record<Verdict, string> = {
  apply_now: "Apply now",
  selective: "Pursue",
  skip: "Skip",
  not_a_fit: "Not a fit",
};

export function currentVerdict(job: Job | null | undefined): Verdict | null {
  if (!job) return null;
  if (job.discoveryStatus === "not_a_fit") return "not_a_fit";
  if (job.priorityTier === "apply_now") return "apply_now";
  if (job.priorityTier === "selective") return "selective";
  if (job.priorityTier === "skip") return "skip";
  return null;
}
