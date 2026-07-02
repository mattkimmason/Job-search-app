export interface Salary {
  min?: number | null;
  max?: number | null;
  label?: string | null;
  currency?: string;
  period?: string;
}

export interface AiAnalysis {
  score?: number;
  tier?: string;
  rationale?: string;
  fitHooks?: string[];
  risks?: string[];
  keywordGaps?: string[];
}

export interface Job {
  id: string;
  source: string;
  sourceUrl?: string;
  roleUrl?: string;
  company: string;
  title: string;
  lane?: string;
  locationType?: string;
  location?: string;
  workplace?: string;
  employmentType?: string;
  salary: Salary | null;
  score: number;
  scoreNotes?: string;
  priorityTier?: string;
  resumeTrack?: string;
  summary?: string;
  keywords?: string[];
  fitHooks?: string[];
  risks?: string[];
  nextAction?: string;
  dueDate?: string;
  discoveryStatus: string;
  applicationStatus: string;
  appliedAt?: string;
  interviewStatus: string;
  stalePosting?: boolean;
  staleDays?: number;
  postingStatus?: "unknown" | "live" | "dead" | string;
  postingCheckedAt?: string;
  needsVerification?: boolean;
  aiScore?: number | null;
  aiAnalysis?: AiAnalysis | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StatusModel {
  discoveryStatus: string[];
  applicationStatus: string[];
  interviewStatus: string[];
}

export interface Strategy {
  preferredMarket?: string;
  minimumBaseSalaryUsd?: number;
  maximumTravelPercent?: number;
  roleFamilies?: string[];
  keywords?: string[];
}

export interface Profile {
  candidate?: {
    displayName?: string;
    workAuthorization?: { requiresSponsorship?: boolean };
  };
  preferences?: {
    locationPreference?: { preferredMarket?: string };
    compensation?: { minimumBaseSalaryUsd?: number };
    travel?: { maximumPercent?: number };
    employmentType?: { allowed?: string[] };
  };
  targetSearch?: {
    roleFamilies?: { name: string }[];
  };
}

export interface Metrics {
  weekly: { applications: number; screens: number; interviews: number };
  followups: { overdue: number };
  conversion: { responseRate: number; interviewRate: number };
  discovery: Record<string, number>;
  application: Record<string, number>;
}

export type ReminderSeverity = "high" | "medium" | "low";

export interface Reminder {
  key: string;
  jobId?: string;
  type: string;
  severity: ReminderSeverity;
  title: string;
  detail: string;
  dueDate: string;
}

export interface SavedView {
  id: string;
  name: string;
  filter: {
    search?: string;
    discoveryStatus?: string;
    applicationStatus?: string;
    showHidden?: boolean;
  };
  updatedAt: string;
}

export interface StrategyPerformance {
  sources: {
    source: string;
    sourced: number;
    applied: number;
    responseRate: number;
    interviewRate: number;
    underperforming?: boolean;
  }[];
  savedViews: {
    name: string;
    matched: number;
    applied: number;
    screens: number;
    screenRate: number;
    underperforming?: boolean;
  }[];
}

export interface ResearchPrompt {
  id: string;
  title: string;
  content: string;
}

export interface JdExtract {
  title?: string;
  company?: string;
  seniority?: string;
  location?: string;
  salaryLabel?: string;
  summary?: string;
  responsibilities?: string[];
  qualifications?: string[];
  keywords?: string[];
  redFlags?: string[];
}

export interface LookupResult {
  company?: string;
  title: string;
  location?: string;
  source?: string;
  fitScore?: number;
  summary?: string;
  url?: string;
}

export interface MarkdownPreviewItem {
  company: string;
  title: string;
  location?: string;
  salaryLabel?: string;
  source?: string;
  roleUrl?: string;
  summary?: string;
  duplicates?: { job: { company: string; title: string } }[];
  selected: boolean;
}

export interface LlmSettings {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  configured?: boolean;
}

// ===== Rubric =====

export type Scorer =
  | { kind: "keyword_count"; terms: string[]; perMatch: number }
  | {
      kind: "keyword_threshold";
      terms: string[];
      tiers: { minHits: number; points: number }[];
    }
  | {
      kind: "location_match";
      primaryTerms: string[];
      primaryPoints: number;
      hybridPoints: number;
      remotePoints: number;
      otherPoints: number;
    }
  | {
      kind: "regex_tier";
      matchers: { pattern: string; flags: string; points: number }[];
      defaultPoints: number;
    }
  | {
      kind: "salary_floor";
      floors: { minUsd: number; points: number }[];
    };

export interface RubricCategory {
  key: string;
  label: string;
  cap: number;
  scorer: Scorer;
}

export interface RubricThresholds {
  applyNow: number;
  selective: number;
}

export interface Rubric {
  id: string;
  name: string;
  lane: string | null;
  thresholds: RubricThresholds;
  categories: RubricCategory[];
}

export interface RubricConfig {
  defaultRubricId: string;
  rubrics: Rubric[];
}
