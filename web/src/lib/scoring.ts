import type {
  Job,
  Rubric,
  RubricCategory,
  RubricConfig,
  Salary,
  Scorer,
} from "../types";
import { safe } from "./format";

/**
 * Score a job against a rubric.
 *
 * Rubrics live in the server `app_settings` table under `rubric_config_json`
 * and are loaded via `useRubrics`. The seed rubric below mirrors the original
 * hardcoded scoring exactly so existing scores stay stable until the user
 * edits the rubric in Settings.
 */

// ===== Seed rubric (mirrors the server seed) =====

export const SEED_RUBRIC: Rubric = {
  id: "default",
  name: "Default rubric",
  lane: null,
  thresholds: { applyNow: 75, selective: 60 },
  categories: [
    {
      key: "location",
      label: "Location",
      cap: 20,
      scorer: {
        kind: "location_match",
        primaryTerms: [
          "nyc",
          "new york",
          "manhattan",
          "brooklyn",
          "queens",
          "bronx",
          "jersey city",
          "hoboken",
        ],
        primaryPoints: 20,
        hybridPoints: 15,
        remotePoints: 10,
        otherPoints: 0,
      },
    },
    {
      key: "domain",
      label: "Domain fit",
      cap: 15,
      scorer: {
        kind: "keyword_count",
        terms: [
          "retail",
          "commerce",
          "merchandising",
          "inventory",
          "allocation",
          "replenishment",
          "workflow",
          "enterprise",
        ],
        perMatch: 5,
      },
    },
    {
      key: "ai",
      label: "AI / systems",
      cap: 15,
      scorer: {
        kind: "keyword_count",
        terms: [
          "ai",
          "genai",
          "automation",
          "transformation",
          "modernization",
          "systems",
          "product",
        ],
        perMatch: 5,
      },
    },
    {
      key: "seniority",
      label: "Seniority",
      cap: 10,
      scorer: {
        kind: "regex_tier",
        matchers: [
          {
            pattern: "(senior|sr\\.?|lead|manager|director|principal)",
            flags: "i",
            points: 10,
          },
          { pattern: "(associate|junior|intern)", flags: "i", points: 0 },
        ],
        defaultPoints: 5,
      },
    },
    {
      key: "keywords",
      label: "Strategic keywords",
      cap: 15,
      scorer: {
        kind: "keyword_count",
        terms: [
          "product strategy",
          "roadmap",
          "cross-functional",
          "stakeholder",
          "requirements",
          "governance",
          "business process",
          "operating model",
          "program leadership",
          "adoption",
          "launch",
        ],
        perMatch: 2,
      },
    },
    {
      key: "bridge",
      label: "Cross-functional bridge",
      cap: 10,
      scorer: {
        kind: "keyword_threshold",
        terms: [
          "cross-functional",
          "stakeholder",
          "business",
          "technical",
          "integration",
        ],
        tiers: [
          { minHits: 1, points: 4 },
          { minHits: 2, points: 10 },
        ],
      },
    },
    {
      key: "leadership",
      label: "Leadership signal",
      cap: 10,
      scorer: {
        kind: "keyword_threshold",
        terms: [
          "lead",
          "owner",
          "ownership",
          "strategy",
          "decision",
          "accountability",
        ],
        tiers: [
          { minHits: 1, points: 4 },
          { minHits: 2, points: 10 },
        ],
      },
    },
    {
      key: "value",
      label: "Compensation value",
      cap: 5,
      scorer: {
        kind: "salary_floor",
        floors: [
          { minUsd: 180000, points: 5 },
          { minUsd: 160000, points: 3 },
          { minUsd: 0, points: 1 },
        ],
      },
    },
  ],
};

export const SEED_RUBRIC_CONFIG: RubricConfig = {
  defaultRubricId: "default",
  rubrics: [SEED_RUBRIC],
};

// ===== Scorer kind options for the editor =====

export const SCORER_KINDS: { kind: Scorer["kind"]; label: string }[] = [
  { kind: "keyword_count", label: "Keyword count (linear)" },
  { kind: "keyword_threshold", label: "Keyword tiers" },
  { kind: "location_match", label: "Location match" },
  { kind: "regex_tier", label: "Regex match tiers" },
  { kind: "salary_floor", label: "Salary floor" },
];

// ===== Score breakdown =====

export interface ScoreBreakdown {
  rubricId: string;
  rubricName: string;
  categories: { key: string; label: string; value: number; cap: number }[];
  total: number;
  tier: PriorityTier;
}

export type PriorityTier = "apply_now" | "selective" | "skip";

export function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function bucketForScore(
  score: number,
  thresholds: { applyNow: number; selective: number } = SEED_RUBRIC.thresholds,
): PriorityTier {
  if (score >= thresholds.applyNow) return "apply_now";
  if (score >= thresholds.selective) return "selective";
  return "skip";
}

/**
 * Visual risk classification for a score.
 *
 * Returns the css class for pill coloring plus a non-color glyph + label so the
 * meaning is reachable for users with color vision differences and screen
 * reader users (the doc calls this out explicitly in section 7).
 */
export interface ScoreRisk {
  className: "good" | "warn" | "bad";
  glyph: "\u25CF" | "\u25B3" | "\u25CB"; // filled / triangle / hollow
  label: "Strong fit" | "Possible fit" | "Low fit";
}

