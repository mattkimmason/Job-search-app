import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { api, ApiError } from "../../lib/api";
import {
  bucketForScore,
  normalizeScore,
  pickRubric,
} from "../../lib/scoring";
import { useCreateJob, useRubrics, useStrategy } from "../../hooks/queries";
import type { LookupResult } from "../../types";
import { InlineConfirm } from "../States";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DuplicatePayload = Record<string, unknown>;

type DuplicatesPayload = Array<{ job: { company: string; title: string } }>;

export function LookupAddTab() {
  const { data: strategy } = useStrategy();
  const rubricsQuery = useRubrics();
  const createJob = useCreateJob();
  const [results, setResults] = useState<LookupResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    index: number;
    summary: string;
    pendingPayload: DuplicatePayload;
  } | null>(null);

  async function runLookup() {
    setBusy(true);
    setLookupError("");
    try {
      const payload = (await api("/api/research/jobs", {
        method: "POST",
        body: JSON.stringify({ strategy, limit: 20 }),
      })) as { results?: LookupResult[] };
      setResults(payload.results || []);
    } catch (error) {
      setLookupError(
        error instanceof Error ? error.message : "Lookup failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addToJobs(index: number) {
    const item = results[index];
    if (!item) return;
    const lane = (strategy?.roleFamilies || [])[0] || "";
    const rubric = pickRubric(rubricsQuery.data, lane);
    const score = normalizeScore(Number(item.fitScore || 0));
    const payload: DuplicatePayload = {
      source: item.source || "Lookup",
      company: item.company || "Unknown",
      title: item.title || "Untitled role",
      roleUrl: item.url || "",
      location: item.location || "",
      lane,
      summary: item.summary || "",
      score,
      priorityTier: bucketForScore(score, rubric.thresholds),
      discoveryStatus: "new",
      applicationStatus: "not_started",
      interviewStatus: "waiting",
      nextAction: "Review imported role",
    };
    try {
      await createJob.mutateAsync(payload);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const summary = (
          (error.payload as { duplicates?: DuplicatesPayload })?.duplicates ||
          []
        )
          .map((d) => `${d.job.company} - ${d.job.title}`)
          .join("\n");
        setDuplicatePrompt({ index, summary, pendingPayload: payload });
      } else {
        throw error;
      }
    }
  }

  async function handleConfirmDuplicate() {
    if (!duplicatePrompt) return;
    try {
      await createJob.mutateAsync({
        ...duplicatePrompt.pendingPayload,
        confirmDuplicate: true,
      });
    } finally {
      setDuplicatePrompt(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Pulls public job postings from The Muse using your saved strategy.
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={runLookup} disabled={busy}>
          {busy ? "Looking up..." : "Lookup new roles"}
        </Button>
      </div>
      {lookupError ? (
        <p className="text-xs text-destructive">{lookupError}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No lookup results yet. Click Lookup new roles.
          </p>
        ) : (
          results.map((item, index) => (
            <article
              key={`${item.title}-${index}`}
              className="rounded-lg border border-border bg-card/40 p-3"
            >
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {item.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.company || "Unknown company"}</span>
                  <span>{item.location || "Unknown location"}</span>
                  <span>{item.source || "Web"}</span>
                  <Badge variant="secondary" className="h-5">
                    {item.fitScore || 0}
                  </Badge>
                </div>
                <p className="text-sm text-foreground">
                  {item.summary || "No summary available."}
                </p>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Open listing
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => addToJobs(index)}
                  disabled={duplicatePrompt?.index === index}
                >
                  Add to Jobs
                </Button>
              </div>
              {duplicatePrompt?.index === index ? (
                <div className="mt-3">
                  <InlineConfirm
                    title="This looks like a duplicate."
                    body={
                      <>
                        Already tracked:
                        {"\n"}
                        {duplicatePrompt.summary}
                        {"\n\n"}
                        Add anyway?
                      </>
                    }
                    confirmLabel="Add anyway"
                    cancelLabel="Skip"
                    busy={createJob.isPending}
                    onConfirm={handleConfirmDuplicate}
                    onCancel={() => setDuplicatePrompt(null)}
                  />
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
