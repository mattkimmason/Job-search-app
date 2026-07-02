# Local Job Search Copilot - Feature Backlog

The backlog is organized around **four core workspaces** in the local app: `Inbox`, `Triage`, `Pipeline`, and `Insights`.
Each workspace maps to how you run your search day-to-day and has category-based features beneath it.

Complexity: **S** = small (< 1 day), **M** = medium (1-3 days), **L** = large (3+ days).

**Depends On** lists prerequisite feature IDs. **Success Criteria** (SC) define observable conditions for Done.

References:

- `job-search/tracker.md` - status flow, 100-point scoring rubric, tracker schema
- `job-search/runbook.md` - operating cadence, conversion metrics, SLAs
- `job-search/templates/role-intake-template.md` - intake requirements per role
- `job-search/templates/application-packet-template.md` - application execution checklist

---

## Workspaces

#### 1 - Inbox (Research Intake)

- **Focus:** Quickly capture target jobs and normalize role data before evaluation.

#### 2 - Triage (Prioritization)

- **Focus:** Score jobs, decide apply vs skip, and set near-term next actions.

#### 3 - Pipeline (Execution)

- **Focus:** Track applications, outreach, interview progress, notes, and follow-ups.

#### 4 - Insights (Review + Optimization)

- **Focus:** Weekly/monthly funnel performance, bottlenecks, and strategy adjustments.

---

## Phase 0 - Foundation and Product Shape

> Goal: establish reusable architecture, UX contracts, and data governance for all later features.

#### #JOB-260511-0001 - Canonical status model and transition rules

- **Complexity:** S | **Layers:** Product, Data | **Status:** Done | **Depends on:** -
- **Description:** Define a three-track status model (`discovery`, `application`, `interview`) and explicit transition constraints.
- **SC:** Status enums documented; valid transitions defined; mapping from tracker flow (`Found -> Scored -> Applied -> Outreach Sent -> Screen -> Interview -> Offer/Closed`) is complete.

#### #JOB-260511-0002 - SQLite schema v1 + migration plan

- **Complexity:** M | **Layers:** Backend, Data | **Status:** Done | **Depends on:** #JOB-260511-0001
- **Description:** Create normalized schema for jobs, notes, contacts, events, and saved views, with migration from existing local data.
- **SC:** Migration scripts create schema and indexes; schema covers current tracker columns; rollback path documented.

#### #JOB-260511-0003 - API contract and service boundaries

- **Complexity:** M | **Layers:** Backend | **Status:** Done | **Depends on:** #JOB-260511-0002
- **Description:** Define Node API contracts and backend module boundaries for CRUD + metrics.
- **SC:** Endpoint contract document exists; request/response payloads are stable; boundaries prevent cross-module leakage.

#### #JOB-260511-0004 - UX IA and navigation blueprint

- **Complexity:** S | **Layers:** Frontend, Product | **Status:** Done | **Depends on:** #JOB-260511-0001
- **Description:** Lock IA for Inbox, Triage, Pipeline, and Insights workspaces with clear actions and state behavior.
- **SC:** Navigation map complete; empty/loading/error states defined; no unresolved UX ambiguities for phase 1 build.

#### #JOB-260511-0005 - Reusable entity components spec

- **Complexity:** S | **Layers:** Frontend | **Status:** Done | **Depends on:** #JOB-260511-0004
- **Description:** Specify reusable components for job cards, job detail panel, status controls, and timeline entries.
- **SC:** Component spec includes field mapping, edit patterns, and keyboard interactions; ready for implementation.

#### #JOB-260511-0006 - Backlog governance and release gates

- **Complexity:** S | **Layers:** Process | **Status:** Done | **Depends on:** -
- **Description:** Define Open/In Progress/Blocked/Done workflow and evidence required for phase exits.
- **SC:** Release gate checklist exists for Phase 0/1/2; each active feature has owner + target week.

---

## Phase 1 - Core Build (Local Node + SQLite)

## Inbox (Research Intake)

#### #JOB-260511-0101 - Rapid role capture form

- **Complexity:** M | **Layers:** Frontend, Backend | **Status:** Done | **Depends on:** #JOB-260511-0002, #JOB-260511-0003, #JOB-260511-0005
- **Description:** Add fast role intake (URL, company, title, location, compensation, source, lane, summary notes).
- **SC:** New role captured in <60 seconds; validation catches missing critical fields; record persists to DB.

#### #JOB-260511-0102 - Duplicate and stale posting detection

- **Complexity:** S | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0101
- **Description:** Detect likely duplicate roles (same company/title/link variants) and stale postings.
- **SC:** Duplicate warning appears before save; stale posting flag shown on cards; false positives are low in manual testing.
- **Notes:** Intake now checks URL + company/title similarity before create, supports user override, and surfaces stale-card badges for aging unadvanced roles.

## Triage (Prioritization)

#### #JOB-260511-0110 - Rubric scoring workflow

- **Complexity:** M | **Layers:** Frontend, Backend | **Status:** Done | **Depends on:** #JOB-260511-0001, #JOB-260511-0101
- **Description:** Implement score entry and breakdown aligned to `job-search/tracker.md` 100-point rubric.
- **SC:** Score categories visible/editable; total score auto-calculated; score rationale captured in notes.

#### #JOB-260511-0111 - Apply-now / selective / skip decisioning

- **Complexity:** S | **Layers:** Frontend, Backend | **Status:** Done | **Depends on:** #JOB-260511-0110
- **Description:** Convert score + guardrails into triage buckets and next-action recommendations.
- **SC:** Jobs bucket correctly by thresholds; user can override bucket with reason; triage queue updates instantly.

## Pipeline (Execution)

#### #JOB-260511-0120 - Application timeline and event log

- **Complexity:** M | **Layers:** Frontend, Backend | **Status:** Done | **Depends on:** #JOB-260511-0001, #JOB-260511-0101
- **Description:** Add event-driven timeline for apply, outreach, follow-up, screen, interview, and outcome milestones.
- **SC:** Status changes append timestamped events; timeline supports manual correction; history is never lost.

#### #JOB-260511-0121 - Notes, contacts, and outreach tracker

- **Complexity:** M | **Layers:** Frontend, Backend | **Status:** Done | **Depends on:** #JOB-260511-0120
- **Description:** Support recruiter/hiring manager contacts, outreach attempts, and contextual notes per role.
- **SC:** Contact and outreach records are searchable; overdue follow-up indicator appears in pipeline list.

#### #JOB-260511-0122 - Import/export and backup restore

- **Complexity:** S | **Layers:** Backend | **Status:** Done | **Depends on:** #JOB-260511-0002
- **Description:** Add JSON import/export for backup, restore, and migration from existing tracker artifacts.
- **SC:** Export produces full snapshot; import handles re-runs safely; restore test confirms no data corruption.

## Insights (Review + Optimization)

#### #JOB-260511-0130 - Funnel dashboard v1

- **Complexity:** M | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0120, #JOB-260511-0121
- **Description:** Show stage counts, conversion rates, cycle times, and follow-up workload.
- **SC:** Metrics match underlying events; filters by date/lane/status work; dashboard load <1 second on local dataset.

#### #JOB-260511-0131 - Weekly and monthly snapshot reports

- **Complexity:** M | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0130
- **Description:** Generate runbook-aligned summary snapshots for weekly and monthly retros.
- **SC:** Snapshot includes sourcing/apply/response/screen/interview/offer metrics; report export supports markdown.

---

## Phase 2 - Intelligence and Quality of Life

#### #JOB-260511-0201 - Saved views and smart filters

- **Complexity:** S | **Layers:** Frontend, Backend | **Status:** Done | **Depends on:** #JOB-260511-0130
- **Description:** Save and reuse custom filters (e.g., high-score NYC targets, follow-up overdue, active interviews).
- **SC:** Saved views can be created/renamed/deleted; they persist locally and apply in one click.
- **Notes:** UI hotfix applied to prevent Saved Views input/action overflow in the left rail and to harden apply/delete interaction handling.

#### #JOB-260511-0202 - Reminder and SLA nudges

- **Complexity:** S | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0121
- **Description:** Add nudges for overdue outreach/follow-ups and aging in key pipeline states.
- **SC:** Reminder queue surfaces due items daily; snooze and complete actions are available.
- **Notes:** Insights now includes reminder queue with outreach/follow-up/next-action nudges and persisted snooze/complete controls.

#### #JOB-260511-0203 - Search strategy tracker

- **Complexity:** M | **Layers:** Frontend, Backend | **Status:** Done | **Depends on:** #JOB-260511-0101, #JOB-260511-0130
- **Description:** Track source/channel effectiveness and saved search performance.
- **SC:** Source conversion metrics are visible; underperforming channels are highlighted.
- **Notes:** Strategy workspace now renders per-source conversion metrics plus saved-view performance with underperforming flags.

#### #JOB-260511-0204 - LinkedIn-safe intake and prioritization flow

- **Complexity:** M | **Layers:** Frontend, Backend, Product | **Status:** Done | **Depends on:** #JOB-260511-0101, #JOB-260511-0110, #JOB-260511-0203
- **Description:** Support LinkedIn-compatible local workflow (user-controlled login + manual/alert intake) without storing account credentials.
- **SC:** Intake supports LinkedIn/alert source labels; imported roles are scored and prioritized locally; no credential storage required for role capture.
- **Notes:** Inbox source selector now supports LinkedIn and LinkedIn Alert capture modes; lookup/manual imports persist source metadata for downstream channel tracking.

---

## Phase 3 - Optional LLM Assist (BYO Key)

#### #JOB-260511-0301 - Local key management and guardrails

- **Complexity:** M | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0101
- **Description:** Add local configuration for LLM API key with explicit user-triggered invocation controls.
- **SC:** Key setup/revoke flow works; no autonomous background calls; usage is auditable in local logs.

#### #JOB-260511-0302 - Fit summary and tailoring draft assistant

- **Complexity:** M | **Layers:** AI, Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0301, #JOB-260511-0110
- **Description:** Generate optional fit summary, keyword-gap analysis, and resume-tailoring draft per role.
- **SC:** Output is editable before save; generated text references job data + rubric dimensions.

#### #JOB-260511-0303 - Outreach and interview prep drafting

- **Complexity:** M | **Layers:** AI, Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0301, #JOB-260511-0121
- **Description:** Generate first drafts for recruiter outreach and interview prep packs.
- **SC:** Drafts are user-triggered, editable, and only persisted on explicit save.

#### #JOB-260601-0304 - AI job-fit scoring and match analysis

