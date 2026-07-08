#!/usr/bin/env node
/**
 * mcp-job-tracker — read-only MCP wrapper over the JSing REST API.
 *
 * All tools are read-only. Every response is passed through `redact()` so
 * secret-like keys (apiKey, *_encrypted, authorization, settings, ...) can
 * never leak. Diagnostics go to stderr; stdout is reserved for JSON-RPC.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SERVER_NAME = "jsing-job-tracker";
const SERVER_VERSION = "0.1.1";
const BASE_URL = (process.env.JSING_BASE_URL ?? "http://127.0.0.1:4310").replace(/\/+$/, "");
const TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.JSING_TIMEOUT_MS ?? "10000", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10000;
  return Math.max(500, parsed);
})();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface FetchOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

class JsingError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status = 0, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function jsingFetch(path: string, opts: FetchOptions = {}): Promise<any> {
  const method = opts.method ?? "GET";
  const url = `${BASE_URL}${path}`;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init: RequestInit = {
      method,
      signal: controller.signal,
      headers: opts.body != null ? { "Content-Type": "application/json" } : undefined,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    };
    const res = await fetch(url, init);
    if (res.status === 404) {
      throw new JsingError("not_found", 404);
    }
    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      throw new JsingError(
        `JSing returned ${res.status} for ${method} ${path}. ${bodyText}`.trim(),
        res.status,
        bodyText,
      );
    }
    try {
      return await res.json();
    } catch {
      throw new JsingError(`JSing returned non-JSON body for ${method} ${path}.`);
    }
  } catch (err: unknown) {
    if (err instanceof JsingError) throw err;
    const anyErr = err as { name?: string; message?: string } | undefined;
    if (anyErr?.name === "AbortError") {
      throw new JsingError(
        `JSing did not respond within ${timeoutMs}ms at ${BASE_URL}. Is it running and healthy?`,
      );
    }
    throw new JsingError(
      `Cannot reach JSing at ${BASE_URL}. Start JSing with \`npm start\` first. (${anyErr?.message ?? String(err)})`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function clampLimit(n: unknown, def = 20, max = 100): number {
  const raw = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : NaN;
  if (!Number.isFinite(raw) || raw <= 0) return def;
  if (raw > max) return max;
  return raw;
}

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /apikey/i,
  /api_key/i,
  /authorization/i,
  /_encrypted$/i,
  /^encrypted/i,
  /secret/i,
  /password/i,
  /^bearer/i,
  /credential/i,
  /^llm_api_key/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((rx) => rx.test(key));
}

function redact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redact(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) continue;
      out[k] = redact(v);
    }
    return out as unknown as T;
  }
  return value;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string; [k: string]: unknown }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [k: string]: unknown;
}

function textResult(text: string, structuredContent: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Shared Zod pieces
// ---------------------------------------------------------------------------

const discoveryStatus = z.enum(["new", "researching", "target", "not_a_fit"]);
const applicationStatus = z.enum(["not_started", "in_progress", "applied", "rejected"]);
const interviewStatus = z.enum([
  "waiting",
  "screen_scheduled",
  "screen_done",
  "interview_scheduled",
  "interview_done",
  "offer",
  "closed",
]);
const jobId = z.union([z.string().min(1), z.number()]).transform(String);

const jobRow = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  url: z.string(),
  discoveryStatus: z.string(),
  applicationStatus: z.string(),
  interviewStatus: z.string(),
  score: z.number(),
  priorityTier: z.string(),
  updatedAt: z.string(),
});
type JobRow = z.infer<typeof jobRow>;

function toJobRow(job: any): JobRow {
  return {
    id: String(job?.id ?? ""),
    company: String(job?.company ?? ""),
    title: String(job?.title ?? ""),
    location: String(job?.location ?? ""),
    url: String(job?.roleUrl || job?.sourceUrl || ""),
    discoveryStatus: String(job?.discoveryStatus ?? ""),
    applicationStatus: String(job?.applicationStatus ?? ""),
    interviewStatus: String(job?.interviewStatus ?? ""),
    score: Number.isFinite(job?.score) ? Number(job.score) : 0,
    priorityTier: String(job?.priorityTier ?? ""),
    updatedAt: String(job?.updatedAt ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Interview-pack deterministic fallback
// ---------------------------------------------------------------------------

function firstN<T>(arr: T[] | undefined | null, n: number): T[] {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

function likelyQuestionsFrom(job: any): string[] {
  const kw = firstN<string>(job?.keywords, 5)
    .map((k) => String(k))
    .filter(Boolean);
  const title = String(job?.title ?? "the role");
  const company = String(job?.company ?? "this company");
  const generic = [
    `Why this role at ${company} and why now?`,
    `Walk me through an initiative that best mirrors what a ${title} needs on day one.`,
    "Tell me about a difficult stakeholder trade-off you navigated recently.",
    "Describe a program you led end-to-end and how you measured success.",
    "Where do you have the sharpest gap for this role, and how are you closing it?",
  ];
  const kwQuestions = kw.map((k) => `Walk me through your experience with ${k}.`);
  return [...kwQuestions, ...generic].slice(0, 5);
}

function storiesFrom(job: any): string[] {
  const hooks = firstN<string>(job?.fitHooks, 5).map((h) => String(h)).filter(Boolean);
  if (hooks.length) return hooks.map((h) => `Story: ${h}`);
  const kw = firstN<string>(job?.keywords, 5).map((k) => String(k)).filter(Boolean);
  return kw.map((k) => `Story: a time you delivered outcomes on ${k}.`);
}

function questionsToAsk(): string[] {
  return [
    "What does outcome-level success look like in the first 90 days?",
    "How is the team structured today, and where do the biggest seams sit?",
    "What is on the near-term roadmap that this role will most influence?",
    "How is performance in this role measured after 6 and 12 months?",
    "Why is the role open now, and what have prior owners struggled with?",
  ];
}

function buildFallbackPack(job: any, notes: any[]): string {
  const lines: string[] = [];
  const title = job?.title || "this role";
  const company = job?.company || "this company";
  lines.push(`Interview Prep — ${title} at ${company}`);
  const status = `${job?.discoveryStatus ?? "?"} / ${job?.applicationStatus ?? "?"} / ${job?.interviewStatus ?? "?"}`;
  const scoreLine = `Score: ${Number.isFinite(job?.score) ? job.score : "n/a"}${job?.priorityTier ? ` (${job.priorityTier})` : ""}`;
  lines.push(`Status: ${status}  |  ${scoreLine}`);
  lines.push("");
  lines.push("Role summary");
  lines.push(job?.summary ? String(job.summary) : "No summary saved for this role.");
  lines.push("");
  lines.push("Focus keywords");
  const kw = firstN<string>(job?.keywords, 12).map((k) => String(k)).filter(Boolean);
  lines.push(kw.length ? kw.join(", ") : "None saved.");
  lines.push("");
  lines.push("Likely questions (5)");
  for (const q of likelyQuestionsFrom(job)) lines.push(`- ${q}`);
  lines.push("");
  lines.push("Stories to prepare (up to 5)");
  const stories = storiesFrom(job);
  if (stories.length) {
    for (const s of stories) lines.push(`- ${s}`);
  } else {
    lines.push("- No fit hooks or keywords saved yet. Add fitHooks or keywords in JSing to seed this section.");
  }
  const risks = firstN<string>(job?.risks, 5).map((r) => String(r)).filter(Boolean);
  if (risks.length) {
    lines.push("");
    lines.push("Risks / gaps to address (up to 5)");
    for (const r of risks) lines.push(`- ${r}`);
  }
  lines.push("");
  lines.push("Questions to ask them (5)");
  for (const q of questionsToAsk()) lines.push(`- ${q}`);
  lines.push("");
  lines.push("Prep checklist");
  const nextAction = job?.nextAction ? String(job.nextAction) : "set one";
  const dueDate = job?.dueDate ? String(job.dueDate) : "n/a";
  lines.push(`- Next action: ${nextAction} (due ${dueDate})`);
  const noteCount = Array.isArray(notes) ? notes.length : 0;
  const latest = Array.isArray(notes) && notes.length ? String(notes[0]?.note ?? "").slice(0, 140) : "none";
  lines.push(`- Saved notes: ${noteCount} — most recent: ${latest || "none"}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

server.registerTool(
  "job_tracker_list_jobs",
  {
    title: "List jobs",
    description:
      "List recent jobs from the local JSing tracker, optionally filtered by status. Use when the user wants a bounded overview by status (e.g. 'show my target jobs', 'what have I applied to?', 'list roles waiting on a screen'). Do NOT use when the user has a keyword or phrase to match — prefer job_tracker_search_jobs. Do NOT use to fetch one job's full details — prefer job_tracker_get_job. Optional filters: query (server-side substring on company/title/summary), discoveryStatus, applicationStatus, interviewStatus. Returns up to 100 rows (default 20). Read-only.",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe("Optional substring search over company/title/summary."),
      limit: z
        .number()
        .int()
        .optional()
        .describe("Max rows (1..100, default 20). Values <=0 fall back to default; >100 clamps to 100."),
      discoveryStatus: discoveryStatus.optional(),
      applicationStatus: applicationStatus.optional(),
      interviewStatus: interviewStatus.optional(),
    },
    outputSchema: {
      ok: z.boolean(),
      source: z.literal("jsing-rest"),
      baseUrl: z.string(),
      count: z.number().int(),
      total: z.number().int(),
      jobs: z.array(jobRow),
    },
    annotations: readOnlyAnnotations,
  },
  async (args) => {
    const params = new URLSearchParams();
    if (args.query) params.set("search", String(args.query));
    if (args.discoveryStatus) params.set("discoveryStatus", args.discoveryStatus);
    if (args.applicationStatus) params.set("applicationStatus", args.applicationStatus);
    if (args.interviewStatus) params.set("interviewStatus", args.interviewStatus);
    const qs = params.toString();
    try {
      const data = await jsingFetch(`/api/jobs${qs ? `?${qs}` : ""}`);
      const allJobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
      const limit = clampLimit(args.limit);
      const bounded: JobRow[] = allJobs.slice(0, limit).map((j: any) => toJobRow(j));
      const structured = redact({
        ok: true,
        source: "jsing-rest" as const,
        baseUrl: BASE_URL,
        count: bounded.length,
        total: allJobs.length,
        jobs: bounded,
      });
      const preview = bounded
        .slice(0, 10)
        .map(
          (j) =>
            `- ${j.company} — ${j.title} [${j.discoveryStatus}/${j.applicationStatus}/${j.interviewStatus}]`,
        )
        .join("\n");
      const summary =
        `Found ${allJobs.length} job(s); returning ${bounded.length}.` +
        (preview ? `\n${preview}` : "");
      return textResult(summary, structured);
    } catch (err) {
      return errorResult((err as Error).message || "list_jobs failed");
    }
  },
);

server.registerTool(
  "job_tracker_get_job",
  {
    title: "Get one job",
    description:
      "Fetch full details for one job by ID, including notes, contacts, and events. Use when the user references a specific job (by ID, or after it was surfaced by list/search) and wants its full context. Do NOT use to browse or filter multiple jobs — prefer job_tracker_list_jobs or job_tracker_search_jobs to find the ID first. Read-only.",
    inputSchema: {
      id: jobId,
    },
    outputSchema: {
      ok: z.boolean(),
      source: z.literal("jsing-rest"),
      baseUrl: z.string(),
      job: z.record(z.unknown()),
      notes: z.array(z.record(z.unknown())),
      contacts: z.array(z.record(z.unknown())),
      events: z.array(z.record(z.unknown())),
    },
    annotations: readOnlyAnnotations,
  },
  async (args) => {
    const id = String(args.id);
    try {
      let jobPayload: any;
      try {
        jobPayload = await jsingFetch(`/api/jobs/${encodeURIComponent(id)}`);
      } catch (err) {
        const je = err as JsingError;
        if (je.status === 404) return errorResult(`No job found with ID ${id}.`);
        throw err;
      }
      const job = jobPayload?.job ?? jobPayload;
      const [notesRes, contactsRes, eventsRes] = await Promise.allSettled([
        jsingFetch(`/api/jobs/${encodeURIComponent(id)}/notes`),
        jsingFetch(`/api/jobs/${encodeURIComponent(id)}/contacts`),
        jsingFetch(`/api/jobs/${encodeURIComponent(id)}/events`),
      ]);
      const notes =
        notesRes.status === "fulfilled" && Array.isArray((notesRes.value as any)?.notes)
          ? (notesRes.value as any).notes
          : [];
      const contacts =
        contactsRes.status === "fulfilled" && Array.isArray((contactsRes.value as any)?.contacts)
          ? (contactsRes.value as any).contacts
          : [];
      const events =
        eventsRes.status === "fulfilled" && Array.isArray((eventsRes.value as any)?.events)
          ? (eventsRes.value as any).events
          : [];
      const structured = redact({
        ok: true,
        source: "jsing-rest" as const,
        baseUrl: BASE_URL,
        job,
        notes,
        contacts,
        events,
      });
      const summary = [
        `${job?.company ?? "(no company)"} — ${job?.title ?? "(no title)"}`,
        `Status: ${job?.discoveryStatus}/${job?.applicationStatus}/${job?.interviewStatus}`,
        `Score: ${job?.score ?? "n/a"}${job?.priorityTier ? ` (${job.priorityTier})` : ""}`,
        `Notes: ${notes.length}, Contacts: ${contacts.length}, Events: ${events.length}`,
      ].join("\n");
      return textResult(summary, structured);
    } catch (err) {
      return errorResult((err as Error).message || "get_job failed");
    }
  },
);

server.registerTool(
  "job_tracker_search_jobs",
  {
    title: "Search jobs",
    description:
      "Case-insensitive keyword/phrase search across company, title, summary, and keywords. Use when the user has a substring or topic to match (e.g. 'find AI product roles', 'anything mentioning fintech', 'roles at Acme'). Do NOT use when the user just wants a list by status — prefer job_tracker_list_jobs. Bounded, returns up to 100 rows (default 20). Read-only.",
    inputSchema: {
      query: z.string().trim().min(1, "query is required"),
      limit: z.number().int().optional(),
    },
    outputSchema: {
      ok: z.boolean(),
      source: z.literal("jsing-rest"),
      baseUrl: z.string(),
      query: z.string(),
      fieldsSearched: z.array(z.string()),
      count: z.number().int(),
      jobs: z.array(jobRow),
    },
    annotations: readOnlyAnnotations,
  },
  async (args) => {
    const rawQuery = String(args.query);
    const q = rawQuery.trim().toLowerCase();
    const limit = clampLimit(args.limit);
    try {
      const data = await jsingFetch(`/api/jobs`);
      const allJobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
      const matched = allJobs.filter((j) => {
        const hay = [
          String(j?.company ?? ""),
          String(j?.title ?? ""),
          String(j?.summary ?? ""),
          ...(Array.isArray(j?.keywords) ? j.keywords.map(String) : []),
        ]
          .join("\n")
          .toLowerCase();
        return hay.includes(q);
      });
      const bounded = matched.slice(0, limit).map(toJobRow);
      const structured = redact({
        ok: true,
        source: "jsing-rest" as const,
        baseUrl: BASE_URL,
        query: rawQuery,
        fieldsSearched: ["company", "title", "summary", "keywords"],
        count: bounded.length,
        jobs: bounded,
      });
      const preview = bounded
        .slice(0, 10)
        .map((j) => `- ${j.company} — ${j.title}`)
        .join("\n");
      const summary =
        `Searched ${allJobs.length} job(s) across company/title/summary/keywords for "${rawQuery}"; ${bounded.length} match(es).` +
        (preview ? `\n${preview}` : "");
      return textResult(summary, structured);
    } catch (err) {
      return errorResult((err as Error).message || "search_jobs failed");
    }
  },
);

server.registerTool(
  "job_tracker_get_reminders",
  {
    title: "Get reminders",
    description:
      "Current outreach / follow-up reminders from JSing. Read-only. Limit clamped to 1..100 (default 20).",
    inputSchema: {
      limit: z.number().int().optional(),
    },
    outputSchema: {
      ok: z.boolean(),
      source: z.literal("jsing-rest"),
      baseUrl: z.string(),
      count: z.number().int(),
      reminders: z.array(
        z.object({
          key: z.string(),
          type: z.string(),
          severity: z.string(),
          dueDate: z.string(),
          ageBusinessDays: z.number(),
          title: z.string(),
          detail: z.string(),
          jobId: z.string(),
        }),
      ),
    },
    annotations: readOnlyAnnotations,
  },
  async (args) => {
    const limit = clampLimit(args.limit);
    try {
      const data = await jsingFetch(`/api/reminders`);
      const all: any[] = Array.isArray(data?.reminders) ? data.reminders : [];
      const bounded = all.slice(0, limit).map((r) => ({
        key: String(r?.key ?? ""),
        type: String(r?.type ?? ""),
        severity: String(r?.severity ?? ""),
        dueDate: String(r?.dueDate ?? ""),
        ageBusinessDays: Number.isFinite(r?.ageBusinessDays) ? Number(r.ageBusinessDays) : 0,
        title: String(r?.title ?? ""),
        detail: String(r?.detail ?? ""),
        jobId: String(r?.jobId ?? ""),
      }));
      const structured = redact({
        ok: true,
        source: "jsing-rest" as const,
        baseUrl: BASE_URL,
        count: bounded.length,
        reminders: bounded,
      });
      const preview = bounded
        .map((r) => `- [${r.severity}] ${r.title} — ${r.detail} (due ${r.dueDate})`)
        .join("\n");
      const summary =
        `Reminders: ${all.length} total; returning ${bounded.length}.` + (preview ? `\n${preview}` : "");
      return textResult(summary, structured);
    } catch (err) {
      return errorResult((err as Error).message || "get_reminders failed");
    }
  },
);

server.registerTool(
  "job_tracker_get_interview_pack",
  {
    title: "Interview pack",
    description:
      "Assemble a ready-to-read interview prep pack for one job by ID. Use when the user asks to prepare for an interview at a specific role. Do NOT use for a general question about a job (prefer job_tracker_get_job) or to find a job (prefer list/search). Calls the local LLM endpoint if configured; otherwise returns a deterministic fallback built only from saved job data (company, title, summary, keywords, fitHooks, risks, notes). Read-only.",
    inputSchema: {
      id: jobId,
    },
    outputSchema: {
      ok: z.boolean(),
      source: z.literal("jsing-rest"),
      baseUrl: z.string(),
      jobId: z.string(),
      usedLlm: z.boolean(),
      pack: z.string(),
      generatedBy: z.enum(["llm", "deterministic-fallback"]),
    },
    annotations: readOnlyAnnotations,
  },
  async (args) => {
    const id = String(args.id);
    try {
      let jobPayload: any;
      try {
        jobPayload = await jsingFetch(`/api/jobs/${encodeURIComponent(id)}`);
      } catch (err) {
        const je = err as JsingError;
        if (je.status === 404) return errorResult(`No job found with ID ${id}.`);
        throw err;
      }
      const job = jobPayload?.job ?? jobPayload;

      const notesRes = await Promise.allSettled([
        jsingFetch(`/api/jobs/${encodeURIComponent(id)}/notes`),
      ]);
      const notes =
        notesRes[0].status === "fulfilled" && Array.isArray((notesRes[0].value as any)?.notes)
          ? (notesRes[0].value as any).notes
          : [];

      let usedLlm = false;
      let llmText = "";
      try {
        const llmRes = await jsingFetch(`/api/llm/interview-pack`, {
          method: "POST",
          body: { jobId: id },
        });
        usedLlm = Boolean(llmRes?.usedLlm);
        llmText = String(llmRes?.text ?? "").trim();
      } catch {
        usedLlm = false;
      }

      let pack: string;
      let generatedBy: "llm" | "deterministic-fallback";
      if (usedLlm && llmText) {
        pack = llmText;
        generatedBy = "llm";
      } else {
        pack = buildFallbackPack(job, notes);
        generatedBy = "deterministic-fallback";
      }

      const structured = redact({
        ok: true,
        source: "jsing-rest" as const,
        baseUrl: BASE_URL,
        jobId: id,
        usedLlm,
        pack,
        generatedBy,
      });
      const heading =
        generatedBy === "llm"
          ? `Interview pack (LLM) for ${job?.title ?? "role"} at ${job?.company ?? "company"}`
          : `Interview pack (deterministic fallback) for ${job?.title ?? "role"} at ${job?.company ?? "company"}`;
      return textResult(`${heading}\n\n${pack}`, structured);
    } catch (err) {
      return errorResult((err as Error).message || "get_interview_pack failed");
    }
  },
);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * A user-triggered workflow (slash-command in most clients) that loads a job's
 * saved context and hands the LLM a ready-to-run interview-prep brief. Unlike
 * the `job_tracker_get_interview_pack` tool (which returns a finished pack),
 * this returns instructions + context so the user can steer the conversation.
 */
