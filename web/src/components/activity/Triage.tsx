import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Job, Rubric, StatusModel } from "../../types";
import {
  SCORE_CATEGORY_TOOLTIPS,
  bucketForScore,
  calculateAutoScore,
  calculateScoreBreakdown,
  pickRubric,
} from "../../lib/scoring";
import { usePatchJob, useRubrics } from "../../hooks/queries";
import { useUiStore } from "../../store/ui";
import { showToast } from "../../lib/toast";
import { currentVerdict, type Verdict } from "../../lib/verdicts";

interface Props {
  job: Job | null;
  statusModel?: StatusModel;
  /**
   * When false, the global 1/2/3/4 verdict shortcuts are not bound. Used so
   * the Triage panel can stay mounted (and accessible from secondary tabs)
   * without firing verdict actions while another tab is active.
   */
  shortcutsEnabled?: boolean;
}

const VERDICT_BUTTONS: {
  id: Verdict;
  label: string;
  hint: string;
  shortcut: string;
}[] = [
  {
    id: "apply_now",
    label: "Apply now",
    hint: "Tailor + send today/tomorrow",
    shortcut: "1",
  },
  {
    id: "selective",
    label: "Pursue",
    hint: "Research before applying",
    shortcut: "2",
  },
  {
    id: "skip",
    label: "Skip",
    hint: "Low priority, keep in pipeline",
    shortcut: "3",
  },
  {
    id: "not_a_fit",
    label: "Not a fit",
    hint: "Hide and close",
    shortcut: "4",
  },
];

function isoDateDaysFromNow(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}

/**
 * Smart defaults for nextAction / dueDate. Only pre-fills when fields are
 * empty — never overwrites user input.
 */
function smartDefaultsForStatus(args: {
  applicationStatus?: string;
  interviewStatus?: string;
  currentNextAction: string;
  currentDueDate: string;
}): { nextAction?: string; dueDate?: string } | null {
  const { applicationStatus, interviewStatus, currentNextAction, currentDueDate } =
    args;
  const hasNext = currentNextAction.trim().length > 0;
  const hasDue = currentDueDate.trim().length > 0;
  let suggestion: { nextAction?: string; dueDate?: string } | null = null;
  if (applicationStatus === "applied") {
    suggestion = { nextAction: "Follow up", dueDate: isoDateDaysFromNow(5) };
  } else if (interviewStatus === "screen_done") {
    suggestion = {
      nextAction: "Send thank-you note",
      dueDate: isoDateDaysFromNow(1),
    };
  } else if (interviewStatus === "interview_done") {
    suggestion = {
      nextAction: "Send thank-you note",
      dueDate: isoDateDaysFromNow(1),
    };
  } else if (interviewStatus === "offer") {
    suggestion = {
      nextAction: "Respond to offer",
      dueDate: isoDateDaysFromNow(3),
    };
  }
  if (!suggestion) return null;
  const out: { nextAction?: string; dueDate?: string } = {};
  if (suggestion.nextAction && !hasNext) out.nextAction = suggestion.nextAction;
  if (suggestion.dueDate && !hasDue) out.dueDate = suggestion.dueDate;
  return Object.keys(out).length ? out : null;
}

interface VerdictPayloadArgs {
  verdict: Verdict;
  rubric: Rubric;
  score: number;
  currentNextAction: string;
  currentDueDate: string;
}

function verdictPayload({
  verdict,
  rubric,
  score,
  currentNextAction,
  currentDueDate,
}: VerdictPayloadArgs): Record<string, unknown> {
  const tier = bucketForScore(score, rubric.thresholds);
  const fields: Record<string, unknown> = { score };
  switch (verdict) {
    case "apply_now":
      fields.discoveryStatus = "target";
      fields.priorityTier = "apply_now";
      fields.interviewStatus = "waiting";
      if (!currentNextAction.trim()) fields.nextAction = "Tailor resume + apply";
      if (!currentDueDate.trim()) fields.dueDate = isoDateDaysFromNow(2);
      break;
    case "selective":
      fields.discoveryStatus = "researching";
      fields.priorityTier = "selective";
      if (!currentNextAction.trim())
        fields.nextAction = "Decide apply vs skip";
      if (!currentDueDate.trim()) fields.dueDate = isoDateDaysFromNow(5);
      break;
    case "skip":
      fields.discoveryStatus = "researching";
      fields.priorityTier = "skip";
      fields.nextAction = "";
      fields.dueDate = "";
      break;
    case "not_a_fit":
      fields.discoveryStatus = "not_a_fit";
      fields.applicationStatus = "rejected";
      fields.interviewStatus = "closed";
      fields.priorityTier = tier;
      break;
  }
  return fields;
}