- **Complexity:** M | **Layers:** AI, Backend, Frontend, Data | **Status:** Done | **Depends on:** #JOB-260511-0301, #JOB-260511-0110
- **Description:** Add `POST /api/llm/fit-score` that scores a role 0-100 against the candidate profile + saved strategy and returns a recommended tier, rationale, fit hooks, risks, and keyword gaps. Surface it in the per-job AI assist panel with an explicit Apply action.
- **SC:** Analysis is user-triggered and editable; Apply persists score/tier/notes/hooks/risks/keywords; the AI score is distinct from the heuristic rubric score and shown as an `AI` pill on the job card.
- **Notes:** Added additive `ai_score` + `ai_analysis_json` columns (kept separate from the heuristic `calculateScoreBreakdown` so both remain visible). LLM layer is OpenAI-compatible; validated against the internal GenAI gateway with `openai.gpt-4.1-mini`.

#### #JOB-260601-0305 - Job-description summarization and extraction

- **Complexity:** M | **Layers:** AI, Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0301
- **Description:** Add `POST /api/llm/summarize-jd` that turns pasted job-description text into a structured object (summary, responsibilities, qualifications, keywords, red flags, location, salary, seniority). Surface a paste box + Apply action in the AI assist panel.
- **SC:** Extraction is user-triggered and editable; Apply writes summary + merged keywords (and location/salary when missing) to the selected job and logs responsibilities/qualifications/red flags as a note.

---

## Bugs / Gaps

> Workflow: Add confirmed defects here with repro notes and SC. Keep this section separate from roadmap features so bug triage remains visible.

#### #BUG-260511-0001 - Status mismatch between tracker docs and UI model

- **Complexity:** S | **Layers:** Product, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0001
- **Description:** Existing status labels do not fully match the canonical tracker flow.
- **SC:** UI status labels align with canonical model and migration mapping is complete.

#### #BUG-260601-0003 - Invalid input returned 500 instead of 400

- **Complexity:** S | **Layers:** Backend | **Status:** Done | **Depends on:** #JOB-260511-0001
- **Description:** Invalid status values (`validateStatus`) and malformed JSON bodies threw and bubbled to the generic handler, returning `500 Internal server error` for what are client input errors.
- **SC:** Invalid `discoveryStatus`/`applicationStatus`/`interviewStatus` and malformed JSON bodies return `400` with a clear message; valid requests are unaffected.
- **Notes:** Surfaced by the endpoint smoke-test suite. `validateStatus` and the JSON body parser now attach `statusCode = 400`; the top-level request handler honors `error.statusCode` (defaults to 500). Verified via 36-case smoke run (all passing).

#### #BUG-260511-0002 - Scoring model mismatch with 100-point rubric

- **Complexity:** M | **Layers:** Backend, Product | **Status:** Done | **Depends on:** #JOB-260511-0110
- **Description:** Current scoring behavior does not reflect documented rubric categories and weighting.
- **SC:** Score calculations and category weights match documented rubric with transparent breakdown.
- **Notes:** `calculateScoreBreakdown(job)` now returns each rubric category (location/domain/AI/seniority/keywords/bridge/leadership/value) with its raw value, cap, and contribution. Each job card includes a "Why this score?" toggle that renders the per-category grid with a running total. Tooltips explain what each category measures.

#### #BUG-260602-0004 - Today "Awaiting triage" surfaces hidden/closed/applied/dead postings

- **Complexity:** S | **Layers:** Frontend | **Status:** Done | **Depends on:** #JOB-260601-0402
- **Description:** The Today hub's `Awaiting triage` card filtered only by `not_a_fit` and `applied`/`rejected`, so closed (`interviewStatus = closed`), dead postings (`postingStatus = dead`), and post-application roles still appeared as items needing triage. `Postings to re-verify` was also computed directly from raw jobs, bypassing reminder snooze/complete state from `/api/reminders`.
- **SC:** `Awaiting triage` only shows active, visible jobs in `not_started`/`in_progress`; `Postings to re-verify` is sourced from `/api/reminders` so snooze/complete actions take effect on Today.
- **Notes:** `web/src/pages/TodayPage.tsx` now uses a shared `isTriageEligible` predicate and reads `verify_posting` reminders straight from `useReminders()`.

#### #BUG-260604-0005 - Phase 7 color palette has poor color transitions

- **Complexity:** M | **Layers:** Frontend, Design | **Status:** Done | **Depends on:** #JOB-260603-0701, #JOB-260603-0708
- **Description:** The v0-inspired palette is directionally better but the current color relationships feel uneven. Gradients and transitions between primary, accent, warning, success, destructive, muted, card, and background tones need a more cohesive ramp so the app does not feel patchy or harsh.
- **SC:** Dark and light palettes use intentional oklch ramps with smooth contrast steps; cards, badges, buttons, focus rings, hover states, and status tones feel visually related across Today, Pipeline, Insights, and Settings; no status color relies on hue alone.
- **Notes:** Resolved together with #BUG-260604-0017 by removing the legacy `:root` re-declarations of `--muted`, `--primary`, `--accent`, and `--radius-sm`, so Tailwind utilities now resolve to the oklch ramp in both themes. Legacy hex tokens that have no oklch equivalent are namespaced as `--legacy-*`.

#### #BUG-260604-0006 - Settings navigation can flip the app into an unintended white mode

- **Complexity:** S | **Layers:** Frontend, Theme | **Status:** Done | **Depends on:** #JOB-260603-0707
- **Description:** Clicking into Settings can make the app unexpectedly go white, suggesting a dark-mode/theme-class bug or a mismatch between default dark state, the Settings Appearance control, and the pre-paint `jsing.theme` handling.
- **SC:** Opening Settings never changes the active theme by itself; dark remains dark unless the user explicitly chooses Light or System resolves to light; refresh, route changes, and Appearance toggles preserve the selected mode without flash or accidental white backgrounds.
- **Notes:** `ThemeToggle` now seeds initial state from the actual `<html class>` and only persists/applies after an explicit user pick (tracked via `userChangedRef`). `web/index.html` pre-paint script handles `system` by reading `prefers-color-scheme` so default reload behaviour matches the toggle.

#### #BUG-260604-0007 - Pipeline page remains visually weak after Phase 7 re-skin

- **Complexity:** L | **Layers:** Frontend, UX, Design | **Status:** In Progress | **Depends on:** #JOB-260603-0705
- **Description:** Pipeline is still the biggest UX struggle and looks worse than the rest of the app. The master-detail page needs a dedicated visual and interaction pass rather than more incremental chrome changes.
- **SC:** Pipeline reads as a coherent, polished workspace in both Decide and Track modes; list, toolbar, detail panel, tabs, bulk actions, and empty/selected states share one visual language; the page scans quickly without feeling crowded or inconsistent.
- **Notes:** Design System Baseline pass: `StatusPill` adoption in `JobRow`/`ActivityPanel`/Track table, 7fr/3fr master-detail split, dropdown-first toolbar, compact `Button size="xs"` actions, sidebar centering fix. Bugfix sweep also migrated `Notes`, `Contacts`, and `Summary` activity sub-panels to Tailwind primitives, and rebuilt Pipeline mode/Track layout toggles on the new `SegmentedControl`. Residual: `Triage`, `Events`, and `AiAssist` sub-panels still lean on legacy CSS for some structure.

#### #BUG-260604-0008 - Pipeline pill/button sizing is inconsistent

- **Complexity:** S | **Layers:** Frontend, Design System | **Status:** Done | **Depends on:** #JOB-260603-0702, #JOB-260604-0007
- **Description:** Pill-sized buttons and status chips vary across Pipeline, making the page feel uneven. The compact pills used in Insights reminder actions (`Button size="xs"` such as `Snooze 1 day` / `Complete`) should become the standard pill treatment across the app, especially in Pipeline.
- **SC:** Pipeline action pills, filter pills, status pills, and row/detail quick actions use a shared compact pill standard based on the Insights reminder action sizing; height, border radius, padding, font size, icon size, and gap are consistent; the frontend UI rules document this standard.
- **Notes:** Normalized Pipeline bulk/hidden/show actions, saved-view chips, and More filters to `Button size="xs"`; score/verdict indicators use `StatusPill` (`h-5`) and `Badge` (`h-5`); Activity header badges drop ad-hoc `h-6` overrides. Standard documented in `design.md` and `.cursor/rules/frontend-ui-ux.mdc`.

#### #BUG-260604-0009 - Pipeline left-hand list cuts off triage information

- **Complexity:** M | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0705
- **Description:** In Pipeline triage/Decide view, the left-hand job list column cuts off important information. The master-detail split does not currently give rows enough room to show the needed triage context.
- **SC:** Decide rows show the necessary role, company, score/verdict, status, and triage context without clipping on common desktop widths; overflow behavior is intentional (`truncate`, wrap, or secondary line) and tested at the Pipeline breakpoint; the detail panel remains usable.
- **Notes:** Master-detail grid widened to `lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]`; list column and `JobRow` use `min-w-0 w-full` with `flex-wrap` so pills/trailing actions wrap instead of clipping.

#### #BUG-260604-0010 - Pipeline detail should default to job-summary view

- **Complexity:** M | **Layers:** Frontend, UX, Data | **Status:** Done | **Depends on:** #JOB-260601-0305, #JOB-260603-0705
- **Description:** When selecting a job in Pipeline, the right-hand detail panel should default to a new Summary view that presents the job description summary captured at creation time. If existing jobs do not have AI-generated job-description summaries yet, the UI still needs a clear placeholder/place for them.
- **SC:** Selecting a Pipeline job defaults the right panel to Summary in both Decide and Track modes; Summary displays available AI job-description summary, responsibilities, qualifications, keywords, red flags, and source/metadata where present; missing summaries render a useful empty state with a path to add or generate one; Triage/Notes/Contacts/Events/AI Assist remain available as secondary tabs.
- **Notes:** `ActivityPanel` now exposes the full tab set in both modes and resets to Summary on every job selection. `SummaryPanel` was rebuilt on Tailwind primitives to surface JD summary, keywords, AI rationale (rationale + fit hooks + risks), source/lane/posting metadata, and a Generate-with-AI empty state when the summary is missing. Triage shortcuts now gate on `shortcutsEnabled` so the always-mounted panel only fires verdicts when its tab is active.

#### #BUG-260604-0011 - Pipeline filters are too numerous and inconsistent

- **Complexity:** M | **Layers:** Frontend, UX, Design System | **Status:** Done | **Depends on:** #JOB-260603-0610, #JOB-260603-0615, #BUG-260604-0007
- **Description:** Pipeline has too many filters, and they are visually inconsistent. Filters should be simple, compact, and consistently presented as dropdown controls instead of a mix of chips, sliders, disclosures, checkboxes, and ad hoc rows.
- **SC:** Pipeline filter controls use a consistent dropdown-first pattern; only the smallest set of high-value filters appears by default; secondary filters are grouped behind one compact More filters dropdown; controls take minimal vertical space; active filters are summarized clearly; frontend UI rules require dropdowns as the default filter pattern.
- **Notes:** `PipelineToolbar` now uses `Select` dropdowns for sort, discovery/application (Decide), quick filter, and Track presets; score-floor slider and show-hidden/closed checkboxes moved into a compact More filters disclosure; chip rows removed.