export function scoreRisk(
  score: number,
  thresholds: { applyNow: number; selective: number } = SEED_RUBRIC.thresholds,
): ScoreRisk {
  if (score >= thresholds.applyNow) {
    return { className: "good", glyph: "\u25CF", label: "Strong fit" };
  }
  if (score >= thresholds.selective) {
    return { className: "warn", glyph: "\u25B3", label: "Possible fit" };
  }
  return { className: "bad", glyph: "\u25CB", label: "Low fit" };
}

export function pickRubric(
  config: RubricConfig | null | undefined,
  lane?: string | null,
): Rubric {
  const cfg = config ?? SEED_RUBRIC_CONFIG;
  if (lane) {
    const laneLc = lane.toLowerCase().trim();
    const match = cfg.rubrics.find(
      (r) => r.lane && r.lane.toLowerCase().trim() === laneLc,
    );
    if (match) return match;
  }
  const def = cfg.rubrics.find((r) => r.id === cfg.defaultRubricId);
  return def ?? cfg.rubrics[0] ?? SEED_RUBRIC;
}

type JobLike = Partial<Job> & { salary?: Salary | null };

function countMatches(text: string, terms: string[]): number {
  return terms.reduce(
    (total, term) => (term && text.includes(term) ? total + 1 : total),
    0,
  );
}

function jobText(job: JobLike): string {
  return `${safe(job.title)} ${safe(job.summary)} ${safe(job.lane)} ${safe(job.company)}`.toLowerCase();
}

function locationText(job: JobLike): string {
  return `${safe(job.location)} ${safe(job.locationType)} ${safe(job.workplace)}`.toLowerCase();
}

function scoreCategory(category: RubricCategory, job: JobLike): number {
  const { scorer, cap } = category;
  let raw = 0;
  if (scorer.kind === "keyword_count") {
    const text = jobText(job);
    const hits = countMatches(text, scorer.terms);
    raw = hits * scorer.perMatch;
  } else if (scorer.kind === "keyword_threshold") {
    const text = jobText(job);
    const hits = countMatches(text, scorer.terms);
    // pick the highest tier whose minHits <= hits
    let best = 0;
    for (const tier of scorer.tiers) {
      if (hits >= tier.minHits && tier.points > best) best = tier.points;
    }
    raw = best;
  } else if (scorer.kind === "location_match") {
    const loc = locationText(job);
    if (scorer.primaryTerms.some((term) => term && loc.includes(term))) {
      raw = scorer.primaryPoints;
    } else if (loc.includes("hybrid")) {
      raw = scorer.hybridPoints;
    } else if (loc.includes("remote")) {
      raw = scorer.remotePoints;
    } else {
      raw = scorer.otherPoints;
    }
  } else if (scorer.kind === "regex_tier") {
    const text = jobText(job);
    let hit: { points: number } | null = null;
    for (const matcher of scorer.matchers) {
      try {
        const re = new RegExp(matcher.pattern, matcher.flags || "i");
        if (re.test(text)) {
          hit = matcher;
          break;
        }
      } catch {
        // Skip invalid patterns; never throw from scoring.
      }
    }
    raw = hit ? hit.points : scorer.defaultPoints;
  } else if (scorer.kind === "salary_floor") {
    const salaryMin = Number(job.salary?.min || 0);
    // floors are sorted high-to-low on the server; first match wins.
    const sorted = [...scorer.floors].sort((a, b) => b.minUsd - a.minUsd);
    const hit = sorted.find((floor) => salaryMin >= floor.minUsd);
    raw = hit ? hit.points : 0;
  }
  return Math.max(0, Math.min(cap, Math.round(raw)));
}

export function calculateScoreBreakdown(
  job: JobLike,
  rubric: Rubric = SEED_RUBRIC,
): ScoreBreakdown {
  const categories = rubric.categories.map((cat) => ({
    key: cat.key,
    label: cat.label,
    value: scoreCategory(cat, job),
    cap: cat.cap,
  }));
  const total = normalizeScore(
    categories.reduce((sum, cat) => sum + cat.value, 0),
  );
  return {
    rubricId: rubric.id,
    rubricName: rubric.name,
    categories,
    total,
    tier: bucketForScore(total, rubric.thresholds),
  };
}

export function calculateAutoScore(
  job: JobLike,
  rubric: Rubric = SEED_RUBRIC,
): number {
  return calculateScoreBreakdown(job, rubric).total;
}

// ===== Legacy label/tooltip exports (used by Triage breakdown UI) =====

export const SCORE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  SEED_RUBRIC.categories.map((c) => [c.key, c.label]),
);

export const SCORE_CATEGORY_TOOLTIPS: Record<string, string> = {
  location: "How the role's location matches your preferred market.",
  domain: "Domain keyword matches in the job text.",
  ai: "AI / systems / transformation keyword matches.",
  seniority: "Whether the title signals senior level vs. IC/junior.",
  keywords: "Strategic keyword alignment.",
  bridge: "Cross-functional + technical bridge cues.",
  leadership: "Ownership and accountability cues.",
  value: "Compensation floor signal from the parsed salary minimum.",
};
