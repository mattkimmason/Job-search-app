# Local Job Tracker Architecture

This document describes the current as-built architecture for the local-only job tracker application.

## 1) Goals and Constraints

- Local-first operation (no required cloud backend for core tracking)
- Fast iteration with minimal stack surface area
- Structured persistence for job pipeline data
- Browser UX backed by explicit HTTP APIs
- Optional LLM integrations that are user-triggered and configurable

## 2) System Overview

The application is a two-tier local system:

1. **Frontend UX**: Vite + React 18 + TypeScript SPA in `web/`; built output served from `web/dist`. The legacy vanilla-JS frontend in `app/` (`index.html`, `app.js`, `styles.css`) is still routable at `/app/` for fallback but the SPA is the active frontend.
2. **Backend server**: single Node.js process in `server.js` serving:
   - Static frontend assets (from `web/dist`, with SPA fallback to `index.html` for unknown non-`/api/` routes)
   - JSON API endpoints under `/api/*`
   - Local persistence through SQLite (`data/job-tracker.db`)

At runtime, the browser talks to the backend over HTTP (`http://127.0.0.1:4310` by default). The backend reads and writes local data on the same machine. In developer mode, Vite runs on `:5173` and proxies `/api` to the Node server.

## 3) Runtime Components

### 3.1 Frontend (`web/`)

- Vite + React 18 + TypeScript SPA. Entry at `web/src/main.tsx`; top-level routes at `web/src/App.tsx`.
- State management:
  - **Server state** (jobs, metrics, reminders, saved views, profile, strategy, status-model, notes/contacts/events, LLM settings) is owned by TanStack Query (`web/src/hooks/queries.ts`). Mutations invalidate the relevant query keys instead of manually refetching.
  - **UI state** (selected job, search/filter inputs, breakdown expanded set, active activity tab, modal open flags, "start here" dismissal) lives in a Zustand store (`web/src/store/ui.ts`).
- Tab navigation uses React Router (`/today`, `/pipeline`, `/insights`, `/settings`). The Node server's SPA fallback serves `web/dist/index.html` for those routes so refresh-on-deep-link works.
- Scoring/status helpers are ported into `web/src/lib/scoring.ts` and `web/src/lib/format.ts`. The shared API client is `web/src/lib/api.ts`.
- The original `app/styles.css` is copied to `web/src/styles.css` and imported globally to preserve visual parity.

### 3.2 Backend (`server.js`)

- Uses Node built-ins (`http`, `fs`, `path`, `url`, `crypto`, `os`) plus `node:sqlite`.
- Initializes and migrates SQLite schema at startup.
- Routes requests in `handleApi(...)` by HTTP method + path segments.
- Encapsulates:
  - Data access and shape mapping (`toJobResponse`)
  - Domain validation (status validation)
  - Snapshot import/export
  - Optional LLM calls with locally stored encrypted API key

### 3.3 Data Layer (SQLite)

- Database file: `data/job-tracker.db`
- Main tables:
  - `jobs`
  - `job_notes`
  - `job_contacts`
  - `job_events`
  - `saved_views`
  - `app_settings`
- Startup behavior:
  - Creates schema and indexes if missing
  - Optionally seeds jobs from `data/seed-jobs.json` when DB is empty
  - Reads profile from `data/candidate-profile.json`

## 4) Key Data and State Boundaries

- **System of record for mutable app data**: SQLite tables
- **Read-only bootstrap/config inputs**:
  - `data/seed-jobs.json`
  - `data/candidate-profile.json`
- **Client state**: ephemeral browser memory, repopulated from API responses

The UX does not write arbitrary files directly. User edits flow through API endpoints and persist via SQLite operations on the backend.

## 5) API Surface (Current)

### Core Domain

- `GET /api/jobs`
- `POST /api/jobs`
- `PATCH /api/jobs/:id`
- `GET /api/jobs/:id`

### Pipeline Subresources

- `GET|POST /api/jobs/:id/notes`
- `GET|POST /api/jobs/:id/contacts`
- `GET|POST /api/jobs/:id/events`

### Product/Analytics

- `GET /api/profile`
- `GET /api/status-model`
- `GET /api/metrics/summary`

### User Workspace Persistence

- `GET|POST /api/saved-views`
- `PATCH|DELETE /api/saved-views/:id`

### Snapshot Operations

- `GET /api/export`
- `POST /api/import`

### LLM Settings + Actions

- `GET|PUT /api/settings/llm`
- `POST /api/llm/fit-summary`
- `POST /api/llm/outreach-draft`
- `POST /api/llm/interview-pack`

## 6) Request Flow Examples

### 6.1 Add New Job

1. User submits `addJobForm` in frontend.
2. Frontend sends `POST /api/jobs`.
3. Backend validates statuses, inserts row into `jobs`, appends `job_events` entry.
4. Frontend refreshes jobs list using `GET /api/jobs`.

### 6.2 Update Triage/Pipeline Fields

1. User edits score/status/next action.
2. Frontend sends `PATCH /api/jobs/:id`.
3. Backend merges payload with existing row, updates `jobs`, logs `job_updated` event.
4. Frontend reloads jobs (and pipeline details where needed).

### 6.3 Notes/Contacts/Events

1. User submits note/contact/event form.
2. Frontend sends `POST` to resource-specific endpoint.
3. Backend inserts into corresponding table.
4. Frontend reloads that subresource collection.

## 7) Security and Local Secrets

- The app is designed for local use and binds to a local host/port.
- LLM API keys set in UI are encrypted before storage using AES-256-GCM.
- Encryption key is derived from host context (or `JOB_TRACKER_SECRET` if provided).
- If no LLM endpoint/key is configured, LLM routes return a safe fallback response.

## 8) Operational Notes

- Start command: `npm start`
- Default port: `4310` (override with `PORT`)
- Data durability is tied to `data/job-tracker.db`
- Static assets are served by the same backend process

## 9) Current Trade-offs and Future Refactor Targets

- Single-file backend (`server.js`) is simple but mixes concerns (routing, validation, persistence, LLM integration).
- No explicit service/repository module boundaries yet.
- No authentication/authorization layer (acceptable for local personal use).
- API schema is implicit in code; formal OpenAPI spec could improve stability.
- Background jobs/queues are not present; all writes are synchronous request/response.
- Legacy `app/` vanilla-JS frontend is still in the repo at `/app/*` for fallback while the React SPA settles; consider deleting it once the SPA reaches verified parity.
- `web/.npmrc` sets `strict-ssl=false` to allow installs through corporate TLS interception; revisit if/when the corporate root CA is installed in a way npm honors.

## 10) Suggested Next Architecture Steps

1. Split backend into modules:
   - `routes/`, `services/`, `repositories/`, `lib/`
2. Introduce API contract documentation (OpenAPI or JSON schema).
3. Add lightweight request validation schemas per endpoint.
4. Add backup/restore automation around SQLite file snapshots.
5. Add optional safe file-write gateway for specific markdown/json docs if product workflows require UX-to-file editing.