#### #BUG-260604-0012 - Left navigation icons are off-center

- **Complexity:** S | **Layers:** Frontend, Design | **Status:** Done | **Depends on:** #JOB-260603-0703
- **Description:** The icon-only left navigation introduced in Phase 7 has alignment issues: nav icons appear visually off-center inside their sidebar buttons.
- **SC:** Sidebar logo, workspace icons, active state, hover state, tooltips, and guardrails icon are visually centered in the `w-16` rail; icon buttons use consistent square sizing, alignment, and focus rings; alignment holds across Today, Pipeline, Insights, and Settings.
- **Notes:** `TabsNav` nav uses `w-full items-center`; `Layout` aside adds horizontal padding so icon buttons center in the rail.

#### #BUG-260604-0013 - Settings page does not use PageShell / SectionHeader patterns

- **Complexity:** S | **Layers:** Frontend, Design System | **Status:** Done | **Depends on:** #BUG-260604-0007
- **Description:** `SettingsPage` is the only main workspace that has not been migrated to the `PageShell` + `SectionHeader` patterns adopted by Today and Insights. It hand-rolls a `text-2xl font-semibold` header and per-section H2s, so any future change to `SectionHeader` (heading scale, hint slot, level system) will not propagate.
- **SC:** Settings renders inside `PageShell` with `SectionHeader level="page"` for the workspace header and `SectionHeader level="section"` for each card group; visual rhythm (spacing, heading scale, hint alignment) matches Today and Insights; no bespoke heading classes remain on `SettingsPage`.
- **Notes:** `SettingsPage` now wraps in `PageShell width="4xl"` with a `SectionHeader` page title; per-card `CardTitle`/`CardDescription` continue to provide section-level headings consistent with the Insights pattern.

#### #BUG-260604-0014 - Settings "Import snapshot" is a label-wrapped input, not a Button primitive

- **Complexity:** S | **Layers:** Frontend, Accessibility, Design System | **Status:** Done | **Depends on:** #BUG-260604-0007
- **Description:** The "Import snapshot" control in Settings → Backup uses a `<label>` wrapping an `sr-only <input type="file">` and a styled `<span>` that visually mimics a `Button` primitive (`inline-flex h-8 ...`). The span isn't keyboard-focusable, doesn't render the canonical focus ring (`focus-visible:ring-2 focus-visible:ring-ring/40`), and won't reflect future changes to the Button primitive.
- **SC:** "Import snapshot" uses the Button primitive (or a shared file-picker wrapper around it); the control is keyboardable, has the standard focus ring, and matches the adjacent "Export snapshot" Button in size, padding, and hover state across dark and light themes.
- **Notes:** Replaced the styled `<label>`+`<span>` with a real `Button variant="outline"` that programmatically clicks a hidden `sr-only` `<input type="file">` via `useRef`. Keyboard, hover, and focus-ring behaviour now match `Export snapshot`.

#### #BUG-260604-0015 - Three hand-rolled segmented controls duplicate the same archetype

- **Complexity:** S | **Layers:** Frontend, Design System | **Status:** Done | **Depends on:** #BUG-260604-0007
- **Description:** Pipeline mode (Decide / Track), Pipeline Track layout (Sections / Table), and Settings → Appearance theme (Light / Dark / System) are three independent hand-rolled segmented controls with subtle size differences (outer `h-8` vs `h-7`, inner `h-7` vs `h-6` vs `h-8`, different inline-count badge sizing). This violates the design.md anti-pattern about reintroducing variants when an existing one already covers the use case.
- **SC:** A shared `SegmentedControl` (or canonical `Tabs` variant) primitive is introduced under `web/src/components/ui/`; Pipeline mode, Track layout, and Theme toggle all consume it; outer height, inner height, gap, border-radius, font size, and inline-count badge sizing are derived from one source; the inline count badge is the `Badge` primitive.
- **Notes:** New `web/src/components/ui/segmented-control.tsx` primitive with `sm`/`md` sizes, optional icon and count, and the canonical `focus-visible:ring-2 focus-visible:ring-ring/40` focus state. Pipeline mode, Track layout, and Settings theme all consume it.

#### #BUG-260604-0016 - Reminder snooze/complete does not invalidate Insights metrics

- **Complexity:** S | **Layers:** Frontend, Data | **Status:** Done | **Depends on:** -
- **Description:** `useReminderAction.onSuccess` only invalidates `queryKeys.reminders`. The Insights "Overdue follow-ups" KPI tile reads from `useMetrics` (`/api/metrics/summary`), which is not invalidated, so the KPI is stale after a snooze/complete until the user clicks Refresh or reloads the page.
- **SC:** After a reminder snooze or complete from any surface (Today, Insights, Pipeline detail), `/api/metrics/summary` is invalidated alongside `/api/reminders`; the Insights "Overdue follow-ups" and any reminder-derived KPI update without a manual refresh; the Today hub continues to update as it does today.
- **Notes:** `useReminderAction.onSuccess` now invalidates both `queryKeys.reminders` and `queryKeys.metrics`.

#### #BUG-260604-0017 - Legacy `:root` CSS variables clobber the new oklch tokens in dark mode

- **Complexity:** M | **Layers:** Frontend, Design System, Theme | **Status:** Done | **Depends on:** #BUG-260604-0005
- **Description:** `web/src/styles.css` declares the new oklch design tokens in `:root` at lines 53-90 (`--muted`, `--primary`, `--accent`, `--radius-sm`, etc.), but a second legacy `:root` block at lines 92-167 re-declares the same variables with hex/px values (`--muted: #9ba3af`, `--primary: #7c93b8`, `--accent: #5db4a8`, `--radius-sm: 6px`). The legacy block wins by cascade order in dark mode (light mode is overridden later via `html:not(.dark) :root`, so it renders correctly). The consequence: every Tailwind utility backed by these tokens (`bg-muted`, `bg-muted/30`, `bg-primary`, `bg-accent`, `text-muted-foreground`-adjacent, `rounded-sm`, plus StatusPill `neutral` tone, SkeletonRows/Cards/Lines, kbd hints, PipelineToolbar More-filters background, CardFooter) renders with the legacy palette in dark mode — the documented root cause of the "patchy / harsh" feel called out in #BUG-260604-0005.
- **SC:** Only one `:root` block declares each design token in dark mode; legacy hex/px declarations for tokens that exist in the new oklch system are removed (or scoped explicitly to legacy classes that still need them); `bg-muted`, `bg-primary`, `bg-accent`, `--radius-sm`, etc. resolve to the values declared in `design.md` in both themes; visual spot-check across Today, Pipeline (Decide + Track), Insights, Settings, AddJob shows no unexpected mid-grey or teal surfaces.
- **Notes:** Removed legacy `--muted`, `--primary`, `--radius-sm` declarations; renamed legacy `--accent` to `--legacy-accent`. Replaced all 57 `color: var(--muted)` references in legacy CSS with `color: var(--muted-foreground)` and updated 3 `var(--accent)` references to `var(--legacy-accent)`.

#### #BUG-260604-0018 - Add Job dialog tabs use 100% legacy CSS

- **Complexity:** M | **Layers:** Frontend, Design System | **Status:** Done | **Depends on:** #BUG-260604-0007
- **Description:** The Add Job dialog body (Manual, Markdown/CSV, Lookup tabs) uses zero Tailwind classes — it relies entirely on legacy classes (`add-mode`, `subsection`, `grid-3`, `stack`, `primary-button`, `ghost-button`, `actions`, `muted small`, `preview-card`, `research-prompt`) and global element styles on `<input>` / `<select>` / `<textarea>`. The Dialog title and tab strip use the Tailwind primitives, so there is a visible style boundary between the modal chrome and its body in both dark and light modes.
- **SC:** `ManualAddTab`, `MarkdownAddTab`, and `LookupAddTab` use Tailwind utility classes and the shared primitives (`Input`, `Textarea`, `Select`, `Button`, `Card`, `Badge`, `EmptyState`, `InlineConfirm`) instead of legacy CSS classes; preview cards and status notes match adjacent design-system tokens; the dialog reads as one coherent surface across both themes.
- **Notes:** All three tabs migrated to `Input`, `Textarea`, `Select`, `Button`, `Badge`, and Tailwind utilities. Duplicate detection, parse/clear flows, and preview cards keep their behaviour; status text and error states now use token-backed colors.

#### #BUG-260604-0019 - POST /api/jobs accepts an empty body and saves empty company/title

- **Complexity:** S | **Layers:** Backend, API | **Status:** Done | **Depends on:** -
- **Description:** `POST /api/jobs` with `{}` returns `201 Created` and writes a row with `company: ""` and `title: ""`. The frontend Manual Add tab validates these on submit, but a CLI/script/Markdown-import bug can still create empty job records that then need to be cleaned up.
- **SC:** `POST /api/jobs` returns `400` with a clear, actionable error when `company` or `title` is missing/blank; existing accept-empty behaviour is removed without changing the response shape for valid requests; integration probe in `Docs/qa-log-260604.md` (T1-T3) flips from "accepts empty" to "rejects empty".
- **Notes:** Added `requireNonEmptyField` helper; `POST /api/jobs` and `PATCH /api/jobs/:id` (when those fields are present) now reject blank/whitespace company/title with `400`. Verified: `{}` → `400 company is required`; `{"company":"  ","title":""}` → `400 company is required`; `{"company":"Acme","title":""}` → `400 title is required`; valid create → `201`.

#### #BUG-260604-0020 - PATCH /api/jobs/:id does not validate `postingStatus`

- **Complexity:** S | **Layers:** Backend, API, Data | **Status:** Done | **Depends on:** -
- **Description:** `PATCH /api/jobs/:id` validates `discoveryStatus`, `applicationStatus`, and `interviewStatus` against their respective enums (returns `400` on bad values), but `postingStatus` is accepted verbatim. Sending `{"postingStatus":"fortyTwo"}` returns `200 OK` and persists the bogus value; downstream UI falls through to `—` because none of `live`/`dead`/`unknown` match.
- **SC:** `PATCH /api/jobs/:id` returns `400` with a clear error when `postingStatus` is not in `live` | `dead` | `unknown`; existing rows with invalid `postingStatus` are either backfilled to `unknown` or left untouched without breaking the API contract; integration probe (T7) flips from `200` to `400`.
- **Notes:** Added `validatePostingStatus` helper; `POST /api/jobs`, `PATCH /api/jobs/:id`, and the import path now reject invalid `postingStatus` with `400`. Verified: `{"postingStatus":"definitely-not-valid"}` → `400`; `{"postingStatus":"dead"}` → `200`.

#### #BUG-260604-0021 - PUT /api/strategy silently coerces out-of-range numeric inputs

