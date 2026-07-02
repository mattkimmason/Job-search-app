import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AiAnalysis, JdExtract, Job } from "../../types";
import { api } from "../../lib/api";
import { bucketForScore, pickRubric } from "../../lib/scoring";
import { useLlmSettings, useRubrics } from "../../hooks/queries";
import { parseSalary } from "../../lib/format";

interface Props {
  job: Job | null;
}

function AiList({ title, items }: { title: string; items?: string[] }) {
  if (!items || !items.length) return null;
  return (
    <div className="ai-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function AiAssistPanel({ job }: Props) {
  const queryClient = useQueryClient();
  const rubricsQuery = useRubrics();
  const llmSettings = useLlmSettings();
  const rubric = pickRubric(rubricsQuery.data, job?.lane);
  const [llmOutput, setLlmOutput] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"info" | "ok" | "warn" | "error">("info");
  const [fitBusy, setFitBusy] = useState(false);
  const [otherBusy, setOtherBusy] = useState<string | null>(null);
  const [jdText, setJdText] = useState("");
  const [jdBusy, setJdBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [extracted, setExtracted] = useState<JdExtract | null>(null);
  const configured = Boolean(llmSettings.data?.configured);

  function setNotice(
    message: string,
    tone: "info" | "ok" | "warn" | "error" = "info",
  ) {
    setStatus(message);
    setStatusTone(tone);
  }

  async function runDraft(
    kind: "summary" | "outreach" | "interview",
    endpoint: string,
  ) {
    if (!job) {
      setLlmOutput("Select a job in Pipeline first.");
      setNotice("Select a job in Pipeline first.", "warn");
      return;
    }
    setOtherBusy(kind);
    setNotice("Generating draft with AI...");
    try {
      const payload: any = await api(endpoint, {
        method: "POST",
        body: JSON.stringify({ jobId: job.id }),
      });
      if (!payload.usedLlm) {
        setLlmOutput(payload.text || payload.fallback || "");
        setNotice(
          payload.text || "LLM is not configured. Add it under Settings.",
          "warn",
        );
        return;
      }
      setLlmOutput(payload.text || payload.fallback || "");
      setNotice("Draft ready. Edit it here before copying or saving elsewhere.", "ok");
    } catch (error: any) {
      setNotice(`Draft failed: ${error.message}`, "error");
    } finally {
      setOtherBusy(null);
    }
  }

  async function runFitSummary() {
    return runDraft("summary", "/api/llm/fit-summary");
  }

  async function runOutreach() {
    return runDraft("outreach", "/api/llm/outreach-draft");
  }

  async function runInterviewPack() {
    return runDraft("interview", "/api/llm/interview-pack");
  }

  async function runFitScore() {
    if (!job) {
      setNotice("Select a job in Pipeline first.", "warn");
      return;
    }
    setFitBusy(true);
    setNotice("Analyzing fit with AI...");
    try {
      const payload: any = await api("/api/llm/fit-score", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id }),
      });
      if (!payload.usedLlm || !payload.analysis) {
        setAnalysis(null);
        setNotice(
          payload.text || "LLM is not configured. Add it under Settings.",
          "warn",
        );
        return;
      }
      setAnalysis(payload.analysis);
      setNotice(
        "AI match analysis ready. Review, then Apply to save it to the job.",
        "ok",
      );
    } catch (error: any) {
      setNotice(`Fit score failed: ${error.message}`, "error");
    } finally {
      setFitBusy(false);
    }
  }

  async function applyFit() {
    if (!job || !analysis) return;
    const noteLines = [
      `AI match score: ${analysis.score} (${(analysis.tier || "").replace(/_/g, " ")})`,
      analysis.rationale ? `\n${analysis.rationale}` : "",
      analysis.fitHooks?.length
        ? `\nFit hooks:\n- ${analysis.fitHooks.join("\n- ")}`
        : "",
      analysis.risks?.length ? `\nRisks:\n- ${analysis.risks.join("\n- ")}` : "",
      analysis.keywordGaps?.length
        ? `\nKeyword gaps:\n- ${analysis.keywordGaps.join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("");
    const mergedKeywords = Array.from(
      new Set([...(job.keywords || []), ...(analysis.keywordGaps || [])]),
    );
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          aiScore: analysis.score,
          aiAnalysis: analysis,
          priorityTier:
            analysis.tier ||
            bucketForScore(Number(analysis.score || 0), rubric.thresholds),
          scoreNotes: noteLines,
          fitHooks: analysis.fitHooks || [],
          risks: analysis.risks || [],
          keywords: mergedKeywords,
        }),
      });
      setNotice(
        "Applied AI analysis: score, tier, notes, hooks, risks, and keywords saved.",
        "ok",
      );
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["events", job.id] });
    } catch (error: any) {
      setNotice(`Apply failed: ${error.message}`, "error");
    }
  }

  async function summarizeJd() {
    const text = jdText.trim();
    if (!text) {
      setNotice("Paste a job description first.", "warn");
      return;
    }
    setJdBusy(true);
    setNotice("Summarizing job description with AI...");
    try {
      const payload: any = await api("/api/llm/summarize-jd", {
        method: "POST",
        body: JSON.stringify({ text, jobId: job?.id }),
      });
      if (!payload.usedLlm || !payload.extracted) {
        setExtracted(null);
        setNotice(payload.detail || payload.error || "LLM is not configured.", "warn");
        return;
      }
      setExtracted(payload.extracted);
      setNotice(
        job
          ? "Extracted. Review, then Apply to write the summary + keywords to the selected job."
          : "Extracted. Select a job in Pipeline to apply these details.",
        "ok",
      );
    } catch (error: any) {
      setNotice(`Summarize failed: ${error.message}`, "error");
    } finally {
      setJdBusy(false);
    }
  }

  async function applyJd() {
    if (!job || !extracted) return;
    const body: any = {};
    if (extracted.summary) body.summary = extracted.summary;
    const mergedKeywords = Array.from(
      new Set([...(job.keywords || []), ...(extracted.keywords || [])]),
    );
    if (mergedKeywords.length) body.keywords = mergedKeywords;
    if (extracted.location && !job.location) body.location = extracted.location;
    if (extracted.salaryLabel && !(job.salary && job.salary.label)) {
      body.salary = parseSalary(extracted.salaryLabel) || {
        label: extracted.salaryLabel,
      };
    }
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const noteParts: string[] = [];
      if (extracted.responsibilities?.length)
        noteParts.push(
          `Responsibilities:\n- ${extracted.responsibilities.join("\n- ")}`,
        );
      if (extracted.qualifications?.length)
        noteParts.push(
          `Qualifications:\n- ${extracted.qualifications.join("\n- ")}`,
        );
      if (extracted.redFlags?.length)
        noteParts.push(`Red flags:\n- ${extracted.redFlags.join("\n- ")}`);
      if (noteParts.length) {
        await api(`/api/jobs/${job.id}/notes`, {
          method: "POST",
          body: JSON.stringify({
            note: noteParts.join("\n\n"),
            noteType: "jd_extract",
          }),
        });
      }
      setNotice("Applied job-description details to the selected job.", "ok");
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["notes", job.id] });
      queryClient.invalidateQueries({ queryKey: ["events", job.id] });
    } catch (error: any) {
      setNotice(`Apply failed: ${error.message}`, "error");
    }
  }

  const fitScore = Number(analysis?.score || 0);
  const fitTier =
    analysis?.tier ||
    (fitScore >= 75 ? "apply_now" : fitScore >= 60 ? "selective" : "skip");
  const fitRiskClass = fitScore >= 75 ? "good" : fitScore >= 60 ? "warn" : "bad";

  return (
    <div>
      <div className={`ai-config ai-config-${configured ? "ok" : "warn"}`}>
        <strong>{configured ? "AI is configured" : "AI is not configured"}</strong>
        <span>
          {configured
            ? `Using ${llmSettings.data?.model || "configured model"} for user-triggered actions.`
            : "Add an endpoint and API key in Settings before generated drafts will run."}
        </span>
      </div>
      <p className="muted small">
        Drafts and analyses are editable. Nothing is saved automatically &mdash;
        use <strong>Apply to job</strong> to write results back.
      </p>
      <div className="grid-4">
        <button type="button" onClick={runFitScore} disabled={fitBusy || !job}>
          AI match score
        </button>
        <button
          type="button"
          onClick={runFitSummary}
          disabled={Boolean(otherBusy) || !job}
        >
          Fit summary
        </button>
        <button
          type="button"
          onClick={runOutreach}
          disabled={Boolean(otherBusy) || !job}
        >
          Outreach draft
        </button>
        <button
          type="button"
          onClick={runInterviewPack}
          disabled={Boolean(otherBusy) || !job}
        >
          Interview pack
        </button>
      </div>

      {analysis ? (
        <div className="ai-analysis">
          <div className="meta">
            <span className={`pill ${fitRiskClass}`}>AI score {fitScore}</span>
            <span className={`pill tier-${fitTier}`}>
              {fitTier.replace(/_/g, " ")}
            </span>
          </div>
          <div>
            {analysis.rationale ? <p>{analysis.rationale}</p> : null}
            <AiList title="Fit hooks" items={analysis.fitHooks} />
            <AiList title="Risks" items={analysis.risks} />
            <AiList title="Keyword gaps" items={analysis.keywordGaps} />
          </div>
          <div className="actions">
            <button
              type="button"
              className="primary-button"
              onClick={applyFit}
              disabled={!job || fitBusy}
            >
              Apply to job
            </button>
          </div>
        </div>
      ) : null}

      <div className="subsection">
        <h4>Summarize / extract a job description</h4>
        <p className="muted small">
          Paste the raw posting text. The AI returns a structured summary,
          keywords, and red flags you can apply to the selected job.
        </p>
        <label>
          <span>Job description</span>
          <textarea
            rows={6}
            placeholder="Paste the full job posting text here..."
            value={jdText}
            onChange={(event) => setJdText(event.target.value)}
          />
        </label>
        <div className="actions">
          <button type="button" onClick={summarizeJd} disabled={jdBusy}>
            Summarize / extract
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setJdText("");
              setExtracted(null);
              setNotice("");
            }}
          >
            Clear
          </button>
        </div>
        {extracted ? (
          <div className="ai-analysis">
            <div>
              {extracted.title || extracted.company ? (
                <h4>
                  {[extracted.title, extracted.company]
                    .filter(Boolean)
                    .join(" - ")}
                </h4>
              ) : null}
              {[extracted.seniority, extracted.location, extracted.salaryLabel]
                .filter(Boolean).length ? (
                <div className="meta">
                  {[
                    extracted.seniority,
                    extracted.location,
                    extracted.salaryLabel,
                  ]
                    .filter(Boolean)
                    .map((bit, index) => (
                      <span key={index}>{bit}</span>
                    ))}
                </div>
              ) : null}
              {extracted.summary ? <p>{extracted.summary}</p> : null}
              <AiList title="Responsibilities" items={extracted.responsibilities} />
              <AiList title="Qualifications" items={extracted.qualifications} />
              <AiList title="Keywords" items={extracted.keywords} />
              <AiList title="Red flags" items={extracted.redFlags} />
            </div>
            <div className="actions">
              <button
                type="button"
                className="primary-button"
                onClick={applyJd}
                disabled={!job || jdBusy}
              >
                Apply to job
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <label>
        <span>Generated output (editable)</span>
        <textarea
          rows={8}
          value={llmOutput}
          onChange={(event) => setLlmOutput(event.target.value)}
        />
      </label>
      {status ? (
        <p className={`ai-status ai-status-${statusTone}`} role={statusTone === "error" ? "alert" : "status"}>
          {status}
        </p>
      ) : null}
    </div>
  );
}
