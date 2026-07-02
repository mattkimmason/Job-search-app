# Job Search Copilot — Product & Design Improvement Guide

A reference document for driving focused improvements across UX, visual design, information architecture, and feature strategy.

---

## 1. What the App Does Well (Preserve This)

Before proposing changes, it's worth naming what's working. These patterns should be protected through any redesign:

- **Keyboard-first navigation** — the `j / k / Enter` hint in the pipeline header is a power-user detail that signals real product thinking. Keep it and extend it.
- **Three-panel layout** — left nav/context, center pipeline list, right detail panel is the right structure for this type of work. It mirrors email clients (Gmail, Superhuman) that users already understand.
- **Score-centric triage** — surfacing an AI score (54, 65, 64…) at the list level lets users make fast decisions without opening each job. This is the core workflow advantage.
- **Guardrails as a first-class concept** — treating market, salary floor, and travel tolerance as explicit settings (not just filters) is a smart product framing. Most job tools don't do this.
- **Status persistence** — showing APPLIED + LIVE together on each row means the user never has to remember what state a job is in.

---

## 2. Visual Design & Aesthetics

### 2.1 The Dark Theme Needs More Intentionality

The current dark background (#1a1a1a range) is a reasonable start but feels closer to "dark mode as afterthought" than a deliberate design choice. Specific issues:

- **Contrast is uneven.** The left sidebar text (Today, Pipeline, Insights) reads too faint at low brightness. These are navigation items — they need to be reliably legible.
- **The pipeline rows blend together.** Each row has minimal visual separation. At 7 rows, this is fine. At 20+, it becomes a scanning problem.
- **The score badges feel inconsistent.** The score pill uses a colored ring (orange for ≤54, green-ish for 60+?) but the color logic isn't immediately legible. Is orange bad? Is it a warning? Users will wonder.
- **Buttons in the right panel (Apply now, Pursue, Skip, Not a fit) are identical in weight.** These are mutually exclusive, high-stakes actions. They should have a visual hierarchy that guides the eye toward the most likely next action.

**Recommendations:**
- Add 1px hairline separators between pipeline rows with a subtle hover state (slight background lift) to make the list more scannable.
- Define a clear score color system: red (<40) → amber (40–59) → green (60+). Make it explicit, not implied.
- Establish a primary action button (Apply now or Pursue, depending on context) with a filled style, and demote the others to outline or ghost. Don't present four equal-weight choices.
- Increase sidebar text opacity or weight for nav items. Consider a left border accent on the active item rather than (or in addition to) the background highlight.

### 2.2 Typography Hierarchy Is Flat

Every text element reads at roughly the same visual weight. The job title in the right panel ("Senior Strategy & Planning Manager") should dominate. The company + location line should clearly be secondary. Right now it's close to the same size.

**Recommendations:**
- Job title in detail panel: 22–24px, weight 500–600
- Company / location: 13px, muted color
- Metadata tags (Remote, Applied AI Product): pill badges with a subtle background
- Score label ("AUTO SCORE – DEFAULT RUBRIC"): this is a label, treat it as 11px all-caps or very muted — it's not content, it's chrome

### 2.3 The Right Panel Has Too Much Unused Space

The detail panel scrolls but the visible area has large vertical gaps — between the job title block and the tab row, and between the tab content and the score section. This makes the panel feel unfinished.

**Recommendations:**
- Tighten vertical spacing throughout the right panel
- Consider making the score + verdict buttons ("Apply now", "Pursue", "Skip", "Not a fit") sticky at the bottom of the panel so they're always accessible while scrolling through notes
- The "Open posting / Verify link / Share brief" actions at the top of the panel could be an icon row rather than three text buttons, freeing vertical space

---

## 3. Information Architecture

### 3.1 The Left Sidebar Is Underutilized

Currently: Today / Pipeline / Insights / Settings — and then Guardrails and Saved Views below. The hierarchy here is muddled. Guardrails and Saved Views are context/configuration, but they're displayed inline in the nav as if they're content sections.

**Recommendations:**
- Treat Guardrails as a persistent settings panel or a collapsible sidebar section, not a nav item at the same level as Pipeline.
- Move Saved Views into the Pipeline view itself (as a tab or a filter preset bar above the list) — that's where users will look for them.
- Give "Today / What to do now" more prominence. If this is an AI-curated task list, it's the highest-value entry point and deserves to be the default landing page, not a quiet link.

### 3.2 Pipeline Status Tags Need a Clear System

Currently each row shows up to three tags: a score badge, a verdict badge (SKIP / PURSUE / APPLIED), and a status badge (LIVE). These are three separate dimensions of information, but they're rendered with similar visual weight and placed adjacently without clear grouping.

Define three distinct visual lanes for these:
1. **AI Score** — a prominent number badge (the AI's assessment, user-agnostic)
2. **Your verdict** — your decision: Skip / Pursue / Applied / Not a fit (user-driven)
3. **Posting status** — Live / Closed / Expired (external fact)

Consider placing these in consistent columns rather than floating them together at the end of each row. This makes the pipeline scannable like a spreadsheet.

### 3.3 The Filter Bar Could Do More Work

Currently there's a text search + Discovery dropdown + Application dropdown + Show Hidden checkbox. This is functional but lightweight for a power tool.

**Consider adding:**
- A score range slider (e.g., "only show 60+")
- A quick-filter pill row (Live only / Not yet applied / Needs triage)
- A sort control (by score, by date added, by company name)

The "6 roles in view (5 closed hidden, 1 not-a-fit hidden)" line is great information — but it's tiny and easy to miss. Consider making this a more interactive element, e.g., "5 closed hidden — show" as a clickable badge.

---

## 4. Workflow & Interaction Design

### 4.1 Triage Flow Should Be Faster

The core loop is: scan list → select job → read → make verdict. Right now, making a verdict requires:
1. Clicking a row
2. Reading the right panel
3. Scrolling to find the action buttons
4. Clicking Apply now / Pursue / Skip / Not a fit

For a tool designed around keyboard shortcuts, the verdict step should be a single keystroke. The hint already says `Enter` for verdict — but the right panel requires a separate click to commit.

**Recommendations:**
- `j/k` to move through list, `Enter` to expand in right panel, then `1/2/3/4` or `a/p/s/n` for Apply / Pursue / Skip / Not a fit
- Show a keyboard shortcut hint overlay on the verdict buttons themselves
- After making a verdict, auto-advance to the next untriaged job — like an email "archive and next" pattern

### 4.2 The "Today / What to do now" View Needs Development

This is currently listed as a nav item but appears to be a minimal or placeholder view. If the product's goal is to be a copilot (not just a list), this view is where that promise lives.

**What this view could contain:**
- "You have 3 jobs to triage" (score + no verdict yet)
- "2 applications have been live for 5+ days — consider following up"
- "Your Guardrail score floor is 60 — 4 jobs in your pipeline don't meet it"
- "You applied to Reddit 8 days ago — no response. Consider reaching out to a contact."

This kind of ambient, proactive intelligence is what separates a "copilot" from a "tracker."

### 4.3 The Score Explanation Is Buried

"Why this score?" appears as a small button next to the score number. For a product whose core value proposition is AI-powered fit scoring, the explanation of *why* a job scores the way it does is critical to building user trust.

**Recommendations:**
- Make the score explanation always visible (collapsed by default but shown inline, not a modal)
- Structure the explanation as a breakdown: e.g., "Skills match: 8/10 · Salary: 9/10 · Location: 6/10 · Seniority: 5/10"
- Let users override individual rubric dimensions (this also builds data for improving the model)

### 4.4 The Notes Tab Is Underspecified

The "SCORE / TRIAGE NOTES" textarea has placeholder text "Why this score? Anything to remember about risks, or angle." This is trying to do two things at once — a score justification (AI output) and user notes (human input). Separate them:

- **AI rationale field**: auto-populated by the model when a score is generated, read-only or editable
- **Your notes field**: free-form, user-written, timestamped

---

## 5. Feature Gaps to Prioritize

### High impact, relatively easy
- **Score breakdown** — show a multi-dimensional breakdown (skills, salary, location, seniority) rather than a single number. Builds trust and makes the score actionable.
- **Auto-advance after verdict** — after clicking Skip / Pursue, move to the next untriaged job automatically.
- **Batch actions** — select multiple jobs with checkboxes (the UI already has checkboxes per row) and bulk-skip or bulk-update status.
- **Keyboard shortcut cheatsheet** — a `?` key shortcut that opens an overlay listing all keyboard shortcuts.

### High impact, more complex
- **Today view with proactive nudges** — surfacing time-sensitive actions (follow up, application went stale, new matching jobs) is the highest-leverage place to add AI intelligence.
- **Contact tracking in context** — the CONTACTS tab exists in the right panel. Build this out so users can log and see their network connections per company, with a reminder to reach out.
- **Application timeline** — within each job, a visual timeline: discovered → applied → X days since → response/no response. Helps users know when to act.
- **Rubric customization** — let users configure what the AI scoring rubric weights. "I care more about culture than comp" should be expressible.

### Nice to have
- **Company-level views** — group jobs by company so users can see "I'm also interviewing at Google for a different role."
- **Export / share** — exporting a summary of applied jobs for status tracking or sharing with a recruiter.
- **Mobile companion** — a stripped-down view for quickly triaging newly added jobs on the go.

---

## 6. Copy & Microcopy

The current copy is functional but has some rough edges:

| Current | Suggested | Reason |
|---|---|---|
| "Work the list" | "Review pipeline" or just "Open pipeline" | "Work the list" is a bit informal for a persistent nav label |
| "Pick a row to work it on the right." | "Select a role to review details →" | Clearer, less jargon-y |
| "AUTO SCORE – DEFAULT RUBRIC" | "AI fit score · default rubric" | Sentence case, less shouting |
| "Why this score?" | "Score breakdown" | More descriptive of what clicking does |
| "No saved views yet. Filter the pipeline then click Save." | "No saved views yet. Filter your list above, then save as a view." | Slightly clearer action path |
| "Verify link" | "Check link" | Simpler verb |
| "Share brief" | This is fine — keep it | It's distinctive and purposeful |

---

## 7. Accessibility & Performance Considerations

- **Color alone shouldn't encode score quality.** The score badges use color (orange vs. green) without a secondary indicator. Add an icon or pattern to make the system accessible for users with color vision differences.
- **The dark background + light text contrast** should be checked against WCAG AA (4.5:1 for body text). Some of the muted secondary text (job location lines, filter labels) may fall short.
- **Tab order in the right panel** should follow a logical flow: title → action buttons → tabs → tab content. Currently unclear whether keyboard users can navigate the verdict buttons without a mouse.
- **Loading states** — when the AI score is being calculated, the score display should show a skeleton/spinner rather than being blank or showing a stale value.

---

## 8. Prioritization Framework

Use this 2×2 to sequence improvements:

**Do first (high impact, low effort):**
- Score breakdown (show dimensions, not just a number)
- Visual hierarchy fix on verdict buttons (one primary, three secondary)
- Auto-advance after verdict
- Keyboard shortcut overlay

**Plan next (high impact, higher effort):**
- Today view with proactive AI nudges
- Rubric customization
- Application timeline per job
- Contact tracking buildout

**Quick wins (low effort, minor impact):**
- Microcopy improvements
- Pipeline row separators + hover states
- Better empty states

**Deprioritize for now:**
- Mobile companion
- Company-level grouping
- Export/share

---

*This guide reflects observations from a single screenshot. Revisit after conducting user sessions — especially to validate whether the triage loop (scan → read → decide) feels fast enough in practice, and whether the AI score is trusted or ignored.*