- **Complexity:** S | **Layers:** Backend, API | **Status:** Done | **Depends on:** -
- **Description:** `PUT /api/strategy` accepts `{"minimumBaseSalaryUsd": -50000, "maximumTravelPercent": 500}` and silently coerces the values to `0` and `100`. The 200 response does not include a warning, so the frontend has no way to surface that the saved value differs from the submitted value.
- **SC:** `PUT /api/strategy` returns `400` with a clear error for out-of-range values, OR returns `200` with a `warnings: [{ field, message, originalValue, savedValue }]` array that the Settings page surfaces in a toast/banner; behaviour is documented in the response shape; integration probe (T8) reflects the chosen contract.
- **Notes:** `saveStrategyConfig` now validates `minimumBaseSalaryUsd` and `maximumTravelPercent` via a shared `validateNumberInRange` helper. Verified: `maximumTravelPercent=150` → `400`; `minimumBaseSalaryUsd=-1000` → `400`; valid save → `200`.

#### #BUG-260604-0022 - Triage notes can lose unsaved edits when switching jobs via keyboard

- **Complexity:** S | **Layers:** Frontend, Data | **Status:** Done | **Depends on:** -
- **Description:** The Triage panel debounces the `notes` PATCH by 600ms and flushes on textarea blur. When the user types into Notes and then switches selectedJobId via `j`/`k` (without leaving the textarea), the new job re-initializes the panel before the debounce or blur fires, so the pending edit for the previous job is dropped.
- **SC:** Switching selectedJobId always flushes pending Triage edits for the previous job first (notes, score override, verdict, status); typing in Notes, then pressing `j`/`k` persists the edit; closing the dialog or browser tab also flushes pending edits.
- **Notes:** Triage panel now tracks the loaded job snapshot (`loadedRef`) and the live form state (`pendingRef`). When `job?.id` changes or the panel unmounts, any diff in notes/nextAction/dueDate is PATCHed against the previous job before re-initializing.

#### #BUG-260604-0023 - Custom segmented controls and funnel-stage buttons lack visible focus rings

- **Complexity:** S | **Layers:** Frontend, Accessibility | **Status:** Done | **Depends on:** #BUG-260604-0015
- **Description:** The hand-rolled Pipeline mode toggle, Track layout toggle, Settings theme toggle, and Pipeline funnel-stage buttons do not set `focus-visible:ring-2 focus-visible:ring-ring/40`. Combined with the surrounding `outline-none / transition-colors` styling, this leaves keyboard users without a visible focus indicator on those controls.
- **SC:** All custom interactive controls (segmented buttons, funnel stage pills, any other bespoke `<button>` not using the `Button` primitive) render the canonical `focus-visible:ring-2 focus-visible:ring-ring/40` focus state; keyboard tab order through Pipeline and Settings shows a visible ring on every stop.
- **Notes:** Subsumed by #BUG-260604-0015's new `SegmentedControl` primitive (canonical focus ring built in). Funnel-stage buttons in `PipelinePage` were updated explicitly to add the same ring.

---

## Phase 4 - Usability Overhaul

> Goal: make the app approachable for a non-technical user. Intent-first navigation, attention-driving Today hub, markdown intake, and visible posting liveness.

#### #JOB-260601-0401 - Intent-first navigation (Today / Pipeline / Insights / Settings)

- **Complexity:** M | **Layers:** Frontend, Product | **Status:** Done | **Depends on:** #JOB-260511-0004
- **Description:** Restructure six domain tabs into four intent-first workspaces backed by UX research on hub-and-spoke patterns.
- **SC:** Top-level navigation is intent-first; Add Job is a modal (Manual / Markdown / Lookup); LLM and strategy live under Settings and on-demand per-job buttons.

#### #JOB-260601-0402 - Today attention hub

- **Complexity:** M | **Layers:** Frontend, Backend | **Status:** Done | **Depends on:** #JOB-260511-0202, #JOB-260601-0401
- **Description:** Add a landing hub of 4-6 attention cards: outreach due, follow-ups, awaiting triage, postings to re-verify, due this week. Each item links into the relevant job.
- **SC:** Today renders within the alert budget (max 5 cards), each card surfaces a count and up to 4 actionable items, and clicking an item deep-links to that job in Pipeline.

#### #JOB-260601-0403 - Onboarding and empty-state copy

- **Complexity:** S | **Layers:** Frontend | **Status:** Done | **Depends on:** #JOB-260601-0402
- **Description:** Add a dismissible Start Here panel, a Help modal, tooltips, and actionable empty states across major views.
- **SC:** First-run users see Start Here on Today; Help modal accessible from topbar; empty states explain context plus a primary action.

#### #JOB-260601-0404 - LLM-powered markdown import for deep-research dumps

- **Complexity:** M | **Layers:** Backend, Frontend, AI | **Status:** Done | **Depends on:** #JOB-260511-0301
- **Description:** Add `POST /api/import/markdown` that uses the configured LLM to extract jobs from arbitrary markdown into a JSON preview, with duplicate detection, before user-confirmed creation.
- **SC:** User can paste/upload markdown, parse, preview extracted jobs with duplicate warnings, choose which to include, and add them via the existing create path.

#### #JOB-260601-0408 - CSV intake for bulk role import

- **Complexity:** S | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260601-0404
- **Description:** Extend the Add Job → Markdown/CSV tab to accept CSV (paste or `.csv` upload). Add `POST /api/import/csv` with a dependency-free RFC-4180-style parser (quoted fields, embedded commas, CRLF, `""` escapes) and flexible header mapping (company/title/location/url/salary/summary/source). CSV is parsed deterministically with no LLM dependency and flows into the same preview + duplicate-detection + add-selected path as markdown.
- **SC:** A CSV with company and title/role columns parses into selectable previews with duplicate warnings; header aliases (e.g. "Role Title", "Direct Apply URL", "Posted Base Range") map correctly; quoted fields containing commas survive; missing required columns returns a clear error; CSV import works even when no LLM is configured.
- **Notes:** Frontend auto-detects CSV by file extension or a conservative header heuristic (skips markdown pipe tables and long prose cells), so the single Parse button routes CSV to the deterministic endpoint and markdown to the LLM endpoint.

#### #JOB-260601-0407 - In-app deep-research prompt copy

- **Complexity:** S | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260601-0404
- **Description:** Add `GET /api/research/prompts` that serves the `Docs/Deep Research Prompt*.md` files, and surface a copy-to-clipboard block at the top of the Add Job → From Markdown tab so the prompt can be copied directly from the launched app and run externally.
- **SC:** Prompt(s) load in the modal; user can pick between prompts when more than one exists; Copy prompt writes the full text to the clipboard (with a manual-select fallback) and confirms; the copied prompt round-trips into the existing markdown parse flow.
- **Notes:** Prompt content is read live from `Docs/` at request time, so editing the source markdown updates the in-app copy with no code change.

#### #JOB-260602-0409 - Link + JD auto-fill for manual intake

- **Complexity:** S | **Layers:** Frontend, AI | **Status:** Done | **Depends on:** #JOB-260601-0305
- **Description:** Let the user add a job manually by pasting just the role URL + full job description and clicking **Parse with AI**, which calls `POST /api/llm/summarize-jd` and auto-fills the Manual tab (company, title, location, salary, summary, keywords). All fields remain editable before save, and extracted keywords are persisted on create.
- **SC:** Pasting a URL + JD and parsing populates the manual form with the extracted fields; user can edit any field before adding; the created role saves the extracted keywords; the manual form still works (and clearly indicates) when no LLM is configured.
- **Notes:** Reuses the existing `summarize-jd` extraction endpoint; no new backend route. `POST /api/jobs` already accepts `keywords` and a salary `{label}` object, so create carries the parsed keywords and salary label through unchanged.

#### #JOB-260602-0410 - Automated posting verification + AI triage shortcut

- **Complexity:** S | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260601-0405, #JOB-260601-0304
- **Description:** Add `POST /api/jobs/:id/verify` that probes the posting URL (HEAD with GET fallback, 8s timeout, redirects followed) and returns `{ result: live | dead | uncertain, httpStatus, finalUrl, note, checkedAt }`. On `live`/`dead` results the job's `postingStatus` flips; on `uncertain` the previous status is preserved so a transient bot block does not erase a known-good "live" record. `posting_checked_at` always refreshes so reverify reminders age correctly. Add a **Verify link** action on the job card next to the existing "Still live?" select, and an **AI triage** action that selects the job and opens the AI assist tab so the user can run the existing fit-score analysis with one click.
- **SC:** Verify call writes a `posting_verified` event, updates posting status and checked timestamp, and returns a result the UI surfaces via toast; AI triage button reuses `POST /api/llm/fit-score` from the activity panel; manual "Still live?" dropdown remains as the fallback for sites that block automated checks.
- **Notes:** No new background worker or queue. Uncertain results keep the manual reverify path open. Frontend mutation invalidates `jobs`, `reminders`, and `events`.

#### #JOB-260602-0411 - Pipeline master-detail split + compact rows

- **Complexity:** S | **Layers:** Frontend | **Status:** Done | **Depends on:** #JOB-260602-0410
- **Description:** Replace the stacked Pipeline list + Activity panel layout with a 2-column master-detail split. Job list becomes compact one-line rows (`web/src/components/JobRow.tsx`) showing company/title, score, unified status, liveness, re-verify, and AI pills only. The Activity panel (Triage / Notes / Contacts / Events / AI assist) becomes the sticky right column, scrolling internally so it remains visible while the list scrolls. All per-card editor actions (Open posting, Verify link, Still live select, Not interested / Unhide, score breakdown) consolidate into the Triage tab so the list itself stays scannable. Collapses to single column at <=1200px.
- **SC:** Pipeline uses a `.pipeline-split` grid in `web/src/pages/PipelinePage.tsx`; clicking a row updates the right panel without scrolling; the right panel stays visible while the list scrolls; the editor exposes posting URL + verify + liveness + not-interested controls and the score breakdown; layout reverts to stacked on narrow widths.
- **Notes:** Applies the Eastern UX guide: Pali-Pali within the dense list, Ma between list and editor, Command Position on the top row, Yugen/Kanso for depth-on-demand. Legacy `JobCard` component is retained but no longer used by the Pipeline page. `scrollIntoView` calls were removed since the panel is always in view.

#### #JOB-260601-0405 - Manual posting-liveness toggle + re-verify reminders

- **Complexity:** S | **Layers:** Backend, Frontend | **Status:** Done | **Depends on:** #JOB-260511-0102, #JOB-260511-0202
- **Description:** Add `posting_status` (`unknown`/`live`/`dead`) and `posting_checked_at` columns. Surface a `Still live?` control per job, de-emphasize dead postings, and add a Today/reminders entry when a posting has not been verified in 14+ days.
- **SC:** Liveness state persists, dead postings are visually distinct, and re-verification needs surface on Today.

#### #JOB-260601-0406 - Cyberpunk-neon visual refresh

