# JSing Frontend Design

This is the design source of truth for the JSing frontend. It is written for the app owner and for AI agents making UI changes. Read it before any non-trivial frontend work, alongside [Docs/UX-PRINCIPLES.md](Docs/UX-PRINCIPLES.md), [web/src/styles.css](web/src/styles.css), and the affected page/components.

The first section (Design System Contract) is normative: use these tokens, primitives, sizes, and rules exactly. The later sections describe product intent and workspace behavior so changes preserve the existing experience.

JSing is a local-first job-search workspace for one person. The UI should feel calm, focused, and operational. It is not a CRM, ATS, or social automation tool.

---

## Design System Contract

### Stack and Source Files

- React 18 + TypeScript + Vite. Frontend code lives in [web/src/](web/src/).
- Styling: Tailwind CSS v4 via `@tailwindcss/vite`, on top of an `oklch` token system declared in [web/src/styles.css](web/src/styles.css) using `@theme inline`.
- Class composition: `cn()` from [web/src/lib/cn.ts](web/src/lib/cn.ts) (clsx + tailwind-merge).
- Path alias: import shared code with `@/...` (resolves to `web/src/`).
- Icons: `lucide-react` only. Reuse the existing icon vocabulary before introducing a new icon for the same concept.

### Canonical Primitives

Always reach for the shadcn-style primitives in [web/src/components/ui/](web/src/components/ui/) before writing custom markup:

`Button`, `Input`, `Textarea`, `Badge`, `Card` (+ `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` / `CardAction`), `Tabs` (`default` and `line` variants), `Tooltip`, `Dialog`, `Select`, `Separator`, `Progress`, `ScrollArea`.

Always reuse the shared state components from [web/src/components/States.tsx](web/src/components/States.tsx) for non-success states: `EmptyState`, `ErrorState`, `SkeletonRows`, `SkeletonCards`, `SkeletonLines`, `InlineConfirm`.

Always reuse the shared business components for matching concepts: `JobRow`, `ActivityPanel`, `PipelineToolbar`, `AddJobModal`, `Layout`, `TopBar`, `TabsNav`, and the settings editors.

If a higher-level pattern is missing, extract it into [web/src/components/patterns/](web/src/components/patterns/) (page shell, section header, metric card, compact pill, etc.) instead of inventing one-off markup in a page.

### Tokens

Use semantic Tailwind classes that map to tokens. Do not hardcode hex values in React UI.

| Concern | Token classes |
| --- | --- |
| Page background | `bg-background` / `text-foreground` |
| Cards and panels | `bg-card` / `text-card-foreground` / `border-border` |
| Primary action | `bg-primary` / `text-primary-foreground` / `ring-ring` |
| Secondary surface | `bg-secondary` / `text-secondary-foreground` |
| Muted text | `text-muted-foreground` |
| Subtle surface | `bg-muted` / `bg-accent` |
| Status: success | `bg-success` / `text-success` / `bg-success/15` |
| Status: warning | `bg-warning` / `text-warning-foreground` / `bg-warning/15` |
| Status: destructive | `bg-destructive` / `text-destructive` / `bg-destructive/10` |
| Sidebar shell | `bg-sidebar` / `border-sidebar-border` |

If a needed semantic role is missing, add or refine a token in [web/src/styles.css](web/src/styles.css). Do not scatter one-off color values across components.

Theme: dark is the default. The `.dark` palette is assigned to `:root`, and the light palette is exposed under `html:not(.dark)`. The Settings Appearance toggle persists to `localStorage` as `jsing.theme` and is applied pre-paint by an inline script in [web/index.html](web/index.html). Verify both themes after touching token-mapped surfaces.

### Layout

- App shell is a persistent `w-16` left icon rail plus an `h-14` top header. Do not introduce alternate shells.
- Page content containers:
  - `max-w-6xl` for workspace pages (Today, Pipeline, Insights).
  - `max-w-4xl` for settings/forms.
- Page padding rhythm: `px-6 py-6`, gap stacks of `gap-3` / `gap-4` / `gap-6`. Do not mix arbitrary spacings within a section without a reason.
- Pipeline is master-detail at `lg`+ via `lg:grid-cols-[5fr_4fr]`, single column below `lg`.
- Use `ScrollArea` (or a Radix-backed scroll container) inside pages so the shell stays fixed.

### Typography

- Page title: `text-2xl font-semibold text-foreground`.
- Section title: `text-lg font-semibold text-foreground`.
- Card title: `font-heading text-base font-semibold leading-snug` (the default for `CardTitle`).
- Body row label: `text-sm font-semibold` (titles inside dense rows).
- Metadata / sub line: `text-xs text-muted-foreground`.
- Numeric scores, metrics, dates: add `tabular-nums`.
- Do not introduce new type scales without promoting them into shared patterns.

### Buttons

Use the [`Button`](web/src/components/ui/button.tsx) primitive. Sizes are normative:

