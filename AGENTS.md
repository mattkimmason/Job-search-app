# AI Agent Instructions

Read this file before making non-trivial changes. Follow these rules by default, but if a rule conflicts with the user's explicit request, the user wins. Call out trade-offs briefly, then proceed.

## Where to find things


| What you need                           | Where to look                                  |
| --------------------------------------- | ---------------------------------------------- |
| App overview and runtime                | [README.md](README.md)                         |
| Cursor agent rules                      | [.cursor/rules/](.cursor/rules/)               |
| Feature roadmap and status              | [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md)       |
| Server implementation (Node + API + DB) | [server.js](server.js)                         |
| Frontend app shell and routing          | [web/src/App.tsx](web/src/App.tsx)             |
| Frontend pages and components           | [web/src/](web/src/)                           |
| Frontend styling and design tokens      | [web/src/styles.css](web/src/styles.css)       |
| Frontend design source of truth         | [design.md](design.md)                         |
| UX implementation principles            | [Docs/UX-PRINCIPLES.md](Docs/UX-PRINCIPLES.md) |
| Job-search operating model              | [job-search/](job-search/)                     |
| Core tracker rules and scoring          | [job-search/tracker.md](job-search/tracker.md) |
| Search cadence and metrics              | [job-search/runbook.md](job-search/runbook.md) |
| Resume and LinkedIn source docs         | [Docs/](Docs/)                                 |
| App data artifacts and seed files       | [data/](data/)                                 |
| Node scripts and versions               | [package.json](package.json)                   |


## Before building a feature

1. Read applicable rules in [.cursor/rules/](.cursor/rules/), starting with `00-rule-index.mdc`.
2. Check [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md) for scope, dependencies, and status.
3. Read relevant job-search references in [job-search/](job-search/) before changing scoring or workflow behavior.
4. For non-trivial changes, state goal, approach, files touched, and risks before implementation.
5. Preserve local-first behavior and existing status taxonomy unless the user asks for a model change.

---

## Project stack

- Local-first **Node.js** app with a Vite + React + TypeScript frontend.
- Backend and API logic are in `server.js`.
- Frontend source is in `web/src/`; the production build is served from `web/dist`.
- Data is stored in local **SQLite** (`data/job-tracker.db`), seeded from `data/seed-jobs.json`.
- Runtime target is Node `>=22` (see `package.json`).
- Frontend styling: **Tailwind CSS v4** (`@tailwindcss/vite`) on top of an `oklch` design-token system declared in `web/src/styles.css`. Reusable primitives live under `web/src/components/ui/` (Button, Input, Textarea, Badge, Card, Tabs, Tooltip, Dialog, Select, Separator, Progress, ScrollArea). Icons come from `lucide-react`. Dark is the default theme; the Settings Appearance card toggles light/dark/system and persists to `localStorage` as `jsing.theme`. Compose classes with `cn()` from `@/lib/cn`.

## Build and run commands


| Task                          | Command                     |
| ----------------------------- | --------------------------- |
| Install dependencies          | `npm install`               |
| Install frontend dependencies | `npm run web:install`       |
| Build frontend                | `npm run web:build`         |
| Lint frontend                 | `npm run web:lint`          |
| Typecheck frontend            | `npm run web:typecheck`     |
| Start app (recommended)       | `npm start`                 |
| Start app (dev alias)         | `npm run dev`               |
| Start Vite dev server         | `npm run web:dev`           |
| Override port for one session | `$env:PORT=4315; npm start` |


Default app URL: `http://127.0.0.1:4310`

---

## Workflow and Git