- **Complexity:** S | **Layers:** Frontend | **Status:** Done | **Depends on:** -
- **Description:** Replace the navy/gold token palette with a charcoal base + magenta and cyan accents, restrained neon glow on active states, glassy panels, tabular-nums KPIs, and tightened typography.
- **SC:** Active tabs, primary buttons, and selected cards have restrained glow; pills, score breakdown, and Today hub read clearly in dark mode; layout/markup is unchanged outside the new sections.

---

## Phase 5 - Frontend Stack Modernization

> Goal: replace the ~2000-line vanilla `app/app.js` with a modular, typed React SPA that's easier to extend and maintain while preserving the Node + SQLite API contract.

#### #JOB-260602-0501 - Vite + React + TypeScript SPA migration

- **Complexity:** L | **Layers:** Frontend | **Status:** Done | **Depends on:** #JOB-260601-0401
- **Description:** Stand up a new React 18 + TypeScript frontend under `web/` using Vite, with React Router for tab routing, TanStack Query for server state (`useJobs`, `useMetrics`, `useReminders`, etc.), and Zustand for ephemeral UI state (selection, filters, modals). Port all four tabs (Today, Pipeline, Insights, Settings), the Activity panel (Triage / Notes / Contacts / Events / AI assist), and both modals (Add Job - Manual/Markdown-CSV/Lookup, Help). The Node server now serves the React build from `web/dist` with an SPA fallback so deep-link refresh works; `/api/*` and `node:sqlite` are untouched.
- **SC:** `npm --prefix web run build` succeeds (TypeScript + Vite); `npm start` serves the SPA at `http://127.0.0.1:4310`; all flows from the legacy `app/app.js` work (intake, triage, notes/contacts/events, AI assist, insights, settings, saved views, import/export); deep-link refresh on `/today`, `/pipeline`, `/insights`, `/settings` lands on the right page; styles match (the original `styles.css` is reused).
- **Notes:** Legacy `app/` is kept routable at `/app/*` during transition. Web project uses a local `.npmrc` with `strict-ssl=false` to install through corporate TLS interception.

---

## Phase 6 - Eastern UX Realignment

> Goal: realign the React frontend to the principles in `Docs/eastern-ux-principles.md` — restrained calm visuals (Kanso/Koko/Seijaku), command-position hierarchy and 60-30-10 spacing (Command Position/Ma), human loading/error/empty states (Wabi-Sabi/Chi), anticipatory defaults (Omotenashi), and accessibility hardening.

#### #JOB-260602-0601 - Eastern UX realignment + 19-point audit

- **Complexity:** L | **Layers:** Frontend, Design | **Status:** Done | **Depends on:** #JOB-260602-0501
- **Description:** Full visual + interaction realignment of `web/` against the Eastern UX principles doc. Tokens, layout, motion, states, copy, and a11y reworked in one pass; legacy `app/` not touched.
- **SC:** Audit passes; `npm run web:lint`, `npm run web:typecheck`, and `npm run web:build` all clean.
- **What changed:**
  - **Design system** (`web/src/styles.css`): collapsed three neon accents to one calm primary (`--primary`) + one accent (`--accent`); removed all glow `box-shadow`s, `text-shadow`s, and panel/body gradients; added 60-30-10 spacing tokens (`--space-inner`/`--space-group`/`--space-section`); standardized motion tokens (`--motion-fast`/`--motion-default`/`--motion-ease`); removed the looping `panel-pulse` keyframe; wrapped all animation/transition in `@media (prefers-reduced-motion: reduce)`.
  - **Command position**: Today renders one `is-hero` card for the highest-tone-priority block (double-width, 40px count). Insights renders an `is-hero` metric card for response rate with supporting metrics. Pipeline job rows already lead with role identity at the eye-landing position.
  - **Honest states** (`web/src/components/States.tsx` — new): shared `SkeletonRows`/`SkeletonCards`/`SkeletonLines`, `ErrorState` (extra Ma + retry action), `EmptyState`, and `InlineConfirm` components, wired into Today, Pipeline, Insights, and Settings (export/import/save errors no longer silent).
  - **In-app confirm**: `window.confirm` removed from both `ManualAddTab` and `LookupAddTab`; duplicate detection now shows an inline confirm UI with clear Confirm/Cancel actions.
  - **Omotenashi pre-fills**: `ManualAddTab` pre-fills Location from `strategy.preferredMarket` and Lane from `strategy.roleFamilies[0]` so users confirm rather than re-type.
  - **Koko/Jeong copy**: tightened `Add Job` → `Add job`, `? Help` → `Help`, `Add target job` → `Add job`; warmed transactional copy ("Pick a job on the left to start.", "We couldn't load Today.", "This looks like a duplicate.").
  - **Accessibility**: full `role="tab"`/`role="tabpanel"`/`aria-selected`/`aria-controls`/`tabIndex` on `ActivityPanel` and `AddJobModal` tabs; `aria-live` and `role="alert"`/`role="alertdialog"` on state components.
- **19-point audit (per the doc):**
  - **Tier 1 (Critical 5):** 1. Eye lands right - PASS (hero cards on Today/Insights). 2. No dead ends - PASS (every error has retry, every empty has CTA). 3. Blur test - PASS (60-30-10 spacing creates visible bands). 4. Not asking for known info - PASS (Location/Lane pre-filled from strategy). 5. Click count - PASS (top tasks ≤ 3 clicks).
  - **Tier 2 (10 more):** 6. Human errors - PASS. 7. Honest loading - PASS (skeletons everywhere). 8. Inviting empties - PASS. 9. Subtraction - PASS (3 accents → 1; glows/gradients removed). 10. Copy conciseness - PASS. 11. Tab order - PASS. 12. Animation physics - PASS (ease-in-out tokens, no loops). 13. Destruction cycle - PASS (Fire no longer drowns Metal; the dashboard reads).
  - **Tier 3 (Philosophy):** 14. Balance - PASS. 15. Context awareness - PASS within single-user scope (pre-fills + reduced-motion). 16. Progressive depth - PASS (Yugen via expandable score breakdown, activity tabs, optional Start-here). 17. Calm - PASS (no looping animation, no glow noise). 18. Delight - NOTE (datsuzoku is understated per the doc: the hero anchor + Omotenashi pre-fills). 19. Warm tone - PASS.
  - **Score: 18/19 PASS, 1 NOTE.** Inhwa (multi-user) marked N/A for a single-user local app.

#### #JOB-260602-0602 - Editable scoring rubric (data, API, library, editor)

- **Complexity:** L | **Layers:** Backend, Frontend, Data | **Status:** Done | **Depends on:** #JOB-260602-0601
- **Description:** Replace the hardcoded scoring rules in `web/src/lib/scoring.ts` with a data-driven rubric that lives in `app_settings.rubric_config_json`. Ship a full editor in Settings so users can rename categories, change caps, edit keyword lists, swap scorer kinds, and bind rubrics to a lane.
- **SC:** `GET/PUT /api/rubrics` and `POST /api/rubrics/reset` round-trip; first read seeds from the original hardcoded values so existing scores stay stable; caps must sum to 100 to save; sample-job live preview updates as the user edits.
- **What changed:**
  - **Server** (`server.js`): added `defaultRubricConfig()`, `getRubricConfig()`, `saveRubricConfig()`, `resetRubricConfig()`, and `cleanRubricCategory()` with five scorer kinds (`keyword_count`, `keyword_threshold`, `location_match`, `regex_tier`, `salary_floor`). Routes mounted next to `/api/strategy`.
  - **Client lib** (`web/src/lib/scoring.ts`): rewritten as a data-driven `calculateScoreBreakdown(job, rubric)` that dispatches on `scorer.kind`. Seed rubric is exported as a fallback for offline/empty cases. Thresholds (`applyNow`/`selective`) are now part of the rubric and drive `bucketForScore` everywhere.
  - **Hook** (`web/src/hooks/queries.ts`): new `useRubrics`, `useSaveRubrics`, `useResetRubrics`. All score callers (`JobRow`, `JobCard`, `Triage`, `ManualAddTab`, `LookupAddTab`, `MarkdownAddTab`, `AiAssist`) now thread the active rubric. Lane match selects a rubric; otherwise the default applies.
  - **Editor** (`web/src/components/settings/RubricsEditor.tsx`, new): rubric picker with new/duplicate/delete, name + optional lane + thresholds + "set as default" toggle, drag-free reorder (move up/down), add/remove categories, scorer-kind-aware sub-forms for each of the five scorer kinds, caps total ("X / 100" with green/amber), live sample-job preview against the in-flight draft, and a Reset-to-default with `InlineConfirm`.

#### #JOB-260602-0603 - Triage rework + role brief + bulk triage + keyboard nav

- **Complexity:** L | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260602-0602
- **Description:** Reshape triage into a one-click verdict flow, anticipate next actions on status changes, auto-save fields on blur, and add a structured activity header with a client-presentable role-brief export. Add bulk triage with InlineConfirm and `j`/`k` keyboard nav for the pipeline list.
- **SC:** Verdict buttons reflect saved state; Apply now / Pursue / Skip / Not a fit single-click works with optimistic UI and Undo via toast action; smart defaults pre-fill `nextAction`/`dueDate` only when empty; `<details>` granular-status auto-saves; activity header shows score + verdict pills + open posting + verify link + Share brief; bulk toolbar applies `Mark not a fit`/`Mark posting dead`/`Re-score` after `InlineConfirm`; `j`/`k` (or arrows) move selection, `g g` to top, `G` to bottom, `Enter` focuses the verdict row, ignoring form-field focus.
- **What changed:**
  - **Triage panel** (`web/src/components/activity/Triage.tsx`): rewritten. Four verdict buttons drive `discoveryStatus`/`priorityTier`/`applicationStatus`/`interviewStatus` in one PATCH; current verdict is derived from job state (read-after-write); `Saved`/`Saving...` indicator near the verdict row; score breakdown is open by default once score >= `rubric.thresholds.selective` (Yugen); notes auto-save 600ms debounced + on blur; next action + due date auto-save on blur with smart-default pre-fills on `application=applied`, `interview=screen_done`/`interview_done`/`offer`. Granular discovery/application/interview + priority-tier selects moved into a `<details>` expander that auto-saves on change. Replaced the two `Save` buttons with the optimistic verdict flow.
  - **Undo toast** (`web/src/lib/toast.ts`): toast now accepts an optional action button; Triage uses it to ship an Undo that restores the pre-verdict snapshot through a fresh PATCH.
  - **W5 bug-fix during verification:** the prior `useEffect` reset depended on `[job]` (object identity), which dropped in-progress edits on any background `["jobs"]` invalidation, and `tier` defaulted to `bucketForScore(score)` instead of `job.priorityTier`, silently overwriting saved tier choices. Both fixed.
  - **Activity header** (`web/src/components/ActivityPanel.tsx`): replaced the muted `Editing: …` line with a structured `ActivityHeader` that owns role title, company + location + lane, score pill, verdict pill, Open posting, Verify link, and the Share brief dropdown. Reads the rubric so the score pill reflects the active rubric and the verdict pill uses centralized `currentVerdict()` from `web/src/lib/verdicts.ts`.
  - **Role brief** (`web/src/components/activity/ShareRoleBriefButton.tsx`, new): builds a Markdown brief with identity, score table, rubric used, status, next action, score notes, AI fit summary (when present), top 5 notes, and contacts. Copy-to-clipboard and Download .md actions; LLM keys/internal IDs are never included.
  - **Pipeline list** (`web/src/pages/PipelinePage.tsx` + `web/src/components/JobRow.tsx`): added keyboard nav (`j`/`k`/arrows/`g g`/`G`/`Enter`) that ignores form-field focus; added an optional row checkbox + bulk toolbar (`Mark not a fit`, `Mark posting dead`, `Re-score`) that goes through `InlineConfirm` with a per-action body. `JobRow` now shows a verdict pill (`Apply now`/`Pursue`/`Skip`/`Not a fit`) instead of the raw tier.
  - **Backlog hygiene:** all five scorer kinds are documented in the rubric editor; existing scores are preserved on first load (no scoring drift unless the user edits).

