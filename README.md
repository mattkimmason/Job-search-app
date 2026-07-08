# Local Job Tracker

Local Job Tracker is a private, local-first job-search workspace for capturing target roles, prioritizing them against a scoring rubric, and tracking applications through follow-ups, interviews, and outcomes.

It is designed for one user running the app on their own machine. Job data lives in a local SQLite database, and optional LLM features only run when explicitly triggered.

## Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Development](#development)
- [Project Structure](#project-structure)
- [Stack](#stack)
- [Data and Storage](#data-and-storage)
- [Job Intake](#job-intake)
- [Optional LLM Assist](#optional-llm-assist)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [MCP Server (Optional)](#mcp-server-optional)
- [Roadmap and Project Docs](#roadmap-and-project-docs)
- [License](#license)

## Features

- **Today hub** for outreach due, follow-ups, stale postings, and near-term actions.
- **Job intake** through manual entry, Markdown import, CSV import, public job lookup, or AI-assisted parsing from a role URL plus job description.
- **Triage workflow** with local scoring, status tracking, duplicate warnings, and posting-liveness checks.
- **Pipeline workspace** for application state, notes, contacts, events, outreach, and interview activity.
- **Insights dashboard** for funnel metrics, reminders, source performance, and saved-view performance.
- **Local snapshots** through JSON import/export.
- **Optional AI assist** for fit scoring, job-description extraction, outreach drafts, fit summaries, and interview prep.

## Quick Start

Requirements:

- Windows PowerShell or another shell that can run Node commands.
- Node.js `>=22`.
- npm.

Install the frontend dependencies, build the React app, and start the local server:

```powershell
npm run web:install
npm run web:build
npm start
```

Open `http://127.0.0.1:4310`.

The Node server handles both `/api/*` requests and the built React app in `web/dist`. Client-side routes such as `/pipeline` and `/insights` work after refresh because the server includes an SPA fallback.

To use a different port for one PowerShell session:

```powershell
$env:PORT=4315; npm start
```

You can also start the server directly:

```powershell
node server.js
```

## Development

For hot reload, run the API server and Vite dev server in separate terminals:

```powershell
# Terminal 1 - API on http://127.0.0.1:4310
node server.js
```

```powershell
# Terminal 2 - Vite on http://localhost:5173
npm --prefix web run dev
```

Then open `http://localhost:5173`. The Vite dev server proxies `/api` requests to the Node server.

Useful commands:

```powershell
npm start
npm run web:build
npm run web:lint
npm run web:typecheck
```

## Project Structure

```text
.
|-- server.js              # Node HTTP server, API routes, SQLite access
|-- web/                   # Vite + React + TypeScript frontend
|-- data/                  # Local database, seed data, and profile data
|-- Docs/                  # Resume, LinkedIn, and deep-research prompt docs
|-- job-search/            # Operating model, runbook, templates, and scoring docs
|-- FEATURE_BACKLOG.md     # Roadmap, feature status, and release notes
`-- README.md              # Project overview and setup guide
```

## Stack

- **Backend:** Node.js built-in `http` plus `node:sqlite` in `server.js`.
- **Frontend:** Vite, React 18, TypeScript, React Router, TanStack Query, and Zustand in `web/`.
- **Styling:** Tailwind CSS v4 with the `@tailwindcss/vite` plugin and an `oklch` design-token system. A small set of shadcn-style primitives lives under `web/src/components/ui/` (Button, Input, Textarea, Badge, Card, Tabs, Tooltip, Dialog, Select, Separator, Progress, ScrollArea), backed by Radix UI where popovers/dialogs are needed. Icons are from `lucide-react`. The app defaults to a dark theme; an Appearance toggle in Settings (Light / Dark / System) flips a `dark` class on `<html>` and persists to `localStorage` via the `jsing.theme` key.
- **Data:** Local SQLite at `data/job-tracker.db`.

## Data and Storage

Runtime data is local to this workspace:

- SQLite database: `data/job-tracker.db`, created on first run.
- Seed data: `data/seed-jobs.json`.
- Candidate profile: `data/candidate-profile.json`.

Canonical status tracks:

- `discoveryStatus`: `new`, `researching`, `target`, `not_a_fit`.
- `applicationStatus`: `not_started`, `in_progress`, `applied`, `rejected`.
- `interviewStatus`: `waiting`, `screen_scheduled`, `screen_done`, `interview_scheduled`, `interview_done`, `offer`, `closed`.

Treat `data/job-tracker.db` as local runtime state. Use the app or API import/export flows instead of hand-editing the database file.

## Job Intake

Use **+ Add Job** to add roles.

Manual intake captures a role quickly and scores it against the local rubric. If an LLM is configured, you can paste a role URL plus the full job description and click **Parse with AI** to fill company, title, location, salary, summary, and keywords. All fields remain editable before saving.

Markdown and CSV intake support paste or file upload. Markdown imports use the configured LLM to turn deep-research output into a reviewable preview. CSV imports are deterministic and do not require an LLM; they require `company` and `title` or `role` columns, with common aliases for fields such as `location`, `url`, `salary`, `summary`, and `source`.

Lookup roles pulls public postings from The Muse using the saved search strategy.

The Markdown / CSV tab also exposes deep-research prompts from `Docs/Deep Research Prompt*.md`. Copy a prompt, run it in an external research tool, then paste the results back into the app for parsing.

## Optional LLM Assist

LLM features are explicit, user-triggered actions. They are available from Settings and the per-job **AI assist** panel in Pipeline.

The app expects an OpenAI Chat Completions-compatible endpoint: `/v1/chat/completions`, `Authorization: Bearer <key>`, and a response shaped like `{ choices: [{ message: { content } }] }`.

Configure LLM settings in the UI or with environment variables:

```powershell
$env:LLM_ENDPOINT="https://example.com/v1/chat/completions"
$env:LLM_MODEL="model-name"
$env:LLM_API_KEY="your-key"
npm start
```

Environment variables take precedence over stored settings. When configured through the UI, API keys are encrypted locally before storage.

Available AI assist actions:

- **AI match score:** returns a 0-100 score, recommended tier, rationale, fit hooks, risks, and keyword gaps.
- **Summarize / extract a job description:** turns raw posting text into structured summary, responsibilities, qualifications, keywords, and red flags.
- **Fit summary, outreach draft, and interview pack:** generate editable drafts that are not auto-saved.

## API Reference

Meta and configuration:

- `GET /api/health`
- `GET /api/status-model`
- `GET /api/profile`
- `GET /api/strategy`
- `PUT /api/strategy`
- `GET /api/research/prompts`

Jobs and subresources:

- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `PATCH /api/jobs/:id`
- `GET|POST /api/jobs/:id/notes`
- `GET|POST /api/jobs/:id/contacts`
- `GET|POST /api/jobs/:id/events`

Intake:

- `POST /api/import/markdown`
- `POST /api/import/csv`
- `POST /api/research/jobs`

Metrics and reminders:

- `GET /api/metrics/summary`
- `GET /api/metrics/strategy-performance`
- `GET /api/reminders`
- `PATCH /api/reminders/:key`

Snapshots and saved views:

- `GET /api/export`
- `POST /api/import`
- `GET|POST /api/saved-views`
- `PATCH|DELETE /api/saved-views/:id`

LLM:

- `GET|PUT /api/settings/llm`
- `POST /api/llm/fit-score`
- `POST /api/llm/fit-summary`
- `POST /api/llm/outreach-draft`
- `POST /api/llm/interview-pack`
- `POST /api/llm/summarize-jd`

Validation errors such as invalid status values or malformed JSON return `400`. Duplicate roles return `409`. Unknown API routes return `404`.

## Troubleshooting

If `npm start` fails with `AuthorizationManager check failed` or `PSSecurityException`, Node/npm files may carry a Windows "Mark of the Web" flag that blocks the `npm.ps1` shim. Clear it with:

```powershell
Get-ChildItem "C:\Users\<you>\nodejs" -Recurse | Unblock-File
```

As a fallback, `node server.js` runs the app without the npm script shim.

If `npm --prefix web install` fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` on a corporate network, `web/.npmrc` sets `strict-ssl=false` locally for the web project so dependency installs can work through TLS interception. The Node API itself only reaches the public npm registry during dependency installation.

## MCP Server (Optional)

`mcp-job-tracker/` is a separate, **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server (TypeScript, stdio) that exposes this app's REST API as safe agent tools for MCP clients like Claude Desktop and Cursor. It never touches the SQLite database directly — it only calls the running app over HTTP — and it exposes five bounded, Zod-validated tools (`job_tracker_list_jobs`, `job_tracker_get_job`, `job_tracker_search_jobs`, `job_tracker_get_reminders`, `job_tracker_get_interview_pack`) plus a `prepare_for_interview` prompt. Every tool is annotated read-only, idempotent, and closed-world; results are bounded and passed through a secret-redaction allow-list.

Requires the app to be running (`npm start`). See [`mcp-job-tracker/README.md`](mcp-job-tracker/README.md) for install/build/run steps and the MCP client config, and [`Docs/MCP-Job-Tracker-Showcase.md`](Docs/MCP-Job-Tracker-Showcase.md) for a write-up of the design decisions. Automated tests live under `mcp-job-tracker/scripts/` (`npm run test:smoke` / `npm run test:smoke:fallback`).

## Roadmap and Project Docs

- `FEATURE_BACKLOG.md` tracks feature status, dependencies, success criteria, and completed notes.
- `job-search/tracker.md` documents the status flow, scoring rubric, and tracker model.
- `job-search/runbook.md` documents search cadence, conversion metrics, and operating expectations.
- `Docs/` contains candidate source documents and deep-research prompts used by the app.

## License

No license file is currently included.
