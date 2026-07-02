import { useEffect, useMemo, useState } from "react";
import type {
  Rubric,
  RubricCategory,
  RubricConfig,
  Scorer,
} from "../../types";
import {
  SCORER_KINDS,
  SEED_RUBRIC,
  calculateScoreBreakdown,
} from "../../lib/scoring";
import {
  useResetRubrics,
  useRubrics,
  useSaveRubrics,
} from "../../hooks/queries";
import { InlineConfirm } from "../States";

/**
 * Settings -> Scoring rubrics.
 *
 * Edits live in a local draft; nothing hits the server until the user saves.
 * Caps must sum to 100 to enable Save (matches the runtime contract — anything
 * over caps is clamped, anything under means the total score can never reach
 * 100).
 */

const SAMPLE_JOB = {
  id: "sample",
  source: "Sample",
  company: "Acme Retail",
  title: "Senior Product Manager, AI Systems",
  location: "New York, NY (Hybrid)",
  locationType: "Hybrid",
  workplace: "Hybrid",
  lane: "Applied AI Product",
  summary:
    "Lead the cross-functional team building AI automation and modernization for retail merchandising. Own product strategy, roadmap, and stakeholder alignment. Drive adoption across enterprise systems and integration with inventory.",
  salary: { min: 195000, max: 240000, label: "$195k - $240k" },
  score: 0,
  discoveryStatus: "new",
  applicationStatus: "not_started",
  interviewStatus: "waiting",
};

function makeNewRubric(idHint: string): Rubric {
  const seed = SEED_RUBRIC;
  return {
    id: `rub-${Date.now().toString(36)}`,
    name: idHint,
    lane: null,
    thresholds: { ...seed.thresholds },
    categories: seed.categories.map((c) => ({
      ...c,
      scorer: { ...c.scorer } as Scorer,
    })),
  };
}

function totalCaps(rubric: Rubric): number {
  return rubric.categories.reduce((sum, cat) => sum + (cat.cap || 0), 0);
}

function defaultScorerForKind(kind: Scorer["kind"]): Scorer {
  switch (kind) {
    case "keyword_count":
      return { kind, terms: [], perMatch: 5 };
    case "keyword_threshold":
      return { kind, terms: [], tiers: [{ minHits: 1, points: 5 }] };
    case "location_match":
      return {
        kind,
        primaryTerms: [],
        primaryPoints: 20,
        hybridPoints: 15,
        remotePoints: 10,
        otherPoints: 0,
      };
    case "regex_tier":
      return { kind, matchers: [], defaultPoints: 0 };
    case "salary_floor":
      return { kind, floors: [{ minUsd: 160000, points: 5 }] };
  }
}