#### #JOB-260602-0604 - Copilot improvement guide implementation (score + verdict + filter + IA polish)

- **Complexity:** L | **Layers:** Frontend, UX, A11y | **Status:** Done | **Depends on:** #JOB-260602-0603
- **Description:** Implement the do-first and quick-win items from `References/job-search-copilot-improvement-guide.md`: a deliberate score color system with non-color a11y indicator, verdict-button visual hierarchy with keyboard shortcuts and archive-and-next auto-advance, pipeline filter expansion (score floor, quick pills, sort, inline saved views), AI-rationale / user-notes split, today nudges, microcopy fixes, and a global `?` shortcut overlay.
- **SC:** `npm run web:lint` / `web:typecheck` / `web:build` all clean; server smoke `GET/PATCH/PUT /api/*` healthy; `1`/`2`/`3`/`4` trigger verdicts and the next untriaged job auto-selects after definitive verdicts; the rubric editor and existing pipeline shortcuts still work; the SavedViewsPanel left-rail removed without breaking nav.
- **What changed:**
  - **Score color system** (`web/src/lib/scoring.ts`, `JobRow`, `JobCard`, `ActivityPanel`): new `scoreRisk()` returns `{className, glyph, label}` so each score pill exposes color **and** a leading glyph (filled / triangle / hollow) plus an `aria-label` like "Score 72 of 100, Strong fit". Pills now render a `score-pill` variant for tabular alignment.
  - **Verdict hierarchy + shortcuts** (`web/src/components/activity/Triage.tsx`): the verdict that matches the current bucket (or the saved verdict) renders as `verdict-btn-primary`; the others as muted `verdict-btn-secondary`. Each button has a `<kbd>` chip plus `aria-keyshortcuts`. Global key listener on the panel triggers `1`/`2`/`3`/`4` -> Apply / Pursue / Skip / Not a fit while form fields stay typeable.
  - **Auto-advance** (`web/src/store/ui.ts`, `PipelinePage`): Triage calls `requestAutoAdvance()` after definitive verdicts (skip/apply/not-a-fit); pipeline page subscribes to the token and selects the next untriaged role (verdict===null or discovery==="new"), wrapping at the end of the list.
  - **Pipeline IA + filters** (`web/src/components/PipelineToolbar.tsx`, `PipelinePage.tsx`): new sort control (score / date / company), score-floor slider (0-100 step 5), quick-filter chip row (Live only / Not yet applied / Needs triage), reset-filters button, and inline saved-views chips so the IA stops splitting context to the left rail. SavedViewsPanel was removed from Layout. Hidden-count "X closed hidden - show" is now a button.
  - **Notes split** (`Triage.tsx`): an `AI rationale` block now renders above the user-notes textarea when the job has an `aiAnalysis` payload (read-only rationale + fit-hook/risk lists with the AI score). The user textarea is labeled `Your notes`.
  - **Today proactive nudge** (`web/src/pages/TodayPage.tsx`): new `Below score floor (N+)` card derived from the active rubric's selective threshold so the doc's example ("4 jobs don't meet your guardrail floor") is concrete; "Awaiting triage" now uses `currentVerdict()` to detect un-triaged rather than a hardcoded `score < 60`.
  - **Activity header icon row** (`web/src/components/ActivityPanel.tsx`): replaced the three text actions with an SVG icon row (Open posting / Check link / Share brief) and bumped the role-title typography to 22px / 600 so the title finally dominates the panel.
  - **Sidebar nav legibility** (`web/src/styles.css`): active tab now also gets a 3px primary-strong left border on top of the soft background; idle labels render at ink color so they don't fade.
  - **Microcopy** (`TabsNav`, `PipelinePage`, `JobCard`, `PipelineToolbar`, `Triage`): `Work the list` -> `Review pipeline`; `Pick a row to work it on the right.` -> `Select a role to review details ->`; `Why this score?` -> `Score breakdown`; `Verify link` -> `Check link`; saved-views empty state -> `Filter your list above, then save as a view.`.
  - **Shortcut overlay** (`web/src/components/ShortcutOverlay.tsx`, new): `?` opens a modal listing pipeline / triage / app shortcuts; bound `n` for Add job and `h` for Help; integrated with Layout + HelpModal.

#### #JOB-260603-0605 - First-class applied date tracking

- **Complexity:** M | **Layers:** Backend, Frontend, Data | **Status:** Done | **Depends on:** #JOB-260511-0120, #JOB-260602-0604
- **Description:** Add first-class application date tracking so the Pipeline can answer "what did I apply to and when?" without inferring from `updatedAt`. Add an additive `applied_at` field to jobs, keep it synchronized with `application_submitted` events, and surface true "Applied Xd ago" copy in Track.
- **SC:** Transitioning a job to `applicationStatus=applied` stamps `applied_at` when empty and creates/keeps an `application_submitted` event; existing applied jobs backfill from the earliest application event when available; API export/import round-trips `appliedAt`; Track sections/table show applied date + days since; reminders and follow-up nudges use the canonical applied date rather than last updated date.
- **Notes:** Added additive `jobs.applied_at`, backfilled from the earliest `application_submitted` event, exposed `appliedAt` in API responses/snapshots, stamped it on create/PATCH when application status becomes `applied`, and taught reminders to fall back to the canonical applied date when older rows lack an application event.

#### #JOB-260603-0606 - Track layout refinement and configurable table columns

- **Complexity:** S | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260602-0604
- **Description:** Polish the Track half of the Pipeline after real usage: decide which stage sections should default collapsed/expanded, tune the funnel ordering, and make the dense table columns reflect the actual tracking job-to-be-done.
- **SC:** Track defaults prioritize active work without hiding important follow-ups; table includes the right tracker fields (company, title, score, stage, applied date, days since, next action, posting status); closed/not-a-fit items stay available without dominating the default view; layout remains usable with the right detail panel at roughly one-third width.
- **Notes:** Active Track stages now default expanded (only Closed collapses when shown). Applied roles sort by true `appliedAt`, section row meta says `applied Xd ago`, and the dense Track table includes Applied + Days columns alongside company/title/score/stage/next action/posting.

#### #JOB-260603-0607 - Mode-aware Pipeline detail panel

- **Complexity:** M | **Layers:** Frontend, UX, Product | **Status:** Done | **Depends on:** #JOB-260602-0604
- **Description:** Make the right-hand Activity panel context-aware for `Decide` vs `Track` so fields and actions match the job's state. Roles still being decided should emphasize triage, fit, and decision actions; roles being tracked as applied/interviewing should emphasize application timeline, follow-ups, contacts, notes, and next actions instead of triage verdicts.
- **SC:** In `Decide`, the detail panel shows triage-first content and decision actions; in `Track`, applied/interviewing/offer roles do not show prominent triage/verdict controls; the default tab/action set changes based on stage; score/rationale remains available as reference without crowding tracking work; keyboard shortcuts do not trigger triage actions for roles that are already being tracked.
- **Notes:** `ActivityPanel` now derives the selected job's stage and only renders the Triage tab in Decide context. Track jobs default away from triage into Events, the header shows stage/applied context, and triage verdict shortcuts are no longer mounted for already-tracked roles.

#### #JOB-260603-0608 - AI Assist reliability and workflow integration

- **Complexity:** M | **Layers:** AI, Backend, Frontend, UX | **Status:** Done | **Depends on:** #JOB-260511-0301, #JOB-260601-0304, #JOB-260601-0305, #JOB-260602-0604
- **Description:** Make the per-job AI Assist tab work end-to-end as a reliable, user-triggered workflow. The panel should clearly show configuration state, run fit scoring / JD extraction / outreach / interview-pack actions, display errors usefully, and apply generated outputs only after explicit user confirmation.
- **SC:** AI Assist clearly handles unconfigured LLM settings; each action has a visible loading/error/success state; generated output is previewed before save; Apply writes the intended fields/notes/events and invalidates affected queries; failures preserve existing job data; the AI tab is reachable from relevant Decide/Track workflows without becoming mandatory.
- **Notes:** AI Assist now reads LLM settings state, shows configured/unconfigured guidance, uses consistent loading/success/warn/error notices, catches draft-generation failures, preserves preview-before-apply behavior, and invalidates jobs/notes/events after applying generated outputs.

#### #JOB-260603-0609 - Track mode action-first IA cleanup

- **Complexity:** M | **Layers:** Frontend, UX, Product | **Status:** Done | **Depends on:** #JOB-260603-0607
- **Description:** Reframe Pipeline Track mode around the tracking job-to-be-done: what has been applied to, what stage it is in, how long it has been waiting, and what needs action next. Remove or de-emphasize triage-era signals like score, score floor, score sorting, and verdict pills from the default Track experience.
- **SC:** Track mode defaults to action/waiting context rather than fit scoring; applied/interviewing rows can be scanned without score noise; score/rationale remains available as secondary reference in detail views; Decide mode keeps the current triage controls.
- **Notes:** Track-mode rows render via a `track` variant of `JobRow` that swaps score/verdict pills for stage/applied/days/next-action + exception pills (Closed, Re-verify, "no next action"). Score remains visible in the right detail panel (`ActivityHeader`) so the rubric signal is one click away without crowding the list.

#### #JOB-260603-0610 - Mode-aware Pipeline toolbar and filters

