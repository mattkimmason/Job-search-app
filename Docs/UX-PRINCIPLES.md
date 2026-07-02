# UX Principles

This app should feel calm, focused, and useful for one person running a job search. Default to restrained, professional UI. Improve consistency before adding visual novelty.

## Source of Truth

- Inspect `web/src/styles.css` before changing UI. Use the existing CSS variables for colors, spacing, radius, borders, shadows, and motion.
- Prefer shared page structures and components in `web/src/components/` and `web/src/pages/`.
- Reuse existing classes for buttons, panels, cards, forms, tables, navigation, skeletons, empty states, and error states.
- Add a new component or shared class when a pattern appears three or more times or when reuse will prevent drift.

## Design Operating Model

1. Identify the existing pattern for the screen or component.
2. Normalize inconsistencies with existing tokens, classes, or components.
3. Improve the whole family of similar UI where practical, not just one isolated instance.
4. Keep one primary action visually dominant per section or flow.
5. Treat loading, empty, error, disabled, hover, and focus states as part of the design.
6. Verify desktop, tablet, and narrow mobile layouts before calling UI work complete.

## Layout and Density

- Use generous spacing between unrelated sections and tighter spacing within related groups.
- Dashboards and insight screens should prioritize comprehension: clear hierarchy, intentional whitespace, and obvious grouping.
- Forms and workflow screens should prioritize task completion: compact controls, clear labels, useful defaults, and minimal scrolling.
- Tables and review queues can be denser, but they must remain scannable, sortable or filterable where relevant, and readable at narrow widths.
- On mobile, reduce decoration, keep the primary action reachable, and avoid hiding essential workflow controls behind ambiguous UI.

## States and Recovery

- Loading states should show progress with skeletons or clear waiting copy. Avoid blank screens.
- Empty states should tell the user what is true now and what to do next.
- Error states should be human and recoverable: say what failed, offer retry or next steps, and avoid raw stack traces.
- Destructive or risky actions need clear confirmation and an escape path.
- Disabled controls should explain why when the reason is not obvious.

## Accessibility Baseline

- Use semantic HTML before custom roles.
- Keep focus states visible and keyboard navigation predictable.
- Provide accessible names for icon-only or ambiguous controls.
- Maintain sufficient contrast for text, borders, and status colors.
- Do not rely on color alone for status or severity.
- Ensure modals and overlays can be dismissed with keyboard controls.

## Final UI Audit

Before finishing UI work, check:

- Font sizes follow the existing type scale.
- Spacing follows `--space-inner`, `--space-group`, `--space-section`, or an existing local pattern.
- Buttons with the same variant have the same height, padding, and radius.
- Colors come from tokens rather than new inline values.
- Similar pages use similar page headers, card structure, and action placement.
- Narrow widths still work without clipped text or unreachable actions.
- Focus states are visible and accessible.
- Any new one-off style has a clear reason, or has been promoted to a shared class/component.
