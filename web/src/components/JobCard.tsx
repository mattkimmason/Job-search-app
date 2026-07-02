import type { Job } from "../types";
import {
  SCORE_CATEGORY_TOOLTIPS,
  bucketForScore,
  calculateScoreBreakdown,
  pickRubric,
  scoreRisk,
} from "../lib/scoring";
import { getUnifiedStatus } from "../lib/format";
import { useUiStore } from "../store/ui";
import { useRubrics } from "../hooks/queries";

interface Props {
  job: Job;
  onSelect: (id: string) => void;
  onLivenessChange: (id: string, value: string) => void;
  onActionToggle: (job: Job) => void;
  onVerifyLink: (id: string) => void;
  verifyingId: string;
}

function pillForLiveness(status?: string) {
  if (status === "live") return <span className="pill live">Live</span>;
  if (status === "dead") return <span className="pill dead">Closed</span>;
  return <span className="pill subtle">Unverified</span>;
}

export function JobCard({
  job,
  onSelect,
  onLivenessChange,
  onActionToggle,
  onVerifyLink,
  verifyingId,
}: Props) {
  const ui = useUiStore();
  const isSelected = ui.selectedJobId === job.id;
  const breakdownExpanded = ui.expandedBreakdowns.has(job.id);

  const rubricsQuery = useRubrics();
  const rubric = pickRubric(rubricsQuery.data, job.lane);
  const breakdown = calculateScoreBreakdown(job, rubric);
  const score = breakdown.total;
  const risk = scoreRisk(score, rubric.thresholds);
  const tier = bucketForScore(score, rubric.thresholds);
  const unifiedStatus = getUnifiedStatus(job);
  const statusPill = unifiedStatus.replace(/_/g, " ");
  const showLivenessPill =
    job.postingStatus === "dead" || job.postingStatus === "live";

  return (
    <article
      className={`job-card ${isSelected ? "is-active" : ""} ${job.postingStatus === "dead" ? "posting-dead" : ""}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest("button") ||
          target.closest("select") ||
          target.closest("a")
        ) {
          return;
        }
        onSelect(isSelected ? "" : job.id);
      }}
    >
      <div className="job-card-body">
        <div className="job-card-row">
          <div>
            <h3>{job.title}</h3>
            <div className="meta">
              <span>
                <strong>{job.company}</strong>
              </span>
              <span>{job.location || "Location unknown"}</span>
              <span>{job.salary?.label || "Unknown comp"}</span>
            </div>
          </div>
          <button
            type="button"
            className="toggle-detail"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(isSelected ? "" : job.id);
            }}
          >
            {isSelected ? "Collapse" : "Expand"}
          </button>
        </div>
        <div className="meta">
          <span
            className={`pill score-pill ${risk.className}`}
            aria-label={`Score ${score} of 100, ${risk.label}`}
            title={risk.label}
          >
            <span aria-hidden="true" className="score-glyph">
              {risk.glyph}
            </span>
            <span className="score-num">{score}</span>
          </span>
          <span className={`pill tier-${tier}`}>{tier.replace("_", " ")}</span>
          <span className="pill">{statusPill}</span>
          {showLivenessPill ? pillForLiveness(job.postingStatus) : null}
          {job.needsVerification ? (
            <span className="pill warn">Re-verify</span>
          ) : null}
          {job.stalePosting ? (
            <span className="pill warn">stale {job.staleDays}d</span>
          ) : null}
          {Number.isFinite(job.aiScore) && job.aiScore !== null ? (
            <span className="pill ai" title="AI match analysis">
              AI {job.aiScore}
              {job.aiAnalysis?.tier
                ? ` \u00b7 ${job.aiAnalysis.tier.replace(/_/g, " ")}`
                : ""}
            </span>
          ) : null}
          <span className="pill subtle">{job.source || "Manual"}</span>
        </div>
      </div>
      <div className={`job-card-detail ${isSelected ? "" : "hidden"}`}>
        <p>{job.summary || "No summary yet."}</p>
        <div className="meta">
          <span>Next: {job.nextAction || "Not set"}</span>
          <span>Due: {job.dueDate || "Not set"}</span>
        </div>
        <div className="meta-line">
          {job.roleUrl ? (
            <a href={job.roleUrl} target="_blank" rel="noreferrer">
              Open posting
            </a>
          ) : (
            <span className="muted small">No posting URL</span>
          )}
          <span className="liveness">
            <span className="liveness-label">Still live?</span>
            <select
              value={job.postingStatus || "unknown"}
              onChange={(event) => onLivenessChange(job.id, event.target.value)}
              onClick={(event) => event.stopPropagation()}
            >
              <option value="unknown">Unknown</option>
              <option value="live">Live</option>
              <option value="dead">Dead</option>
            </select>
          </span>
          {job.postingCheckedAt ? (
            <span className="muted small">
              Checked {new Date(job.postingCheckedAt).toLocaleDateString()}
            </span>
          ) : null}
          {job.roleUrl ? (
            <button
              type="button"
              className="ghost-button small"
              onClick={(event) => {
                event.stopPropagation();
                onVerifyLink(job.id);
              }}
              disabled={verifyingId === job.id}
              title="Probe the posting URL to confirm live, dead, or uncertain"
            >
              {verifyingId === job.id ? "Checking..." : "Check link"}
            </button>
          ) : null}
        </div>
        <div className="card-actions">
          <button
            type="button"
            className="primary-button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(job.id);
              ui.setActivityTab("triage");
              requestAnimationFrame(() => {
                const panel = document.getElementById("activityPanel");
                if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
          >
            Edit triage below
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(job.id);
              ui.setActivityTab("llm");
              requestAnimationFrame(() => {
                const panel = document.getElementById("activityPanel");
                if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
            title="Open AI assist to run match analysis on this role"
          >
            AI triage
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onActionToggle(job);
            }}
          >
            {job.discoveryStatus === "not_a_fit" ? "Unhide" : "Not interested"}
          </button>
        </div>
        <div className="meta-line">
          <button
            type="button"
            className="score-breakdown-toggle"
            onClick={(event) => {
              event.stopPropagation();
              ui.toggleBreakdown(job.id);
            }}
          >
            {breakdownExpanded ? "Hide breakdown" : "Score breakdown"}
          </button>
        </div>
        <div
          className={`score-breakdown ${breakdownExpanded ? "" : "hidden"}`}
        >
          <div className="score-breakdown-row head">
            <div>Category</div>
            <div className="col-num">Score</div>
            <div className="col-num">Cap</div>
            <div className="col-contrib">Contribution</div>
          </div>
          {breakdown.categories.map((cat) => (
            <div
              key={cat.key}
              className="score-breakdown-row"
              title={SCORE_CATEGORY_TOOLTIPS[cat.key] || ""}
            >
              <div>{cat.label}</div>
              <div className="col-num">{cat.value}</div>
              <div className="col-num">/ {cat.cap}</div>
              <div className="col-contrib">+{cat.value}</div>
            </div>
          ))}
          <div className="score-breakdown-row total">
            <div>Total</div>
            <div className="col-num">{score}</div>
            <div className="col-num">/ 100</div>
            <div className="col-contrib">{score}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