const SNAPSHOT_FIELDS = [
  "discoveryStatus",
  "applicationStatus",
  "interviewStatus",
  "priorityTier",
  "nextAction",
  "dueDate",
  "scoreNotes",
  "score",
] as const;

function snapshotJob(job: Job): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const key of SNAPSHOT_FIELDS) {
    snap[key] = (job as unknown as Record<string, unknown>)[key] ?? "";
  }
  return snap;
}

export function TriagePanel({
  job,
  statusModel,
  shortcutsEnabled = true,
}: Props) {
  const patchJob = usePatchJob();
  const rubricsQuery = useRubrics();
  const rubric = pickRubric(rubricsQuery.data, job?.lane);
  const expandedBreakdowns = useUiStore((s) => s.expandedBreakdowns);
  const toggleBreakdown = useUiStore((s) => s.toggleBreakdown);
  const requestAutoAdvance = useUiStore((s) => s.requestAutoAdvance);

  const [scoreNotes, setScoreNotes] = useState("");
  const [discovery, setDiscovery] = useState("");
  const [application, setApplication] = useState("");
  const [interview, setInterview] = useState("");
  const [tier, setTier] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Debounce timers for auto-save fields.
  const notesTimerRef = useRef<number | null>(null);
  // Snapshot of the currently-loaded job so we can flush pending edits when
  // selectedJobId changes before the textarea blurs (#BUG-260604-0022).
  const loadedRef = useRef<{
    id: string;
    notes: string;
    nextAction: string;
    dueDate: string;
  } | null>(null);
  // Live mirror of in-flight form edits, read by the flush-on-switch effect
  // without re-running it whenever the user types.
  const pendingRef = useRef({ notes: "", nextAction: "", dueDate: "" });
  useEffect(() => {
    pendingRef.current = { notes: scoreNotes, nextAction, dueDate };
  }, [scoreNotes, nextAction, dueDate]);

  useEffect(() => {
    if (!job) {
      loadedRef.current = null;
      return;
    }
    const previous = loadedRef.current;
    if (previous && previous.id !== job.id) {
      const pending = pendingRef.current;
      const flushBody: Record<string, unknown> = {};
      if (pending.notes.trim() !== previous.notes.trim()) {
        flushBody.scoreNotes = pending.notes.trim();
      }
      if (pending.nextAction.trim() !== previous.nextAction.trim()) {
        flushBody.nextAction = pending.nextAction.trim();
      }
      if ((pending.dueDate || "") !== (previous.dueDate || "")) {
        flushBody.dueDate = pending.dueDate;
      }
      if (Object.keys(flushBody).length) {
        patchJob.mutate({ id: previous.id, body: flushBody });
      }
      if (notesTimerRef.current) {
        window.clearTimeout(notesTimerRef.current);
        notesTimerRef.current = null;
      }
    }
    const score = calculateAutoScore(job, rubric);
    const initialNotes = job.scoreNotes || "";
    const initialNextAction = job.nextAction || "";
    const initialDueDate = job.dueDate || "";
    setScoreNotes(initialNotes);
    setDiscovery(job.discoveryStatus || "new");
    setApplication(job.applicationStatus || "not_started");
    setInterview(job.interviewStatus || "waiting");
    setTier(job.priorityTier || bucketForScore(score, rubric.thresholds));
    setNextAction(initialNextAction);
    setDueDate(initialDueDate);
    setLastSavedAt(null);
    loadedRef.current = {
      id: job.id,
      notes: initialNotes,
      nextAction: initialNextAction,
      dueDate: initialDueDate,
    };
    // Reset only on job change; in-progress edits survive background invalidations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  // Flush pending edits if the panel unmounts (e.g. tab switch, dialog close).
  useEffect(() => {
    return () => {
      const loaded = loadedRef.current;
      const pending = pendingRef.current;
      if (!loaded) return;
      const flushBody: Record<string, unknown> = {};
      if (pending.notes.trim() !== loaded.notes.trim()) {
        flushBody.scoreNotes = pending.notes.trim();
      }
      if (pending.nextAction.trim() !== loaded.nextAction.trim()) {
        flushBody.nextAction = pending.nextAction.trim();
      }
      if ((pending.dueDate || "") !== (loaded.dueDate || "")) {
        flushBody.dueDate = pending.dueDate;
      }
      if (Object.keys(flushBody).length) {
        patchJob.mutate({ id: loaded.id, body: flushBody });
      }
      if (notesTimerRef.current) {
        window.clearTimeout(notesTimerRef.current);
        notesTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const score = useMemo(
    () => (job ? calculateAutoScore(job, rubric) : 0),
    [job, rubric],
  );
  const breakdown = useMemo(
    () => (job ? calculateScoreBreakdown(job, rubric) : null),
    [job, rubric],
  );

  // Score breakdown is open by default once the role clears the selective bar
  // (Yugen: reveal depth only when there's something worth seeing).
  const breakdownExplicit = job ? expandedBreakdowns.has(job.id) : false;
  const breakdownExpanded =
    breakdownExplicit || (score >= rubric.thresholds.selective);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      if (!job) return null;
      try {
        const result = await patchJob.mutateAsync({ id: job.id, body });
        setLastSavedAt(Date.now());
        return result;
      } catch (error) {
        showToast(
          `Save failed: ${error instanceof Error ? error.message : "unknown"}`,
          "error",
        );
        return null;
      }
    },
    [job, patchJob],
  );

  const activeVerdict = job ? currentVerdict(job) : null;
  const recommended: Verdict | null = useMemo(() => {
    if (!job) return null;
    const tier = bucketForScore(score, rubric.thresholds);
    if (job.discoveryStatus === "not_a_fit") return null;
    if (tier === "apply_now") return "apply_now";
    if (tier === "selective") return "selective";
    return "skip";
  }, [job, score, rubric.thresholds]);

  const applyVerdict = useCallback(
    async (verdict: Verdict) => {
      if (!job) return;
      if (activeVerdict === verdict) return;
      const snapshot = snapshotJob(job);
      const body = verdictPayload({
        verdict,
        rubric,
        score,
        currentNextAction: nextAction,
        currentDueDate: dueDate,
      });
      if (typeof body.nextAction === "string") setNextAction(body.nextAction);
      if (typeof body.dueDate === "string") setDueDate(body.dueDate);
      if (typeof body.discoveryStatus === "string")
        setDiscovery(body.discoveryStatus);
      if (typeof body.applicationStatus === "string")
        setApplication(body.applicationStatus);
      if (typeof body.interviewStatus === "string")
        setInterview(body.interviewStatus);
      if (typeof body.priorityTier === "string") setTier(body.priorityTier);

      const result = await patch(body);
      if (!result) return;
      const label =
        VERDICT_BUTTONS.find((b) => b.id === verdict)?.label || verdict;
      const tone = verdict === "not_a_fit" ? "warn" : "ok";
      showToast(`${label} - ${job.company}`, {
        kind: tone,
        action: {
          label: "Undo",
          onClick: () => {
            patchJob.mutate({ id: job.id, body: snapshot });
            if (typeof snapshot.nextAction === "string")
              setNextAction(snapshot.nextAction);
            if (typeof snapshot.dueDate === "string")
              setDueDate(snapshot.dueDate);
            if (typeof snapshot.discoveryStatus === "string")
              setDiscovery(snapshot.discoveryStatus);
            if (typeof snapshot.applicationStatus === "string")
              setApplication(snapshot.applicationStatus);
            if (typeof snapshot.interviewStatus === "string")
              setInterview(snapshot.interviewStatus);
            if (typeof snapshot.priorityTier === "string")
              setTier(snapshot.priorityTier);
            if (typeof snapshot.scoreNotes === "string")
              setScoreNotes(snapshot.scoreNotes);
          },
        },
      });
      // Archive-and-next: after a definitive verdict (apply_now/skip/not_a_fit)
      // we hop forward; pursuing keeps you on the same role so you can dig in.
      if (verdict !== "selective") {
        requestAutoAdvance();
      }
    },
    [
      job,
      activeVerdict,
      rubric,
      score,
      nextAction,
      dueDate,
      patch,
      patchJob,
      requestAutoAdvance,
    ],
  );

  // Keyboard verdict bindings (1/2/3/4 + u). We bind on the panel rather than
  // each button so the user doesn't have to move focus into the panel first.
  // Skip binding when shortcutsEnabled is false (e.g. another activity tab is
  // showing) so we don't double-fire verdicts from a hidden Triage panel.
  useEffect(() => {
    if (!shortcutsEnabled) return;
    function onKey(event: KeyboardEvent) {
      if (!job) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const match = VERDICT_BUTTONS.find((b) => b.shortcut === event.key);
      if (match) {
        event.preventDefault();
        void applyVerdict(match.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, applyVerdict, shortcutsEnabled]);

  if (!job || !statusModel) return null;

  function handleNotesChange(value: string) {
    setScoreNotes(value);
    if (notesTimerRef.current) window.clearTimeout(notesTimerRef.current);
    notesTimerRef.current = window.setTimeout(() => {
      void patch({ scoreNotes: value.trim() });
    }, 600);
  }

  function commitNotesNow() {
    if (notesTimerRef.current) {
      window.clearTimeout(notesTimerRef.current);
      notesTimerRef.current = null;
    }
    if (scoreNotes.trim() !== (job?.scoreNotes || "").trim()) {
      void patch({ scoreNotes: scoreNotes.trim() });
    }
  }

  function commitNextActionNow() {
    if (nextAction.trim() !== (job?.nextAction || "").trim()) {
      void patch({ nextAction: nextAction.trim() });
    }
  }

  function commitDueDateNow() {
    if ((dueDate || "") !== (job?.dueDate || "")) {
      void patch({ dueDate });
    }
  }

  function handleGranularChange(
    field: "discoveryStatus" | "applicationStatus" | "interviewStatus" | "priorityTier",
    value: string,
  ) {
    if (field === "discoveryStatus") setDiscovery(value);
    if (field === "applicationStatus") setApplication(value);
    if (field === "interviewStatus") setInterview(value);
    if (field === "priorityTier") setTier(value);

    const body: Record<string, unknown> = { [field]: value };
    // Apply smart defaults if a status transition warrants one.
    if (field === "applicationStatus" || field === "interviewStatus") {
      const suggestion = smartDefaultsForStatus({
        applicationStatus: field === "applicationStatus" ? value : application,
        interviewStatus: field === "interviewStatus" ? value : interview,
        currentNextAction: nextAction,
        currentDueDate: dueDate,
      });
      if (suggestion?.nextAction) {
        body.nextAction = suggestion.nextAction;
        setNextAction(suggestion.nextAction);
      }
      if (suggestion?.dueDate) {
        body.dueDate = suggestion.dueDate;
        setDueDate(suggestion.dueDate);
      }
    }
    void patch(body);
  }

  async function handleLivenessSelect(value: string) {
    if (!job) return;
    const result = await patch({ postingStatus: value });
    if (result) {
      showToast(
        `Marked posting ${value}`,
        value === "dead" ? "warn" : "ok",
      );
    }
  }

  const savedStatus = patchJob.isPending
    ? "Saving..."
    : lastSavedAt
      ? "Saved"
      : "";

  const aiAnalysis = job.aiAnalysis;
  const aiRationale = aiAnalysis?.rationale?.trim() || "";
  const aiHooks = aiAnalysis?.fitHooks?.filter(Boolean) || [];
  const aiRisks = aiAnalysis?.risks?.filter(Boolean) || [];
  const hasAiSummary =
    aiRationale.length > 0 || aiHooks.length > 0 || aiRisks.length > 0;

  return (
    <div className="triage">
      <div className="triage-verdict">
        <div
          className="verdict-row"
          role="group"
          aria-label="Quick verdict"
        >
          {VERDICT_BUTTONS.map((b) => {
            const isActive = activeVerdict === b.id;
            const isRecommended = recommended === b.id && !activeVerdict;
            const style: "primary" | "secondary" =
              isActive || isRecommended ? "primary" : "secondary";
            return (
              <button
                key={b.id}
                type="button"
                className={`verdict-btn verdict-btn-${style} ${
                  isActive ? "is-active" : ""
                } verdict-${b.id}`}
                onClick={() => applyVerdict(b.id)}
                disabled={patchJob.isPending}
                aria-pressed={isActive}
                aria-keyshortcuts={b.shortcut}
                title={`${b.hint} (press ${b.shortcut})`}
              >
                <span className="verdict-btn-label">{b.label}</span>
                <kbd className="verdict-btn-kbd" aria-hidden="true">
                  {b.shortcut}
                </kbd>
              </button>
            );
          })}
        </div>
        <div className="muted small triage-saved" aria-live="polite">
          {savedStatus || "\u00a0"}
        </div>
      </div>

      <div className="triage-score">
        <div className="triage-score-line">
          <strong>{score}</strong>
          <span className="muted small">/ 100 · {rubric.name}</span>
          {breakdown ? (
            <span className="triage-score-summary" aria-label="Score breakdown summary">
              {breakdown.categories.map((cat, idx) => (
                <span key={cat.key} className="score-chunk">
                  {idx > 0 ? <span aria-hidden>·</span> : null}
                  <span className="score-chunk-label">{cat.label}</span>
                  <span className="score-chunk-num">
                    {cat.value}
                    <span className="muted">/{cat.cap}</span>
                  </span>
                </span>
              ))}
            </span>
          ) : null}
          <button
            type="button"
            className="link-button"
            onClick={() => toggleBreakdown(job.id)}
          >
            {breakdownExpanded ? "Hide breakdown" : "Score breakdown"}
          </button>
        </div>
        {breakdown && breakdownExpanded ? (
          <div className="score-breakdown">
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
              <div className="col-num">{breakdown.total}</div>
              <div className="col-num">/ 100</div>
              <div className="col-contrib">{breakdown.total}</div>
            </div>
          </div>
        ) : null}
      </div>

      {hasAiSummary ? (
        <section className="ai-rationale" aria-label="AI rationale">
          <div className="ai-rationale-head">
            <span className="ai-rationale-label">AI rationale</span>
            {Number.isFinite(aiAnalysis?.score) ? (
              <span className="pill ai">AI {aiAnalysis?.score}</span>
            ) : null}
          </div>
          {aiRationale ? <p>{aiRationale}</p> : null}
          {aiHooks.length ? (
            <div className="ai-rationale-list">
              <span className="ai-rationale-sublabel">Fit hooks</span>
              <ul>
                {aiHooks.map((hook, idx) => (
                  <li key={idx}>{hook}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {aiRisks.length ? (
            <div className="ai-rationale-list">
              <span className="ai-rationale-sublabel">Risks</span>
              <ul>
                {aiRisks.map((risk, idx) => (
                  <li key={idx}>{risk}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <label>
        <span>Your notes</span>
        <textarea
          rows={3}
          placeholder="What's your angle? Risks, contacts to ping, tailoring ideas..."
          value={scoreNotes}
          onChange={(event) => handleNotesChange(event.target.value)}
          onBlur={commitNotesNow}
        />
      </label>

      <div className="grid-2">
        <label>
          <span>Next action</span>
          <input
            type="text"
            placeholder="Follow up, draft outreach, customize resume bullets"
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            onBlur={commitNextActionNow}
          />
        </label>
        <label>
          <span>Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            onBlur={commitDueDateNow}
          />
        </label>
      </div>

      <details className="triage-granular">
        <summary>Granular status</summary>
        <div className="triage-granular-body">
          <div className="grid-4">
            <label>
              <span>Discovery</span>
              <select
                value={discovery}
                onChange={(event) =>
                  handleGranularChange("discoveryStatus", event.target.value)
                }
              >
                {statusModel.discoveryStatus.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Application</span>
              <select
                value={application}
                onChange={(event) =>
                  handleGranularChange("applicationStatus", event.target.value)
                }
              >
                {statusModel.applicationStatus.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Interview</span>
              <select
                value={interview}
                onChange={(event) =>
                  handleGranularChange("interviewStatus", event.target.value)
                }
              >
                {statusModel.interviewStatus.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Priority tier</span>
              <select
                value={tier}
                onChange={(event) =>
                  handleGranularChange("priorityTier", event.target.value)
                }
              >
                <option value="">Unset</option>
                <option value="apply_now">Apply now</option>
                <option value="selective">Selective</option>
                <option value="skip">Skip</option>
              </select>
            </label>
          </div>
        </div>
      </details>

      <div className="triage-posting">
        <h4>Posting summary</h4>
        <p className="muted small">
          {job.summary || "No description on file."}
        </p>
        <div className="triage-posting-meta">
          <label className="liveness">
            <span className="liveness-label muted small">Still live?</span>
            <select
              value={job.postingStatus || "unknown"}
              onChange={(event) => handleLivenessSelect(event.target.value)}
            >
              <option value="unknown">Unknown</option>
              <option value="live">Live</option>
              <option value="dead">Dead</option>
            </select>
          </label>
          {job.postingCheckedAt ? (
            <span className="muted small">
              Checked {new Date(job.postingCheckedAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
