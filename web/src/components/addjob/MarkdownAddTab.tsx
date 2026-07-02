import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { api, ApiError } from "../../lib/api";
import { looksLikeCsv, parseSalary } from "../../lib/format";
import {
  bucketForScore,
  calculateAutoScore,
  pickRubric,
} from "../../lib/scoring";
import {
  useCreateJob,
  useResearchPrompts,
  useRubrics,
} from "../../hooks/queries";
import type { MarkdownPreviewItem } from "../../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

interface ParsedJobsResponse {
  jobs?: Array<MarkdownPreviewItem & { duplicates?: Array<{ job: { company: string; title: string } }> }>;
}

export function MarkdownAddTab() {
  const createJob = useCreateJob();
  const { data: prompts = [] } = useResearchPrompts();
  const rubricsQuery = useRubrics();
  const [promptId, setPromptId] = useState("");
  const [promptStatus, setPromptStatus] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<MarkdownPreviewItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!prompts.length) return;
    if (!promptId || !prompts.find((p) => p.id === promptId)) {
      setPromptId(prompts[0].id);
    }
  }, [prompts, promptId]);

  const selectedPrompt = prompts.find((p) => p.id === promptId);
  const promptText = selectedPrompt?.content || "";

  async function handleCopyPrompt() {
    if (!promptText) {
      setPromptStatus("No prompt to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(promptText);
      setPromptStatus(
        "Copied. Paste it into your deep-research tool, then bring the results back here.",
      );
    } catch {
      setPromptStatus(
        "Copy failed. Select the text manually and copy with Ctrl+C.",
      );
    }
  }

  function describeError(error: unknown): string {
    if (error instanceof ApiError) {
      const detail = (error.payload as { detail?: string })?.detail;
      return detail ? `${error.message}\n${detail}` : error.message;
    }
    return error instanceof Error ? error.message : "Parse failed.";
  }

  async function parseCsvText(csvText: string) {
    const csv = String(csvText || "").trim();
    if (!csv) {
      setStatus("Paste CSV or upload a .csv file first.");
      return;
    }
    setStatus("Parsing CSV...");
    setParsing(true);
    try {
      const payload = (await api("/api/import/csv", {
        method: "POST",
        body: JSON.stringify({ csv }),
      })) as ParsedJobsResponse;
      const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      setPreview(
        jobs.map((j) => ({
          ...j,
          selected: !(j.duplicates && j.duplicates.length),
        })),
      );
      setStatus(
        jobs.length
          ? `Parsed ${jobs.length} job${jobs.length === 1 ? "" : "s"} from CSV. Review and add selected.`
          : "No rows detected. Make sure your CSV has company and title/role columns.",
      );
    } catch (error) {
      setStatus(describeError(error));
      setPreview([]);
    } finally {
      setParsing(false);
    }
  }

  async function handleParse() {
    const markdown = text.trim();
    if (!markdown) {
      setStatus("Paste markdown/CSV or upload a .md or .csv file first.");
      return;
    }
    if (looksLikeCsv(markdown)) {
      await parseCsvText(markdown);
      return;
    }
    setStatus("Parsing with LLM, this can take a few seconds...");
    setParsing(true);
    try {
      const payload = (await api("/api/import/markdown", {
        method: "POST",
        body: JSON.stringify({ markdown }),
      })) as ParsedJobsResponse;
      const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      setPreview(
        jobs.map((j) => ({
          ...j,
          selected: !(j.duplicates && j.duplicates.length),
        })),
      );
      setStatus(
        jobs.length
          ? `Extracted ${jobs.length} job${jobs.length === 1 ? "" : "s"}. Review and add selected.`
          : "No jobs detected. Try adjusting the markdown.",
      );
    } catch (error) {
      setStatus(describeError(error));
      setPreview([]);
    } finally {
      setParsing(false);
    }
  }

  async function handleAddSelected() {
    const selected = preview.filter((item) => item.selected);
    if (!selected.length) {
      setStatus("Select at least one job to add.");
      return;
    }
    setStatus(
      `Adding ${selected.length} job${selected.length === 1 ? "" : "s"}...`,
    );
    setAdding(true);
    let added = 0;
    let skipped = 0;
    for (const item of selected) {
      const salary = parseSalary(item.salaryLabel || "");
      const body: Record<string, unknown> = {
        source: item.source || "Deep Research",
        company: item.company,
        title: item.title,
        roleUrl: item.roleUrl || "",
        location: item.location || "",
        summary: item.summary || "",
        salary,
        discoveryStatus: "new",
        applicationStatus: "not_started",
        interviewStatus: "waiting",
        nextAction: "Review and score role",
        confirmDuplicate: Boolean(item.duplicates && item.duplicates.length),
      };
      const rubric = pickRubric(rubricsQuery.data, body.lane as string | undefined);
      const score = calculateAutoScore({ ...body, salary }, rubric);
      body.score = score;
      body.priorityTier = bucketForScore(score, rubric.thresholds);
      try {
        await createJob.mutateAsync(body);
        added += 1;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
    setStatus(`Added ${added}, skipped ${skipped} duplicates.`);
    setPreview([]);
    setText("");
    setAdding(false);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    setText(raw);
    event.target.value = "";
    if (/\.csv$/i.test(file.name) || looksLikeCsv(raw)) {
      await parseCsvText(raw);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Paste deep-research output or any markdown listing jobs (the LLM
        extracts them), or paste/upload a CSV with company &amp; title columns
        (parsed instantly, no LLM needed). You review before saving.
      </p>
      {prompts.length ? (
        <details className="rounded-lg border border-border bg-card/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Deep research prompt &mdash; copy &amp; run externally
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Copy this into a deep-research tool (ChatGPT/Claude), run it,
              then paste the results below and parse.
            </p>
            {prompts.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground">
                  Prompt
                </span>
                <Select
                  value={promptId}
                  onValueChange={(value) => {
                    setPromptId(value);
                    setPromptStatus("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {prompts.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Textarea rows={9} readOnly value={promptText} />
            <div className="flex items-center gap-2">
              <Button type="button" onClick={handleCopyPrompt}>
                Copy prompt
              </Button>
            </div>
            {promptStatus ? (
              <p className="text-xs text-muted-foreground">{promptStatus}</p>
            ) : null}
          </div>
        </details>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          Or upload a .md or .csv file
        </span>
        <Input
          type="file"
          accept=".md,.csv,text/markdown,text/csv,text/plain"
          onChange={handleFile}
          className="cursor-pointer"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          Markdown or CSV
        </span>
        <Textarea
          rows={10}
          placeholder={
            "Markdown:\n## DoorDash - Senior PM, DashMart\nLocation: NYC | URL: https://...\n\nOr CSV:\ncompany,title,location,url,salary,summary\nDoorDash,Senior PM,NYC,https://...,180k-220k,DashMart team"
          }
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleParse} disabled={parsing}>
          {parsing ? "Parsing..." : "Parse"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setText("");
            setPreview([]);
            setStatus("");
          }}
        >
          Clear
        </Button>
      </div>
      {status ? (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {status}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {preview.map((item, index) => (
          <div
            key={`${item.company}-${item.title}-${index}`}
            className={cn(
              "rounded-lg border bg-card/40 p-3",
              item.duplicates?.length
                ? "border-warning/40"
                : "border-border",
            )}
          >
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={item.selected}
                onChange={(event) =>
                  setPreview((prev) =>
                    prev.map((p, i) =>
                      i === index ? { ...p, selected: event.target.checked } : p,
                    ),
                  )
                }
                className="mt-1 size-4 accent-primary"
              />
              <span className="text-sm font-semibold text-foreground">
                {item.company} - {item.title}
              </span>
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {item.location ? <span>{item.location}</span> : null}
              {item.salaryLabel ? <span>{item.salaryLabel}</span> : null}
              {item.source ? <span>{item.source}</span> : null}
              {item.roleUrl ? (
                <a
                  href={item.roleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  URL
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
            {item.summary ? (
              <p className="mt-2 text-sm text-foreground">{item.summary}</p>
            ) : null}
            {item.duplicates?.length ? (
              <div className="mt-2">
                <Badge variant="warning" className="h-5 whitespace-normal">
                  Possible duplicate:{" "}
                  {item.duplicates
                    .map((d) => `${d.job.company} - ${d.job.title}`)
                    .join("; ")}
                </Badge>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {preview.length > 0 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleAddSelected}
            disabled={adding}
          >
            {adding ? "Adding..." : "Add selected jobs"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