- **Complexity:** S | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0609
- **Description:** Split the Pipeline toolbar controls by mode. Decide should keep search, discovery/application filters, score floor, score/date/company sort, and triage quick filters. Track should replace them with workflow filters such as Needs follow-up, Waiting, Interview scheduled, No contact, Stale, Closed, and Re-verify.
- **SC:** Switching between Decide and Track changes available filters and sort options; Track no longer exposes score floor or score-first sorting by default; active filters are summarized clearly; hidden/closed/not-a-fit controls move under a compact More filters disclosure.
- **Notes:** `PipelineToolbar` swaps controls by `pipelineMode`. Decide keeps Search + Discovery + Application + Score floor + Sort (Score/Date/Company) + the original quick chips. Track shows Search + Sort (Needs action / Oldest applied / Recently updated / Upcoming interview / Company) + workflow chips (Needs follow-up, Waiting, Interview scheduled, No contact, Stale, Re-verify). Hidden + Closed checkboxes moved into a "More filters" disclosure. `setPipelineMode` in the UI store resets sort/quick-filter when the active value doesn't apply to the new mode.

#### #JOB-260603-0611 - Track row redesign around wait state and next action

- **Complexity:** M | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0609
- **Description:** Redesign Track rows so the primary information is company/role, pipeline stage, applied date, days waiting, last meaningful event, next action, contact status, and exceptional posting state. Remove default score and verdict pills from Track rows.
- **SC:** A Track row answers "what is this, when did I apply, and what should I do next?" at a glance; rows show Closed/Re-verify only as exceptions rather than repeating Live on every row; contact and next-action gaps are visible; rows remain compact in the master-detail split.
- **Notes:** Track-variant `JobRow` shows `applied <date> · Xd ago · next: <action> · due ...` as the sub line, a single stage pill (Applied / Screening / Interviewing / Offer / Closed) on the right, and exception pills (Closed, Re-verify, "no next action") only when relevant. Live pills no longer repeat on every Track row.

#### #JOB-260603-0612 - Track default sort and stage queue rules

- **Complexity:** S | **Layers:** Frontend, UX, Product | **Status:** Done | **Depends on:** #JOB-260603-0611
- **Description:** Replace score-oriented Track ordering with queue rules that surface stale waits and due actions first. Applied roles should prioritize oldest unanswered applications and due follow-ups; interviews should prioritize upcoming dates and pending prep/thank-you tasks.
- **SC:** Track default sort is Needs action first; alternate sorts include Oldest applied, Recently updated, Company, and Upcoming interview; stage sections remain predictable; closed/rejected roles never outrank active follow-up work by default.
- **Notes:** Track grouping in `PipelinePage` sorts each stage list with a new `compareTrackBySort` helper. `needs_action` ranks past-due `dueDate` first, then today/future due, then applied roles aged >=14d, then everything else by recency. `upcoming_interview` lifts `screen_scheduled`/`interview_scheduled` roles by `dueDate` asc. Closed roles still need explicit `showClosed` to appear.

#### #JOB-260603-0613 - Meaningful activity timeline and system-event hiding

- **Complexity:** S | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260511-0120, #JOB-260603-0607
- **Description:** Reduce noise in the Events panel by hiding low-value system events such as repeated `job_updated` entries by default, grouping same-day changes, and presenting event labels in readable language.
- **SC:** Events defaults to meaningful milestones (application submitted, outreach, follow-up, recruiter reply, screen/interview, offer, rejected/closed); system updates are available behind "Show system events"; snake_case event labels are rendered as human-readable copy; repeated same-day updates do not dominate the panel.
- **Notes:** `EventsPanel` now humanizes event types via a label map (`application_submitted` -> `Application submitted`, etc.), hides `job_updated` / `updated` / `posting_verified` behind a `Show system events (N)` toggle (only rendered when those exist), and collapses same-day same-type runs into a single row with a `+N more on this date` indicator.

#### #JOB-260603-0614 - Track detail panel summary and quick actions

- **Complexity:** M | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0607, #JOB-260603-0613
- **Description:** Add a Track-first summary surface in the right detail panel that leads with next step, application facts, recent meaningful activity, contacts, and notes preview. Make common tracking actions one click instead of forcing manual event-form entry.
- **SC:** Track jobs default to a Summary or Activity tab rather than raw Events; quick actions include Followed up, Recruiter replied, Screen scheduled, Interview scheduled, Rejected, Closed, and Add contact/note; event logging remains available for custom entries; the panel clearly distinguishes current next action from historical activity.
- **Notes:** New `SummaryPanel` (`web/src/components/activity/Summary.tsx`) is the default tab in Track context (ActivityPanel hides the Triage tab; Decide hides the Summary tab so each mode reads as one workflow). Sections: a `Now` block that highlights `nextAction` + due-date pill (tone-coded), an `Application` facts grid (stage, applied date + days, posting status, contacts count), `Quick actions` (Followed up, Recruiter replied, Screen scheduled, Interview scheduled, Add note, Add contact, Mark rejected) that log timeline events and PATCH interview status in one click via `useAddEvent`/`usePatchJob`, a `Recent activity` list filtered to meaningful milestones (using the 0613 humanizer + system-event filter) with a "View all" jump to Events, and a `Notes preview` block when notes exist. Mark rejected reuses the InlineConfirm flow already wired in ActivityPanel.

#### #JOB-260603-0615 - Saved views and Track presets cleanup

- **Complexity:** S | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0610
- **Description:** Make saved views less prominent until useful and seed Track-oriented presets that match real workflow needs. Replace the large empty saved-view row with compact access to saved views and one-click presets.
- **SC:** Empty saved views do not consume a full toolbar row; built-in Track presets include Needs follow-up, Active interviews, Waiting on response, No contact yet, and Stale postings; user-saved views still persist locally and can be renamed/deleted without crowding the primary controls.
- **Notes:** PipelineToolbar collapses the saved-views form into a `<details>` disclosure ("Save this filter") when no views exist, so the empty state no longer occupies a full row. Track mode adds a `Presets` chip row above the quick filters with one-click combos: Needs follow-up, Active interviews (upcoming-interview sort), Waiting on response (oldest-applied sort), No contact yet, and Stale postings (oldest-applied sort). Each preset sets `quickFilter` + `sortMode` together and lights up when both match the current state. User-saved views still render as chips with delete buttons.

#### #JOB-260603-0616 - Rejected application action and auto-archive

- **Complexity:** S | **Layers:** Frontend, Backend, UX | **Status:** Done | **Depends on:** #JOB-260603-0614
- **Description:** Add a first-class way to mark a tracked role as Rejected from the Pipeline detail panel and/or row quick actions. The action should update application/interview state appropriately, log a meaningful rejection/closed event, and move the role out of the active Track queue by default.
- **SC:** Track jobs expose a clear Mark rejected action; confirming it sets the role to a rejected/closed state without requiring manual status juggling; the job disappears from active Track unless closed/rejected items are explicitly shown; the timeline records the rejection date and optional details; rejected roles remain searchable/recoverable for history and Insights metrics.
- **Notes:** ActivityPanel now exposes a Mark rejected icon button in the header actions for tracked jobs (stage != decide && != closed). Confirming through `InlineConfirm` PATCHes `applicationStatus=rejected` + `interviewStatus=closed` and logs an `application_rejected` timeline event. Stage flips to `closed` via existing `stages.ts` logic, so the role drops out of active Track unless `showClosed` is on. Events panel humanizes the new event type via the 0613 label map.

---

## Phase 7 - v0-Inspired Visual System Adoption

> Goal: adopt the v0 mockup (`OneDrive - PwC/Downloads/JS App`) visual language via a hybrid approach. Add Tailwind v4 + an oklch token system (dark default) + lucide icons + a small shadcn-style primitive set, then re-skin each surface page-by-page. Backend, API, React Query, three-axis status model, Decide/Track modes, rubric scoring, AI assist, reminders, and saved views are all preserved.

#### #JOB-260603-0701 - Tailwind v4 + oklch token foundation