| Use | Variant + size |
| --- | --- |
| Primary page action (e.g. Add job, Save) | `variant="default"` `size="sm"` or `size="default"` |
| Secondary page action (Refresh, Cancel) | `variant="outline"` or `variant="ghost"` `size="sm"` |
| Destructive action | `variant="destructive"` `size="sm"` |
| Inline icon action in toolbars/headers | `variant="ghost"` `size="icon-sm"` (always with `aria-label` and `Tooltip`) |
| Compact pill action (Snooze 1 day / Complete / quick verdict) | `size="xs"` |

Compact pill standard: the `xs` button (`h-6 px-2 text-xs`, `size-3` icons) is the canonical pill across the app. Apply it to Pipeline action pills, filter pills, saved-view pills, row/detail quick actions, and reminder actions. Reserve larger sizes for true primary CTAs.

### Badges and Status Pills

Use the [`Badge`](web/src/components/ui/badge.tsx) primitive (`h-5 rounded-full px-2 text-xs font-medium`) for read-only status:

| Meaning | Variant |
| --- | --- |
| Generic label | `default` |
| Neutral metadata | `secondary` |
| Outlined emphasis | `outline` |
| Quiet/inactive | `ghost` |
| Positive status (Live, success) | `success` |
| Attention status (Re-verify, warning) | `warning` |
| Failure status (Closed, destructive) | `destructive` |

Never rely on color alone for status. Pair color with a label, glyph, or icon. Score and risk pills must include a glyph plus accessible label (current `scoreRisk()` pattern in [web/src/lib/scoring.ts](web/src/lib/scoring.ts)).

### Filters

- Default to compact dropdown controls (`Select` from `@/components/ui/select`, `h-8`).
- Keep only the highest-value filters visible. Group everything else behind one compact "More filters" disclosure.
- Do not mix sliders, chips, checkboxes, and disclosures for the same filtering job unless there is a clear user benefit.
- Pipeline filter changes must explicitly audit vertical toolbar footprint and visual consistency before merging.

### Cards

- Use [`Card`](web/src/components/ui/card.tsx) with its slot components. Do not re-implement `rounded-xl border bg-card`-style markup ad hoc.
- Standard internal padding is `px-4` (header/content) and `py-4` (card). Use `CardFooter` for the muted footer row when needed.
- Card title uses `CardTitle`. Card descriptions use `CardDescription`. Trailing actions use `CardAction`.

### States

- Loading: use a skeleton from `States.tsx`. Avoid blank screens for any page-level fetch.
- Empty: use `EmptyState` with a clear "what is true now / what to do next" message and a primary action when actionable.
- Error: use `ErrorState` with retry (`onRetry`) whenever the underlying query is retryable. Never render raw stack traces in UI copy.
- Destructive or bulk action: use `InlineConfirm` with explicit Confirm/Cancel.
- Save feedback: prefer inline save state for forms, toasts for one-shot mutations, and React Query invalidation for cross-surface refresh.

### Accessibility

- Semantic HTML before custom roles.
- Visible focus: `focus-visible:ring-2 focus-visible:ring-ring/40` (or `ring-ring/50` to match `Button`).
- Every icon-only control needs an `aria-label` and, when ambiguous, a `Tooltip`.
- Use `role="alert"` / `aria-live` for dynamic announcements that matter (errors, confirmations).
- Modals must dismiss with Escape. The `Layout` already wires this for `AddJobModal`, `HelpModal`, and `ShortcutOverlay`.

### Anti-Patterns

Do not:

- Hardcode hex values, raw `rgb()`, or arbitrary inline styles in React UI.
- Introduce a new Button, Card, Badge, Tabs, or filter visual variant when an existing one already covers the use case.
- Mix the legacy class-based CSS in `styles.css` (`.pill`, `.score-pill`, `.activity-pane`, `.tt-*`, etc.) with new Tailwind code. When you touch a legacy surface, migrate it.
- Add new `--space-*` / `--text-*` legacy custom properties to new Tailwind code. They exist only for unmigrated surfaces.
- Build a new visual language for a single page. Normalize the family of pages instead.
- Rely on color alone for score, status, or severity.
- Run AI features automatically. AI is always user-triggered and previewable.

---

## Product Intent

### Design Goal

Help one user run a high-signal job search from a private local app:

- Capture roles quickly before details are lost.
- Decide which roles deserve effort using rubric-backed scoring and fit context.
- Track applications, outreach, follow-ups, interviews, notes, contacts, and outcomes.
- Review funnel/source performance often enough to adjust strategy.
- Keep all data and AI actions explicit, local-first, and user-controlled.

### Non-Goals

- Multi-user collaboration, permissions, or shared cloud sync.
- Autonomous job searching or background AI decisions.
- Storing third-party account credentials.
- Replacing the local SQLite/API data model with external services.
- Visual novelty that makes the app less consistent or harder to scan.

### Information Architecture

Four top-level workspaces:

| Workspace | Route | Job |
| --- | --- | --- |
| Today | `/today` | See what needs attention now. |
| Pipeline | `/pipeline` | Decide what to pursue and track active applications. |
| Insights | `/insights` | Review funnel health, reminders, and source performance. |
| Settings | `/settings` | Configure strategy, rubrics, LLM, theme, backups. |

