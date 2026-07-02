import { useState } from "react";
import type { Job } from "../../types";
import { api } from "../../lib/api";
import {
  calculateScoreBreakdown,
  pickRubric,
} from "../../lib/scoring";
import { VERDICT_LABELS, currentVerdict } from "../../lib/verdicts";
import { useRubrics } from "../../hooks/queries";
import { showToast } from "../../lib/toast";

interface Props {
  job: Job;
  compact?: boolean;
}

function IconShare() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

interface Note {
  note: string;
  noteType?: string;
  createdAt?: string;
}

interface Contact {
  name: string;
  email?: string;
  contactType?: string;
}

function safeText(value: string | undefined | null): string {
  return (value || "").trim();
}

function indentList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function buildBriefMarkdown(args: {
  job: Job;
  rubric: ReturnType<typeof pickRubric>;
  notes: Note[];
  contacts: Contact[];
}): string {
  const { job, rubric, notes, contacts } = args;
  const breakdown = calculateScoreBreakdown(job, rubric);
  const verdict = currentVerdict(job);
  const verdictLabel = verdict ? VERDICT_LABELS[verdict] : "Not set";

  const lines: string[] = [];
  lines.push(`# ${job.title || "Untitled role"} - ${job.company || "Unknown"}`);
  lines.push("");
  const identityBits: string[] = [];
  if (job.location) identityBits.push(`Location: ${job.location}`);
  if (job.salary?.label) identityBits.push(`Salary: ${job.salary.label}`);
  if (job.lane) identityBits.push(`Lane: ${job.lane}`);
  if (job.source) identityBits.push(`Source: ${job.source}`);
  if (identityBits.length) lines.push(identityBits.join(" - "));
  if (job.roleUrl) lines.push(`Posting: ${job.roleUrl}`);
  lines.push("");

  lines.push(`## Fit score - ${breakdown.total} / 100 (${verdictLabel})`);
  lines.push(`Rubric: ${rubric.name}`);
  lines.push("");
  lines.push("| Category | Score | Cap |");
  lines.push("|---|---:|---:|");
  for (const cat of breakdown.categories) {
    lines.push(`| ${cat.label} | ${cat.value} | ${cat.cap} |`);
  }
  lines.push("");

  lines.push("## Status");
  lines.push(`- Discovery: ${job.discoveryStatus || "new"}`);
  lines.push(`- Application: ${job.applicationStatus || "not_started"}`);
  lines.push(`- Interview: ${job.interviewStatus || "waiting"}`);
  if (job.priorityTier) lines.push(`- Priority tier: ${job.priorityTier}`);
  lines.push("");

  if (safeText(job.nextAction) || safeText(job.dueDate)) {
    lines.push("## Next action");
    if (safeText(job.nextAction)) lines.push(`- ${job.nextAction}`);
    if (safeText(job.dueDate)) lines.push(`- Due: ${job.dueDate}`);
    lines.push("");
  }

  if (safeText(job.scoreNotes)) {
    lines.push("## Score notes");
    lines.push(safeText(job.scoreNotes));
    lines.push("");
  }

  const aiAnalysis = job.aiAnalysis;
  if (aiAnalysis) {
    lines.push("## AI fit summary");
    if (Number.isFinite(aiAnalysis.score)) {
      lines.push(`Score: ${aiAnalysis.score}`);
    }
    if (safeText(aiAnalysis.rationale)) {
      lines.push(safeText(aiAnalysis.rationale));
    }
    if (aiAnalysis.fitHooks?.length) {
      lines.push("");
      lines.push("**Fit hooks**");
      lines.push(indentList(aiAnalysis.fitHooks));
    }
    if (aiAnalysis.risks?.length) {
      lines.push("");
      lines.push("**Risks**");
      lines.push(indentList(aiAnalysis.risks));
    }
    lines.push("");
  }

  if (notes.length) {
    lines.push("## Recent notes");
    const recent = notes.slice(0, 5);
    for (const note of recent) {
      const when = note.createdAt
        ? new Date(note.createdAt).toLocaleDateString()
        : "";
      const prefix = when ? `${when} - ` : "";
      lines.push(`- ${prefix}${safeText(note.note)}`);
    }
    lines.push("");
  }

  if (contacts.length) {
    lines.push("## Contacts");
    for (const contact of contacts) {
      const parts = [contact.name];
      if (contact.contactType) parts.push(`(${contact.contactType})`);
      if (contact.email) parts.push(contact.email);
      lines.push(`- ${parts.filter(Boolean).join(" ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function ShareRoleBriefButton({ job, compact = false }: Props) {
  const rubricsQuery = useRubrics();
  const rubric = pickRubric(rubricsQuery.data, job.lane);
  const [busy, setBusy] = useState(false);

  async function loadSideData(): Promise<{
    notes: Note[];
    contacts: Contact[];
  }> {
    try {
      const [notesPayload, contactsPayload] = await Promise.all([
        api<{ notes: Note[] }>(`/api/jobs/${job.id}/notes`),
        api<{ contacts: Contact[] }>(`/api/jobs/${job.id}/contacts`),
      ]);
      return {
        notes: notesPayload.notes || [],
        contacts: contactsPayload.contacts || [],
      };
    } catch {
      // Brief is still useful without notes/contacts.
      return { notes: [], contacts: [] };
    }
  }

  async function handleCopy() {
    setBusy(true);
    try {
      const { notes, contacts } = await loadSideData();
      const markdown = buildBriefMarkdown({ job, rubric, notes, contacts });
      await navigator.clipboard.writeText(markdown);
      showToast("Role brief copied to clipboard", "ok");
    } catch (error: any) {
      showToast(`Couldn't copy: ${error?.message || "unknown error"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    setBusy(true);
    try {
      const { notes, contacts } = await loadSideData();
      const markdown = buildBriefMarkdown({ job, rubric, notes, contacts });
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = `${job.company || "role"}-${job.title || "brief"}`
        .replace(/[^a-z0-9-_ ]/gi, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase();
      a.href = url;
      a.download = `${safe || "role-brief"}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Role brief downloaded", "ok");
    } catch (error: any) {
      showToast(`Couldn't download: ${error?.message || "unknown error"}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className={`role-brief ${compact ? "is-compact" : ""}`}>
      <summary
        className={compact ? "icon-button" : ""}
        title={compact ? "Share role brief" : undefined}
        aria-label={compact ? "Share role brief" : undefined}
      >
        {compact ? (
          <>
            <IconShare />
            {busy ? <span className="icon-button-label">Sharing</span> : null}
          </>
        ) : busy ? (
          "Sharing..."
        ) : (
          "Share brief"
        )}
      </summary>
      <div className="role-brief-menu">
        <button type="button" onClick={handleCopy} disabled={busy}>
          Copy as Markdown
        </button>
        <button type="button" onClick={handleDownload} disabled={busy}>
          Download .md
        </button>
      </div>
    </details>
  );
}