- Keep changes scoped: one feature/fix/refactor per commit.
- Commit directly to main unless otherwise specified.
- Use conventional-style commit subjects when practical (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- Do not commit secrets, exported personal data snapshots, or local credential values.
- Run /simplify before before staging and committing 

## Testing expectations

- For backend/API behavior changes, validate endpoints manually before finishing.
- For UI changes, verify critical flows in browser: Inbox, Triage, Pipeline, Insights.
- For frontend changes, run `npm run web:typecheck`, `npm run web:lint`, and `npm run web:build` when the change is more than copy/docs.
- If adding logic that can regress, add lightweight validation scripts/tests when feasible.

## Code standards

- Keep modules focused and readable; avoid broad, unrelated refactors.
- Preserve existing API contract shapes unless intentionally changing them.
- Validate inputs at API boundaries and return clear error messages.
- Log useful operational context; remove temporary debug logging before finalizing.
- Never hardcode API keys or secrets. Use environment variables for sensitive config.

## Frontend and UI/UX standards

- Before changing UI, read [design.md](design.md) (the normative Design System Contract is the primary source of truth) and inspect the current page, the primitives in `web/src/components/ui/`, the patterns in `web/src/components/patterns/`, the rest of `web/src/components/`, `web/src/styles.css`, and nearby visual patterns. Do not invent a new visual language unless the user asks for it or the existing pattern is clearly broken.
- Use the existing design system: oklch CSS variables (`--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`, etc.) mapped to Tailwind colors via the `@theme inline` block in `styles.css`. Reach for Tailwind utility classes plus token-backed colors; do not hardcode hex values.
- Prefer the shadcn-style primitives in `web/src/components/ui/` (Button, Input, Textarea, Badge, Card, Tabs, Tooltip, Dialog, Select, Separator, Progress, ScrollArea), the shared state components (`EmptyState`, `ErrorState`, `SkeletonRows`, `SkeletonCards`, `SkeletonLines`, `InlineConfirm`), the shared patterns in `web/src/components/patterns/` (`PageShell`, `SectionHeader`, `MetricCard`, `StatusPill`, etc.), and `lucide-react` icons over one-off markup. If a pattern appears three or more times, extract or reuse a shared component.
- Compose class names with `cn()` from `@/lib/cn`. Use `@/...` imports for paths under `web/src/`.
- Keep layouts aligned to the app's established shell (`w-16` icon sidebar + `h-14` top header), `max-w-6xl` (or `max-w-4xl` for forms) content containers, grid, and spacing rhythm. Normalize inconsistencies across similar screens instead of making isolated improvements.
- Compact pill controls should match the Insights reminder action buttons (`Button size="xs"`, e.g. `Snooze 1 day` / `Complete`) unless they are true primary CTAs. Use this as the baseline for Pipeline action pills, filter pills, status/exception pills, saved-view pills, and row/detail quick actions.
- Filters should use compact dropdown controls by default. Avoid mixing chips, sliders, checkboxes, and disclosure rows for the same filtering job. In Pipeline, keep the visible filter set small, move secondary options behind one compact More filters dropdown, and avoid consuming a full toolbar row for filter management.
- Treat empty, loading, disabled, hover, focus, and error states as first-class design states.
- Preserve accessibility: semantic HTML, visible focus states (`focus-visible:ring-2 focus-visible:ring-ring/40`), keyboard usability, sufficient contrast, accessible names, and clear recovery paths for errors.
- Verify responsive behavior intentionally for desktop, tablet, and narrow mobile widths. The Pipeline master-detail collapses to single column under `lg`.
- Default to cohesive, restrained, professional UI unless the user asks for a specific visual direction. Dark is the default theme — verify both dark and light render correctly.
- A few legacy surfaces (`web/src/components/activity/`*, `addjob/ManualAddTab.tsx`, `settings/RubricsEditor.tsx`, the toast helper) still use legacy class-based CSS in `styles.css`. When you touch them, migrate to Tailwind + primitives rather than extending the legacy CSS.

Before finishing UI work, audit Tailwind spacing usage, button and pill sizing, filter consistency, token usage (no hardcoded hex), page structure consistency, narrow-width behavior, focus visibility, both themes, and whether any new one-off style should become shared.

## Data and schema guardrails

- Treat `data/job-tracker.db` as local runtime state; do not hand-edit binary DB files.
- Keep status enums aligned with README and tracker docs:
  - `discoveryStatus`: `new`, `researching`, `target`, `not_a_fit`
  - `applicationStatus`: `not_started`, `in_progress`, `applied`, `rejected`
  - `interviewStatus`: `waiting`, `screen_scheduled`, `screen_done`, `interview_scheduled`, `interview_done`, `offer`, `closed`
- Keep import/export flows backward-compatible unless a migration is explicitly planned.

---

## Feature backlog workflow

When a task maps to a backlog item (by ID or clear description), update `FEATURE_BACKLOG.md`:

1. Update **Status** (`Open`, `In Progress`, `Blocked`, `Done`) accurately.
2. Add concise **Notes** when implementation differs from original intent.
3. Keep dependencies and success criteria coherent after edits.

Do not delete historical entries unless explicitly requested.

---

## Shell environment (PowerShell)

This workspace runs on **Windows PowerShell**.

- Prefer PowerShell-compatible commands and quoting.
- Do not use bash-only syntax (`&&`, heredocs, etc.) in shared command guidance.
- Run multi-step commands as separate sequential calls when safety matters.