Pipeline is the primary work surface. Today routes the user into Pipeline when an attention item needs action.

---

## Workspace Behavior

### Today

Attention hub, not a full dashboard. Dated header, optional Start Here card, and a small grid of attention cards (Outreach due, Follow-ups, Awaiting triage, Below score floor, Postings to re-verify, Due this week). The highest-priority non-empty card becomes the hero. Clicking a job item deep-links to Pipeline and selects the job. Keep the alert budget small; empty card copy should be reassuring and useful.

### Pipeline

Decide vs Track mode toggle. Mode-aware toolbar, filters, saved views, and presets. Dense list rows on the left; sticky-contained Activity panel on the right. Activity tabs are context-aware: Decide shows Triage; Track defaults to Summary and hides Triage. Rejected/closed roles stay recoverable but should not crowd active Track work by default.

Decide rows emphasize role identity, score, verdict, status, liveness, and concise fit context. Decisions are Apply now / Pursue / Skip / Not a fit; definitive verdicts may auto-advance to the next untriaged role. Keep keyboard review fast (`j`/`k`, arrows, `g g`, `G`, `Enter`, `1`-`4`).

Track rows emphasize company/role, pipeline stage, applied date and days waiting, next action and due state, contact/follow-up gaps, and exceptions (Closed, Re-verify). Score is secondary in Track; keep it in the detail panel rather than dominating rows.

### Insights

KPI-first review space. Hero response-rate metric, supporting KPI cards, reminder queue with snooze/complete actions, source/channel and saved-view performance cards. Keep chart complexity low; plain-language metric labels.

### Settings

Card sections for Search strategy, Scoring rubrics, LLM assist, Appearance theme, Backup + restore, Guardrails reference, and Target families. Explicit save actions and status copy. No accidental writes while navigating. Secrets must never be displayed after save. Strategy and rubric changes can affect scoring, so live preview and clear save status matter.

---

## Responsive Requirements

- Desktop: Pipeline uses master-detail; Today/Insights use responsive card grids; Settings uses readable card columns.
- Tablet/narrow: Pipeline collapses to one column. Controls wrap without clipping. Primary actions remain reachable. Dense row text should intentionally truncate or wrap; accidental clipping is a bug.
- Mobile: reduce decoration. Keep action hierarchy obvious. Avoid hiding essential workflow controls behind ambiguous icon-only affordances.

---

## AI UX Principles

- Never run AI automatically in the background.
- Show unconfigured-state guidance when LLM settings are missing.
- Preview generated output before applying it.
- Keep Apply explicit and reversible where practical.
- Make generated content editable before save.
- Clearly separate AI rationale from user notes.
- Do not persist prompt examples, placeholders, secrets, or hidden internal context into user-facing notes.

---

## Current Design Debt

Treat as active risks when changing the frontend:

- The Phase 7 oklch palette needs smoother dark/light ramps across status, accent, muted, card, and background tones (`#BUG-260604-0005`).
- Settings navigation can flip the app into an unintended white mode; theme handling needs hardening (`#BUG-260604-0006`).
- Pipeline remains the weakest visual surface after the re-skin (`#BUG-260604-0007`).
- Pipeline pill/button sizing is inconsistent (`#BUG-260604-0008`).
- Pipeline Decide rows can cut off triage information (`#BUG-260604-0009`).
- Pipeline detail should default to a richer Summary view (`#BUG-260604-0010`).
- Pipeline filters are too numerous and visually inconsistent (`#BUG-260604-0011`).
- Left navigation icons need centering polish (`#BUG-260604-0012`).
- Legacy class-based CSS still exists for several activity, intake, rubric, and toast surfaces.

---

## Agent Checklist for Frontend Changes

Before editing:

- Read this file, [Docs/UX-PRINCIPLES.md](Docs/UX-PRINCIPLES.md), [web/src/styles.css](web/src/styles.css), the affected page/components, and nearby patterns.
- Check [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md) for any matching feature or bug item.
- Identify whether the change affects Today, Pipeline, Insights, Settings, Add job, shared primitives, shared patterns, or legacy CSS surfaces.

During design:

- Preserve the four-workspace IA.
- Use existing primitives, tokens, helper components, and patterns. Promote a new pattern to [web/src/components/patterns/](web/src/components/patterns/) before duplicating one in a page.
- Keep local-first behavior and explicit AI actions.
- Normalize inconsistent families of UI rather than making one surface special.
- Treat loading, empty, error, disabled, hover, focus, and narrow-width states as part of the work.

Before finishing:

- Run `npm run web:typecheck`, `npm run web:lint`, and `npm run web:build` when the change is substantive.
- Browser-check the affected flow when practical.
- Toggle dark/light when changing tokens or themed surfaces.
- Check Pipeline at desktop and narrow widths for layout, clipping, and master-detail collapse.
- Note skipped validation and residual risk in the response.