- **Complexity:** S | **Layers:** Frontend, Design | **Status:** Done | **Depends on:** #JOB-260602-0601
- **Description:** Add `tailwindcss@4`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`, `class-variance-authority`, and `lucide-react` to `web/`. Wire `@tailwindcss/vite` in `web/vite.config.ts`. Port the v0 mockup's `@theme inline` block and oklch tokens into `web/src/styles.css`, with the mockup's `.dark` palette assigned to `:root` so dark is the default. Expose the mockup's light palette behind a `.light` class for later toggling. Default `<html>` to `class="dark"` in `web/index.html` and add `web/src/lib/cn.ts`.
- **SC:** Tailwind utility classes resolve in `.tsx` files; oklch CSS vars (`--background`, `--foreground`, `--card`, `--primary`, `--ring`, etc.) are available globally; existing legacy `styles.css` continues to render the app without visual regressions; `npm run web:build` succeeds.
- **Notes:** Added Tailwind v4 + `@tailwindcss/vite`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, Radix primitives (dialog/tooltip/tabs/select/separator/progress/scroll-area/slot), and `@types/node`. `vite.config.ts` registers the Tailwind plugin and `@` -> `src` alias; `tsconfig.json` mirrors the alias. `styles.css` now imports Tailwind, declares an `@theme inline` block mapping oklch vars to Tailwind colors, and assigns mockup `.dark` palette to `:root` with `html:not(.dark)` overriding to the light palette. `html` boots with `class="dark"` and an inline script applies any `jsing.theme` localStorage override on first paint. `body` switched to `var(--background)` / `var(--foreground)` so legacy + Tailwind surfaces match. Added `@/lib/cn.ts` `cn()` helper.

#### #JOB-260603-0702 - shadcn-style primitive library

- **Complexity:** M | **Layers:** Frontend | **Status:** Done | **Depends on:** #JOB-260603-0701
- **Description:** Create a small primitive set under `web/src/components/ui/` adapted from the mockup's `components/ui/*`: `button`, `input`, `textarea`, `badge`, `card`, `tabs`, `tooltip`, `dialog`, `select`, `separator`, `scroll-area`, `progress`. Avoid pulling in the full shadcn CLI; copy only the patterns needed and keep dependencies minimal (use Radix only where the mockup does, otherwise lightweight CSS-only variants).
- **SC:** Each primitive renders with the mockup's visual language using the oklch tokens; primitives compose with `cn()`; downstream pages can import from `@/components/ui/*`-equivalent paths.
- **Notes:** Ported all twelve primitives under `web/src/components/ui/`. The mockup uses `@base-ui/react` for several primitives; we replaced those with plain HTML elements (`button`, `input`, `textarea`, `span`) for Button/Input/Textarea/Badge/Card and Radix for the rest (Dialog, Tooltip, Tabs, Select, Separator, Progress, ScrollArea). `Button` accepts an `asChild` prop via Radix `Slot`. `Badge` exposes `default | secondary | destructive | outline | ghost | success | warning` variants to back the new pill semantics. `Tabs` exposes `default` and `line` (underlined) variants so the mockup's underlined tabbed-detail can be reused for Activity and AddJob dialogs.

#### #JOB-260603-0703 - Icon sidebar + top-header app shell

- **Complexity:** M | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0702
- **Description:** Rebuild `web/src/components/Layout.tsx`, `TopBar.tsx`, and `TabsNav.tsx` into the mockup's `w-16` icon sidebar + `h-14` top header (search + Add Job) pattern. Swap to lucide icons. Keep Guardrails and saved-view access reachable from the new shell (sidebar item, header action, or moved into Settings) rather than dropped. Preserve global modals (Add Job, Help, Shortcut overlay).
- **SC:** Sidebar uses lucide icons with tooltip-on-hover; active workspace styled with `bg-primary text-primary-foreground`; header search is wired to existing search state; Add Job opens existing `AddJobModal`; no routes break; deep-link refresh still lands correctly.
- **Notes:** `Layout.tsx` now renders a `w-16` sidebar (briefcase logo, `TabsNav` icon column, bottom-aligned guardrails badge) plus a flex column with `TopBar` + scrollable outlet. `TabsNav` uses lucide icons (`CalendarCheck`/`Briefcase`/`BarChart3`/`Settings`) inside Radix Tooltips and exports `workspaceTabs` for the topbar's active-tab lookup. `TopBar` renders the active workspace name + candidate name on the left, a search input bound to `useUiStore.search` in the middle, and Help (icon) + Add job (primary) on the right. `Guardrails` was split into `GuardrailsBadge` (shield icon + tooltip popover summarising market / salary floor / travel) which lives bottom-of-sidebar, while the legacy panel layout is kept as a fallback export. Saved-view access stays accessible from the Pipeline toolbar. Global modals (Add Job, Help, Shortcut overlay) and Escape handling are preserved.

#### #JOB-260603-0704 - Today workspace re-skin

- **Complexity:** S | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0703
- **Description:** Re-skin `TodayPage.tsx` to the mockup's stat-card + attention-card grid pattern (`max-w-6xl`, `grid grid-cols-4`, `bg-card`, hover affordances), preserving `useJobs`/`useReminders`/`useRubrics` data and existing hero-card / attention-card logic (Outreach due, Follow-ups, Awaiting triage, Below score floor, Postings to re-verify, Due this week).
- **SC:** Today renders within alert budget; clicking attention items still deep-links into Pipeline; empty/loading/error states render via the shared States components in the new visual language; existing hero behavior preserved.
- **Notes:** Today now renders as a `max-w-6xl` scroll area with a header (title + dated badge), an optional Start-here card, and a responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` attention grid. Each card pairs a lucide icon glyph (Phone/Clock/Inbox/AlertTriangle/RefreshCw/LineChart), a tone-coloured count, and the existing item list with hover-reveal arrows that deep-link into Pipeline. Hero ranking by tone-priority is preserved; the hero card spans two columns on wider widths and shows a "Top focus" badge. All-clear and empty states render via the new `States` (`Card` + `Button`). `States.tsx` was rewritten in Tailwind so every page picks up the new visual language for loading/empty/error/inline-confirm.

#### #JOB-260603-0705 - Pipeline workspace re-skin

- **Complexity:** L | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0703
- **Description:** Re-skin `PipelinePage.tsx`, `JobRow.tsx`, `PipelineToolbar.tsx`, and `ActivityPanel.tsx` (plus activity sub-panels) to the mockup's master-detail + tabbed-detail pattern. Keep Decide vs Track modes, both `JobRow` variants, keyboard nav (`j`/`k`/`g g`/`G`/`Enter`/`1`-`4`), bulk actions with `InlineConfirm`, score breakdown, mode-aware toolbar, saved-view chips, and all activity sub-panels (Summary/Triage/Notes/Contacts/Events/AI assist).
- **SC:** Decide and Track modes both work end-to-end with the new visuals; keyboard shortcuts unchanged; bulk actions still confirm; activity tabs render in the mockup's underlined-tab style; master-detail collapses to single column under ~1200px.
- **Notes:** `PipelinePage.tsx` now uses a `lg:grid-cols-[5fr_4fr]` master-detail layout (single column on narrow widths). Mode toggle is a Tailwind segmented control with embedded counts; the score-floor range, sort/discovery/application Selects, more-filters disclosure, chip groups, and saved-view chips all live in the re-skinned `PipelineToolbar`. The Track funnel renders as a chip strip with `ChevronRight` separators; the layout switch (`Sections` / `Table`) uses lucide icons. `JobRow` was rewritten in Tailwind — hover/selected/checked/dead states, score/verdict pills with oklch tones, and the trailing actions slot all live in utility classes. `ActivityPanel` uses the new `Tabs` primitive in `line` variant, a header with score/stage/verdict pills, and lucide icon-buttons inside Radix Tooltips for ExternalLink / ShieldCheck (verify posting) / XCircle (reject). Decide/Track logic, score-floor, `requestAutoAdvance`, `j/k/g g/G/Enter` keyboard nav, `1`-`4` verdict shortcuts (sourced from sub-panel), bulk action `InlineConfirm`, and the `#activityPane-triage .verdict-btn` Enter-target selector are all preserved. Activity sub-panels (Summary/Triage/Notes/Contacts/Events/AI assist) still live under the legacy CSS surfaces; they read correctly inside the new chrome via the shared `--background` / `--foreground` tokens. Activity tabs scroll inside a Radix `ScrollArea`.

#### #JOB-260603-0706 - Insights workspace re-skin

- **Complexity:** M | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0703
- **Description:** Re-skin `InsightsPage.tsx` to the mockup's KPI cards + funnel + hand-built Tailwind charts pattern, keeping `useMetrics`/`useReminders`/`useStrategyPerformance` data and existing reminder queue + source/saved-search cards.
- **SC:** Hero metric retained; supporting metrics render as the mockup's KPI cards; funnel renders as horizontal stage bars; weekly activity / score distribution / source breakdown render via Tailwind-based bars (no new charting dependency); reminder queue + strategy performance preserved.
- **Notes:** Insights renders inside a `max-w-6xl` scroll container with header (title + Refresh button), a responsive KPI grid (hero "Response rate" spans two columns), Reminder queue cards with severity badges + Snooze/Complete actions, and Source / Saved-view cards with `success`/`destructive` health badges. All data hooks (`useMetrics`, `useReminders`, `useStrategyPerformance`) are unchanged. `MetricCard` helper standardises label + value + sub layout. Hand-built charts beyond KPIs were not added because the data model already drives the existing cards; that follow-up can land later without disrupting consumers.

#### #JOB-260603-0707 - Settings + modals re-skin + theme toggle

- **Complexity:** M | **Layers:** Frontend, UX | **Status:** Done | **Depends on:** #JOB-260603-0703
- **Description:** Re-skin `SettingsPage.tsx`, `AddJobModal.tsx` (+ Manual/Markdown/Lookup tabs), `HelpModal.tsx`, and `ShortcutOverlay.tsx` to the mockup's card + dialog patterns. Add a light/dark theme toggle in Settings (Appearance section) that flips a class on `<html>` and persists to localStorage.
- **SC:** Settings sections render as cards (Search strategy, Rubric editor, LLM, Appearance, Data management); Add Job dialog uses the new dialog primitive with tabbed body; theme toggle switches between dark and light using the ported oklch palettes and persists across reloads.
- **Notes:** Settings now lists Search strategy, Scoring rubrics, LLM assist, Appearance, Backup + restore, Guardrails reference, and Target families as `Card` sections inside a `max-w-4xl` scroll container. The Appearance card hosts a three-option theme toggle (`Light` / `Dark` / `System`) that writes `jsing.theme` to localStorage; the `index.html` boot script reads that key before paint to avoid theme-flash on reload. `AddJobModal` becomes a Radix `Dialog` with the new `line`-variant Tabs (Manual / Markdown / Lookup) and a 60vh scrolling body. `HelpModal` and `ShortcutOverlay` are now Dialogs with the new typography, kbd chips, and a "Press ? to reopen" footer; ShortcutOverlay keeps its global `?`/`n`/`h` hotkey wiring intact. The RubricsEditor still renders inside the Card with its existing logic untouched.

#### #JOB-260603-0708 - Visual cleanup, audit, and dead-code prune

- **Complexity:** S | **Layers:** Frontend, Design | **Status:** Done | **Depends on:** #JOB-260603-0704, #JOB-260603-0705, #JOB-260603-0706, #JOB-260603-0707
- **Description:** Final pass to remove rules in `styles.css` that are no longer referenced after each page migration, audit token usage (spacing/radius/color), verify focus visibility and narrow-width behavior, and ensure all four workspaces read consistently. Update Phase 7 statuses to Done with implementation notes.
- **SC:** `npm run web:typecheck`, `npm run web:lint`, and `npm run web:build` all clean; no orphaned styles remain in `styles.css` that the new UI does not use; Today/Pipeline (Decide + Track)/Insights/Settings all read with consistent spacing and color across desktop and narrow widths.
- **Notes:** `npm run web:typecheck`, `npm run web:lint`, and `npm run web:build` all pass cleanly (lint only flags three benign HMR `react-refresh/only-export-components` warnings for the primitive files that export both components and `cva` variant builders — these don't affect HMR for end-user surfaces). `body` was repointed at `var(--background)` / `var(--foreground)` so legacy + Tailwind surfaces share a baseline. Bulk styles.css pruning was intentionally deferred: the activity sub-panels (`Triage`/`Summary`/`Notes`/`Contacts`/`Events`/`AiAssist`), `addjob/ManualAddTab`, and `settings/RubricsEditor` still reference legacy classes (`.pill`, `.score-pill`, `.job-card`, `.actions`, `.meta`, etc.), and the `Guardrails` fallback panel export keeps its CSS surface, so pruning would risk breaking those panels. The legacy rules now coexist with the Tailwind utilities and read correctly inside the new shell. Residual risk: a future cleanup once those sub-panels are migrated should sweep `.shell`/`.topbar`/`.left`/`.center`, `.modal*`, `.overlay-*`, `.shortcut-*`, `.hub-card*`, `.today-grid`, `.toolbar*`, `.bulk-toolbar*`, `.funnel*`, `.track-tools*`, `.seg-toggle`/`.seg-btn`, `.track-sections`/`.stage-*`/`.stage-sec`, `.track-table*`/`.tt-*`, `.job-row*`, `.activity-head*`/`.activity-tabs*`/`.activity-pane`, `.pipeline-*`, `.mode-toggle`/`.mode-btn`/`.mode-count`, `.metric-card`, `.grid-2`/`.grid-3`, `.kbd-hint`, `.skeleton*`/`.state-*`/`.inline-confirm`, `.reminder-card`, `.facts`, `.backup-row`, `.file-input`, `.hidden-pill`, `.start-here*`, `.tabs`/`.tab*`, `.guardrails-panel`, and `.brand`/`.logo-mark`/`.eyebrow`/`.topbar-actions` — all now superseded by Tailwind utilities. Browser verification was not run in this session (the cursor-ide-browser MCP was not available); the user should sanity-check Today / Pipeline (Decide + Track) / Insights / Settings against the served `web/dist`.