export function RubricsEditor() {
  const rubricsQuery = useRubrics();
  const saveRubrics = useSaveRubrics();
  const resetRubrics = useResetRubrics();

  const [draft, setDraft] = useState<RubricConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [status, setStatus] = useState("");
  const [resetPrompt, setResetPrompt] = useState(false);

  useEffect(() => {
    if (!rubricsQuery.data) return;
    setDraft((prev) => prev ?? JSON.parse(JSON.stringify(rubricsQuery.data)));
    setSelectedId((prev) =>
      prev || rubricsQuery.data.defaultRubricId || rubricsQuery.data.rubrics[0]?.id || "",
    );
  }, [rubricsQuery.data]);

  const selected = useMemo(
    () => draft?.rubrics.find((r) => r.id === selectedId) ?? null,
    [draft, selectedId],
  );

  const caps = selected ? totalCaps(selected) : 0;
  const capsOk = caps === 100;
  const dirty = useMemo(() => {
    if (!draft || !rubricsQuery.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(rubricsQuery.data);
  }, [draft, rubricsQuery.data]);

  function updateDraft(updater: (cfg: RubricConfig) => RubricConfig) {
    setDraft((prev) => (prev ? updater(JSON.parse(JSON.stringify(prev))) : prev));
  }

  function updateSelected(updater: (rubric: Rubric) => Rubric) {
    updateDraft((cfg) => ({
      ...cfg,
      rubrics: cfg.rubrics.map((r) => (r.id === selectedId ? updater(r) : r)),
    }));
  }

  function handleNew() {
    const newR = makeNewRubric("New rubric");
    updateDraft((cfg) => ({ ...cfg, rubrics: [...cfg.rubrics, newR] }));
    setSelectedId(newR.id);
  }

  function handleDuplicate() {
    if (!selected) return;
    const copy: Rubric = JSON.parse(JSON.stringify(selected));
    copy.id = `rub-${Date.now().toString(36)}`;
    copy.name = `${selected.name} (copy)`;
    copy.lane = null;
    updateDraft((cfg) => ({ ...cfg, rubrics: [...cfg.rubrics, copy] }));
    setSelectedId(copy.id);
  }

  function handleDelete() {
    if (!draft || !selected) return;
    if (draft.rubrics.length <= 1) {
      setStatus("Can't delete the only rubric. Use Reset to default instead.");
      return;
    }
    const remaining = draft.rubrics.filter((r) => r.id !== selected.id);
    const nextSelectedId = remaining[0].id;
    const nextDefault =
      draft.defaultRubricId === selected.id
        ? nextSelectedId
        : draft.defaultRubricId;
    setDraft({ ...draft, defaultRubricId: nextDefault, rubrics: remaining });
    setSelectedId(nextSelectedId);
  }

  async function handleSave() {
    if (!draft) return;
    if (!capsOk) {
      setStatus(`Category caps must sum to exactly 100 (current: ${caps}).`);
      return;
    }
    try {
      await saveRubrics.mutateAsync(draft);
      setStatus("Rubric saved. Existing scores will recompute on next view.");
    } catch (error) {
      setStatus(
        `Save failed: ${error instanceof Error ? error.message : "unknown error"}.`,
      );
    }
  }

  async function handleReset() {
    setResetPrompt(false);
    try {
      const fresh = await resetRubrics.mutateAsync();
      setDraft(JSON.parse(JSON.stringify(fresh)));
      setSelectedId(fresh.defaultRubricId);
      setStatus("Reset to the seed rubric.");
    } catch (error) {
      setStatus(
        `Reset failed: ${error instanceof Error ? error.message : "unknown error"}.`,
      );
    }
  }

  if (!draft) {
    return <p className="muted small">Loading rubrics...</p>;
  }

  const previewRubric =
    selected ?? draft.rubrics.find((r) => r.id === draft.defaultRubricId) ?? SEED_RUBRIC;
  const preview = calculateScoreBreakdown(SAMPLE_JOB, previewRubric);

  return (
    <div className="rubric-editor">
      <div className="rubric-editor-toolbar">
        <label className="grow">
          <span>Rubric</span>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {draft.rubrics.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.lane ? ` - lane: ${r.lane}` : ""}
                {r.id === draft.defaultRubricId ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="rubric-editor-toolbar-actions">
          <button type="button" onClick={handleNew}>
            + New
          </button>
          <button type="button" onClick={handleDuplicate} disabled={!selected}>
            Duplicate
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={handleDelete}
            disabled={!selected || draft.rubrics.length <= 1}
          >
            Delete
          </button>
        </div>
      </div>

      {selected ? (
        <>
          <div className="grid-2">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={selected.name}
                onChange={(event) =>
                  updateSelected((r) => ({ ...r, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Lane (optional)</span>
              <input
                type="text"
                placeholder="Leave blank for default"
                value={selected.lane ?? ""}
                onChange={(event) =>
                  updateSelected((r) => ({
                    ...r,
                    lane: event.target.value || null,
                  }))
                }
              />
            </label>
          </div>
          <div className="grid-3">
            <label>
              <span>Apply-now threshold</span>
              <input
                type="number"
                min={0}
                max={100}
                value={selected.thresholds.applyNow}
                onChange={(event) =>
                  updateSelected((r) => ({
                    ...r,
                    thresholds: {
                      ...r.thresholds,
                      applyNow: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </label>
            <label>
              <span>Selective threshold</span>
              <input
                type="number"
                min={0}
                max={100}
                value={selected.thresholds.selective}
                onChange={(event) =>
                  updateSelected((r) => ({
                    ...r,
                    thresholds: {
                      ...r.thresholds,
                      selective: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </label>
            <label>
              <span>Use as default</span>
              <select
                value={draft.defaultRubricId === selected.id ? "yes" : "no"}
                onChange={(event) => {
                  if (event.target.value === "yes") {
                    updateDraft((cfg) => ({
                      ...cfg,
                      defaultRubricId: selected.id,
                    }));
                  }
                }}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </div>

          <CategoriesList
            rubric={selected}
            onChange={(next) => updateSelected(() => next)}
          />

          <div className="rubric-editor-summary">
            <div>
              <strong>Caps total:</strong>{" "}
              <span className={capsOk ? "good" : "warn"}>{caps} / 100</span>
            </div>
            <div>
              <strong>Sample score:</strong> {preview.total} ({preview.tier.replace("_", " ")})
            </div>
          </div>

          <RubricPreview rubric={selected} />

          <div className="actions left">
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={!capsOk || !dirty || saveRubrics.isPending}
              title={!capsOk ? "Caps must sum to 100" : ""}
            >
              {saveRubrics.isPending ? "Saving..." : "Save rubric"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setResetPrompt(true)}
              disabled={resetRubrics.isPending}
            >
              Reset to default
            </button>
          </div>
          {resetPrompt ? (
            <InlineConfirm
              title="Reset rubrics to the seed?"
              body="Your custom rubrics will be removed and scores will recompute against the seed rubric."
              confirmLabel="Reset"
              cancelLabel="Cancel"
              busy={resetRubrics.isPending}
              onConfirm={handleReset}
              onCancel={() => setResetPrompt(false)}
            />
          ) : null}
          {status ? <p className="muted small">{status}</p> : null}
        </>
      ) : null}
    </div>
  );
}

interface CategoriesListProps {
  rubric: Rubric;
  onChange: (next: Rubric) => void;
}

function CategoriesList({ rubric, onChange }: CategoriesListProps) {
  function update(index: number, next: RubricCategory) {
    const cats = rubric.categories.slice();
    cats[index] = next;
    onChange({ ...rubric, categories: cats });
  }
  function remove(index: number) {
    const cats = rubric.categories.filter((_, i) => i !== index);
    onChange({ ...rubric, categories: cats });
  }
  function add() {
    const next: RubricCategory = {
      key: `cat_${Date.now().toString(36)}`,
      label: "New category",
      cap: 10,
      scorer: defaultScorerForKind("keyword_count"),
    };
    onChange({ ...rubric, categories: [...rubric.categories, next] });
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rubric.categories.length) return;
    const cats = rubric.categories.slice();
    const [it] = cats.splice(index, 1);
    cats.splice(target, 0, it);
    onChange({ ...rubric, categories: cats });
  }
  return (
    <div className="rubric-categories">
      {rubric.categories.map((cat, index) => (
        <CategoryRow
          key={cat.key}
          category={cat}
          onChange={(next) => update(index, next)}
          onRemove={() => remove(index)}
          onMoveUp={() => move(index, -1)}
          onMoveDown={() => move(index, +1)}
          canMoveUp={index > 0}
          canMoveDown={index < rubric.categories.length - 1}
        />
      ))}
      <div className="actions left">
        <button type="button" onClick={add}>
          + Add category
        </button>
      </div>
    </div>
  );
}

interface CategoryRowProps {
  category: RubricCategory;
  onChange: (next: RubricCategory) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function CategoryRow({
  category,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: CategoryRowProps) {
  function changeKind(kind: Scorer["kind"]) {
    onChange({ ...category, scorer: defaultScorerForKind(kind) });
  }
  return (
    <details className="rubric-category">
      <summary>
        <span className="rubric-category-summary">
          <strong>{category.label || category.key}</strong>
          <span className="muted small">
            cap {category.cap} · {SCORER_KINDS.find((k) => k.kind === category.scorer.kind)?.label}
          </span>
        </span>
      </summary>
      <div className="rubric-category-body">
        <div className="grid-3">
          <label>
            <span>Label</span>
            <input
              type="text"
              value={category.label}
              onChange={(event) => onChange({ ...category, label: event.target.value })}
            />
          </label>
          <label>
            <span>Cap</span>
            <input
              type="number"
              min={0}
              max={100}
              value={category.cap}
              onChange={(event) =>
                onChange({ ...category, cap: Number(event.target.value) || 0 })
              }
            />
          </label>
          <label>
            <span>Scorer</span>
            <select
              value={category.scorer.kind}
              onChange={(event) => changeKind(event.target.value as Scorer["kind"])}
            >
              {SCORER_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ScorerForm
          scorer={category.scorer}
          onChange={(next) => onChange({ ...category, scorer: next })}
        />
        <div className="actions left">
          <button
            type="button"
            className="ghost-button small"
            onClick={onMoveUp}
            disabled={!canMoveUp}
          >
            Move up
          </button>
          <button
            type="button"
            className="ghost-button small"
            onClick={onMoveDown}
            disabled={!canMoveDown}
          >
            Move down
          </button>
          <button type="button" className="ghost-button small" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </details>
  );
}

interface ScorerFormProps {
  scorer: Scorer;
  onChange: (next: Scorer) => void;
}

function ScorerForm({ scorer, onChange }: ScorerFormProps) {
  if (scorer.kind === "keyword_count") {
    return (
      <div className="grid-2">
        <label>
          <span>Terms (comma separated)</span>
          <textarea
            rows={2}
            value={scorer.terms.join(", ")}
            onChange={(event) =>
              onChange({
                ...scorer,
                terms: event.target.value
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label>
          <span>Points per match</span>
          <input
            type="number"
            min={0}
            value={scorer.perMatch}
            onChange={(event) =>
              onChange({ ...scorer, perMatch: Number(event.target.value) || 0 })
            }
          />
        </label>
      </div>
    );
  }
  if (scorer.kind === "keyword_threshold") {
    return (
      <>
        <label>
          <span>Terms (comma separated)</span>
          <textarea
            rows={2}
            value={scorer.terms.join(", ")}
            onChange={(event) =>
              onChange({
                ...scorer,
                terms: event.target.value
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <TierEditor
          tiers={scorer.tiers}
          onChange={(tiers) => onChange({ ...scorer, tiers })}
        />
      </>
    );
  }
  if (scorer.kind === "location_match") {
    return (
      <>
        <label>
          <span>Primary terms (comma separated)</span>
          <textarea
            rows={2}
            value={scorer.primaryTerms.join(", ")}
            onChange={(event) =>
              onChange({
                ...scorer,
                primaryTerms: event.target.value
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <div className="grid-4">
          <label>
            <span>Primary points</span>
            <input
              type="number"
              min={0}
              value={scorer.primaryPoints}
              onChange={(event) =>
                onChange({
                  ...scorer,
                  primaryPoints: Number(event.target.value) || 0,
                })
              }
            />
          </label>
          <label>
            <span>Hybrid points</span>
            <input
              type="number"
              min={0}
              value={scorer.hybridPoints}
              onChange={(event) =>
                onChange({
                  ...scorer,
                  hybridPoints: Number(event.target.value) || 0,
                })
              }
            />
          </label>
          <label>
            <span>Remote points</span>
            <input
              type="number"
              min={0}
              value={scorer.remotePoints}
              onChange={(event) =>
                onChange({
                  ...scorer,
                  remotePoints: Number(event.target.value) || 0,
                })
              }
            />
          </label>
          <label>
            <span>Other points</span>
            <input
              type="number"
              min={0}
              value={scorer.otherPoints}
              onChange={(event) =>
                onChange({
                  ...scorer,
                  otherPoints: Number(event.target.value) || 0,
                })
              }
            />
          </label>
        </div>
      </>
    );
  }
  if (scorer.kind === "regex_tier") {
    return (
      <RegexMatcherEditor
        matchers={scorer.matchers}
        defaultPoints={scorer.defaultPoints}
        onChange={(matchers, defaultPoints) =>
          onChange({ ...scorer, matchers, defaultPoints })
        }
      />
    );
  }
  if (scorer.kind === "salary_floor") {
    return (
      <FloorsEditor
        floors={scorer.floors}
        onChange={(floors) => onChange({ ...scorer, floors })}
      />
    );
  }
  return null;
}

interface TierEditorProps {
  tiers: { minHits: number; points: number }[];
  onChange: (next: { minHits: number; points: number }[]) => void;
}

function TierEditor({ tiers, onChange }: TierEditorProps) {
  function update(index: number, key: "minHits" | "points", value: number) {
    const next = tiers.slice();
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  }
  function add() {
    onChange([...tiers, { minHits: tiers.length + 1, points: 5 }]);
  }
  function remove(index: number) {
    onChange(tiers.filter((_, i) => i !== index));
  }
  return (
    <div className="rubric-tier-list">
      {tiers.map((tier, index) => (
        <div className="rubric-tier-row" key={index}>
          <label>
            <span>Min hits</span>
            <input
              type="number"
              min={0}
              value={tier.minHits}
              onChange={(event) =>
                update(index, "minHits", Number(event.target.value) || 0)
              }
            />
          </label>
          <label>
            <span>Points</span>
            <input
              type="number"
              min={0}
              value={tier.points}
              onChange={(event) =>
                update(index, "points", Number(event.target.value) || 0)
              }
            />
          </label>
          <button type="button" className="ghost-button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}
      <div className="actions left">
        <button type="button" onClick={add}>
          + Add tier
        </button>
      </div>
    </div>
  );
}

interface RegexMatcherEditorProps {
  matchers: { pattern: string; flags: string; points: number }[];
  defaultPoints: number;
  onChange: (
    matchers: { pattern: string; flags: string; points: number }[],
    defaultPoints: number,
  ) => void;
}

function RegexMatcherEditor({
  matchers,
  defaultPoints,
  onChange,
}: RegexMatcherEditorProps) {
  function update(
    index: number,
    key: "pattern" | "flags" | "points",
    value: string | number,
  ) {
    const next = matchers.slice();
    next[index] = { ...next[index], [key]: value as never };
    onChange(next, defaultPoints);
  }
  function add() {
    onChange(
      [...matchers, { pattern: "", flags: "i", points: 5 }],
      defaultPoints,
    );
  }
  function remove(index: number) {
    onChange(
      matchers.filter((_, i) => i !== index),
      defaultPoints,
    );
  }
  return (
    <div className="rubric-tier-list">
      {matchers.map((m, index) => (
        <div className="rubric-matcher-row" key={index}>
          <label className="grow">
            <span>Pattern</span>
            <input
              type="text"
              value={m.pattern}
              onChange={(event) => update(index, "pattern", event.target.value)}
            />
          </label>
          <label>
            <span>Flags</span>
            <input
              type="text"
              value={m.flags}
              onChange={(event) => update(index, "flags", event.target.value)}
            />
          </label>
          <label>
            <span>Points</span>
            <input
              type="number"
              min={0}
              value={m.points}
              onChange={(event) =>
                update(index, "points", Number(event.target.value) || 0)
              }
            />
          </label>
          <button type="button" className="ghost-button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}
      <div className="grid-2">
        <label>
          <span>Default points (no match)</span>
          <input
            type="number"
            min={0}
            value={defaultPoints}
            onChange={(event) =>
              onChange(matchers, Number(event.target.value) || 0)
            }
          />
        </label>
        <div className="actions left" style={{ alignSelf: "end" }}>
          <button type="button" onClick={add}>
            + Add matcher
          </button>
        </div>
      </div>
    </div>
  );
}

interface FloorsEditorProps {
  floors: { minUsd: number; points: number }[];
  onChange: (next: { minUsd: number; points: number }[]) => void;
}

function FloorsEditor({ floors, onChange }: FloorsEditorProps) {
  function update(index: number, key: "minUsd" | "points", value: number) {
    const next = floors.slice();
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  }
  function add() {
    onChange([...floors, { minUsd: 0, points: 1 }]);
  }
  function remove(index: number) {
    onChange(floors.filter((_, i) => i !== index));
  }
  return (
    <div className="rubric-tier-list">
      {floors.map((floor, index) => (
        <div className="rubric-tier-row" key={index}>
          <label>
            <span>Min USD</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={floor.minUsd}
              onChange={(event) =>
                update(index, "minUsd", Number(event.target.value) || 0)
              }
            />
          </label>
          <label>
            <span>Points</span>
            <input
              type="number"
              min={0}
              value={floor.points}
              onChange={(event) =>
                update(index, "points", Number(event.target.value) || 0)
              }
            />
          </label>
          <button type="button" className="ghost-button" onClick={() => remove(index)}>
            Remove
          </button>
        </div>
      ))}
      <div className="actions left">
        <button type="button" onClick={add}>
          + Add floor
        </button>
      </div>
    </div>
  );
}

interface RubricPreviewProps {
  rubric: Rubric;
}

function RubricPreview({ rubric }: RubricPreviewProps) {
  const breakdown = calculateScoreBreakdown(SAMPLE_JOB, rubric);
  return (
    <details className="rubric-preview">
      <summary>
        Live preview against sample role -{" "}
        <strong>{breakdown.total}</strong> /{" "}
        100 ({breakdown.tier.replace("_", " ")})
      </summary>
      <p className="muted small">
        Sample: <em>{SAMPLE_JOB.title}</em> at {SAMPLE_JOB.company} - {SAMPLE_JOB.location} -{" "}
        {SAMPLE_JOB.salary.label}
      </p>
      <div className="score-breakdown">
        <div className="score-breakdown-row head">
          <div>Category</div>
          <div className="col-num">Score</div>
          <div className="col-num">Cap</div>
          <div className="col-contrib">Contribution</div>
        </div>
        {breakdown.categories.map((cat) => (
          <div className="score-breakdown-row" key={cat.key}>
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
    </details>
  );
}