server.registerPrompt(
  "prepare_for_interview",
  {
    title: "Prepare for interview",
    description:
      "Kick off interview prep for a specific job. Loads the saved role context (summary, keywords, fit hooks, risks) and asks the model to draft likely questions, story prompts, and questions to ask. Use the job's ID from job_tracker_list_jobs / job_tracker_search_jobs.",
    argsSchema: {
      jobId: z.string().min(1).describe("The JSing job ID to prepare for."),
    },
  },
  async ({ jobId }) => {
    const id = String(jobId);
    let job: any = null;
    let contextText: string;
    try {
      const payload = await jsingFetch(`/api/jobs/${encodeURIComponent(id)}`);
      job = redact(payload?.job ?? payload);
    } catch (err) {
      const je = err as JsingError;
      const missing =
        je.status === 404
          ? `No job found with ID ${id}. List jobs first with job_tracker_list_jobs to find a valid ID.`
          : (err as Error).message;
      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: missing },
          },
        ],
      };
    }

    const company = String(job?.company ?? "the company");
    const title = String(job?.title ?? "the role");
    const summary = job?.summary ? String(job.summary) : "(no summary saved)";
    const keywords = firstN<string>(job?.keywords, 12).map(String).filter(Boolean);
    const fitHooks = firstN<string>(job?.fitHooks, 8).map(String).filter(Boolean);
    const risks = firstN<string>(job?.risks, 8).map(String).filter(Boolean);

    contextText = [
      `Help me prepare for the interview at ${company} for the ${title} role.`,
      "",
      "Saved context:",
      `- Summary: ${summary}`,
      `- Keywords: ${keywords.length ? keywords.join(", ") : "(none saved)"}`,
      `- Fit hooks: ${fitHooks.length ? fitHooks.join("; ") : "(none saved)"}`,
      `- Risks / gaps: ${risks.length ? risks.join("; ") : "(none saved)"}`,
      "",
      "Please draft: five likely interview questions, five story prompts I should prepare (grounded in the fit hooks above where possible), five thoughtful questions to ask them, and a short prep checklist. Base everything on the saved context; clearly flag anything you are assuming.",
    ].join("\n");

    return {
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: contextText },
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[${SERVER_NAME}] v${SERVER_VERSION} listening on stdio; baseUrl=${BASE_URL}, timeout=${TIMEOUT_MS}ms`,
  );
}

function shutdown(signal: string): void {
  console.error(`[${SERVER_NAME}] ${signal} received; shutting down.`);
  server
    .close()
    .catch(() => {
      /* ignore */
    })
    .finally(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error(`[${SERVER_NAME}] fatal:`, (err as Error)?.stack ?? err);
  process.exit(1);
});
