import { useEffect, useState } from "react";
import { useCreateJob, useRubrics, useStrategy } from "../../hooks/queries";
import {
  bucketForScore,
  calculateAutoScore,
  pickRubric,
} from "../../lib/scoring";
import { parseSalary } from "../../lib/format";
import { useUiStore } from "../../store/ui";
import { api, ApiError } from "../../lib/api";
import type { JdExtract } from "../../types";
import { InlineConfirm } from "../States";
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

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex flex-col gap-1.5 text-sm font-medium text-foreground"
    >
      <span>{children}</span>
    </label>
  );
}

export function ManualAddTab() {
  const createJob = useCreateJob();
  const setAddJobOpen = useUiStore((s) => s.setAddJobOpen);
  const { data: strategy } = useStrategy();
  const rubricsQuery = useRubrics();
  const [source, setSource] = useState("Manual");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [roleUrl, setRoleUrl] = useState("");
  const [location, setLocation] = useState("");
  const [salaryLabel, setSalaryLabel] = useState("");
  const [lane, setLane] = useState("");
  const [summary, setSummary] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [prefillsApplied, setPrefillsApplied] = useState(false);

  // Omotenashi: pre-fill the fields the system already knows about.
  // Only applies before the user has touched these fields; once they edit,
  // we step out of the way.
  useEffect(() => {
    if (prefillsApplied || !strategy) return;
    const market = strategy.preferredMarket?.trim();
    const firstFamily = strategy.roleFamilies?.[0]?.trim();
    if (market && !location) setLocation(market);
    if (firstFamily && !lane) setLane(firstFamily);
    if (market || firstFamily) setPrefillsApplied(true);
    // We only want this to run on initial strategy load, not on every field
    // change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy]);

  const [jdText, setJdText] = useState("");
  const [parseBusy, setParseBusy] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [parsed, setParsed] = useState(false);

  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    summary: string;
    pendingBody: Record<string, unknown>;
  } | null>(null);
  const [submitError, setSubmitError] = useState("");

  function reset() {
    setSource("Manual");
    setCompany("");
    setTitle("");
    setRoleUrl("");
    setLocation("");
    setSalaryLabel("");
    setLane("");
    setSummary("");
    setKeywords([]);
    setJdText("");
    setParseStatus("");
    setParsed(false);
    setPrefillsApplied(false);
  }

  function applyExtract(extract: JdExtract) {
    if (extract.company) setCompany(extract.company);
    if (extract.title) setTitle(extract.title);
    if (extract.location) setLocation(extract.location);
    if (extract.salaryLabel) setSalaryLabel(extract.salaryLabel);
    if (extract.summary) setSummary(extract.summary);
    if (extract.keywords?.length) setKeywords(extract.keywords);
    setParsed(true);
  }

  async function handleParse() {
    const text = jdText.trim();
    if (!text) {
      setParseStatus("Paste the job description first.");
      return;
    }
    setParseBusy(true);
    setParseStatus("Parsing the posting with AI...");
    try {
      const payload = (await api("/api/llm/summarize-jd", {
        method: "POST",
        body: JSON.stringify({ text }),
      })) as { usedLlm?: boolean; extracted?: JdExtract; detail?: string; error?: string };
      if (!payload.usedLlm || !payload.extracted) {
        setParseStatus(
          payload.detail ||
            payload.error ||
            "LLM is not configured. Add it under Settings, or fill the fields manually below.",
        );
        return;
      }
      applyExtract(payload.extracted);
      setParseStatus(
        "Parsed. Review and edit the fields below, then add the job.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Parse failed.";
      setParseStatus(`Parse failed: ${message}`);
    } finally {
      setParseBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError("");
    const trimmedCompany = company.trim();
    const trimmedTitle = title.trim();
    if (!trimmedCompany || !trimmedTitle) return;
    const salary = parseSalary(salaryLabel) || (salaryLabel.trim()
      ? { label: salaryLabel.trim() }
      : null);
    const rubric = pickRubric(rubricsQuery.data, lane);
    const score = calculateAutoScore(
      {
        company: trimmedCompany,
        title: trimmedTitle,
        lane,
        summary,
        location,
        salary,
      },
      rubric,
    );
    const priorityTier = bucketForScore(score, rubric.thresholds);
    const body = {
      source,
      company: trimmedCompany,
      title: trimmedTitle,
      roleUrl: roleUrl.trim(),
      location: location.trim(),
      lane: lane.trim(),
      summary: summary.trim(),
      salary,
      keywords,
      score,
      priorityTier,
      discoveryStatus: "new",
      applicationStatus: "not_started",
      interviewStatus: "waiting",
      nextAction: "Review and score role",
    };
    try {
      await createJob.mutateAsync(body);
      reset();
      setAddJobOpen(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const summaryText = (
          (error.payload as { duplicates?: Array<{ job: { company: string; title: string } }> })?.duplicates || []
        )
          .map((d) => `${d.job.company} - ${d.job.title}`)
          .join("\n");
        setDuplicatePrompt({ summary: summaryText, pendingBody: body });
        return;
      }
      setSubmitError(
        error instanceof Error ? error.message : "Couldn't save the job.",
      );
    }
  }

  async function handleConfirmDuplicate() {
    if (!duplicatePrompt) return;
    try {
      await createJob.mutateAsync({
        ...duplicatePrompt.pendingBody,
        confirmDuplicate: true,
      });
      setDuplicatePrompt(null);
      reset();
      setAddJobOpen(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Couldn't save the job.",
      );
      setDuplicatePrompt(null);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Paste a link + job description (auto-fill with AI)
          </h4>
          <p className="text-xs text-muted-foreground">
            Drop the posting URL and the full job description. AI parses out
            the company, title, location, salary, summary, and keywords into
            the form below for you to review.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="manualRoleUrl">Role URL</FieldLabel>
          <Input
            id="manualRoleUrl"
            type="url"
            placeholder="https://..."
            value={roleUrl}
            onChange={(event) => setRoleUrl(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="manualJdText">Job description</FieldLabel>
          <Textarea
            id="manualJdText"
            rows={6}
            placeholder="Paste the full job posting text here..."
            value={jdText}
            onChange={(event) => setJdText(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleParse}
            disabled={parseBusy || !jdText.trim()}
          >
            {parseBusy ? "Parsing..." : "Parse with AI"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setJdText("");
              setParseStatus("");
            }}
          >
            Clear
          </Button>
        </div>
        {parseStatus ? (
          <p className="text-xs text-muted-foreground">{parseStatus}</p>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {parsed
          ? "Review the parsed details, edit anything, then add the job."
          : "Or fill the essentials manually \u2014 score is auto-calculated."}
      </p>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="manualSource">Source</FieldLabel>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="manualSource" aria-label="Role source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Manual">Manual</SelectItem>
                <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                <SelectItem value="LinkedIn Alert">LinkedIn Alert</SelectItem>
                <SelectItem value="Referral">Referral</SelectItem>
                <SelectItem value="The Muse">The Muse</SelectItem>
                <SelectItem value="Deep Research">Deep Research</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="manualCompany">Company</FieldLabel>
            <Input
              id="manualCompany"
              type="text"
              placeholder="DoorDash"
              required
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="manualTitle">Role title</FieldLabel>
            <Input
              id="manualTitle"
              type="text"
              placeholder="Senior PM, DashMart"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="manualLocation">Location</FieldLabel>
            <Input
              id="manualLocation"
              type="text"
              placeholder="NYC / Hybrid"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="manualSalary">Salary label</FieldLabel>
            <Input
              id="manualSalary"
              type="text"
              placeholder="180k - 220k"
              value={salaryLabel}
              onChange={(event) => setSalaryLabel(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="manualLane">Lane / family</FieldLabel>
            <Input
              id="manualLane"
              type="text"
              placeholder="Retail systems"
              value={lane}
              onChange={(event) => setLane(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="manualSummary">Summary and first notes</FieldLabel>
          <Textarea
            id="manualSummary"
            rows={4}
            placeholder="What the role is, why it might fit, anything unique."
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </div>
        {keywords.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Keywords to be saved:
            </span>
            {keywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="h-5">
                {kw}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={createJob.isPending || Boolean(duplicatePrompt)}
          >
            Add job
          </Button>
        </div>
        {submitError ? (
          <p className="text-xs text-destructive">{submitError}</p>
        ) : null}
        {duplicatePrompt ? (
          <InlineConfirm
            title="This looks like a duplicate."
            body={
              <>
                Already tracked:
                {"\n"}
                {duplicatePrompt.summary}
                {"\n\n"}
                Save anyway?
              </>
            }
            confirmLabel="Save anyway"
            cancelLabel="Cancel"
            busy={createJob.isPending}
            onConfirm={handleConfirmDuplicate}
            onCancel={() => setDuplicatePrompt(null)}
          />
        ) : null}
      </form>
    </section>
  );
}
