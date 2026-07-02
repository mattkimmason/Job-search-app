import { create } from "zustand";

export type ActivityTab =
  | "summary"
  | "triage"
  | "notes"
  | "contacts"
  | "events"
  | "llm";
// Decide-mode quick filters keep the triage-era semantics; Track-mode adds
// workflow-oriented chips that focus on what needs attention next.
export type QuickFilter =
  | ""
  | "live_only"
  | "unapplied"
  | "needs_triage"
  | "needs_follow_up"
  | "waiting"
  | "interview_scheduled"
  | "no_contact"
  | "stale"
  | "reverify";
// Decide defaults to score-first ordering. Track defaults to action urgency
// so stale waits and due follow-ups surface at the top.
export type SortMode =
  | "score_desc"
  | "date_desc"
  | "company_asc"
  | "needs_action"
  | "oldest_applied"
  | "recently_updated"
  | "upcoming_interview";
export type PipelineMode = "decide" | "track";
export type TrackLayout = "sections" | "table";

interface UiState {
  selectedJobId: string;
  search: string;
  discoveryFilter: string;
  applicationFilter: string;
  showHidden: boolean;
  showClosed: boolean;
  pipelineMode: PipelineMode;
  trackLayout: TrackLayout;
  collapsedStages: Set<string>;
  expandedBreakdowns: Set<string>;
  activityTab: ActivityTab;
  addJobOpen: boolean;
  helpOpen: boolean;
  shortcutOverlayOpen: boolean;
  showStartHere: boolean;
  scoreFloor: number;
  quickFilter: QuickFilter;
  sortMode: SortMode;
  /** Bumped by the triage panel after a verdict commits; pages can subscribe. */
  autoAdvanceToken: number;
  setSelectedJobId: (id: string) => void;
  setSearch: (value: string) => void;
  setDiscoveryFilter: (value: string) => void;
  setApplicationFilter: (value: string) => void;
  setShowHidden: (value: boolean) => void;
  setShowClosed: (value: boolean) => void;
  setPipelineMode: (value: PipelineMode) => void;
  setTrackLayout: (value: TrackLayout) => void;
  toggleStage: (key: string) => void;
  toggleBreakdown: (id: string) => void;
  setActivityTab: (tab: ActivityTab) => void;
  setAddJobOpen: (value: boolean) => void;
  setHelpOpen: (value: boolean) => void;
  setShortcutOverlayOpen: (value: boolean) => void;
  setShowStartHere: (value: boolean) => void;
  setScoreFloor: (value: number) => void;
  setQuickFilter: (value: QuickFilter) => void;
  setSortMode: (value: SortMode) => void;
  requestAutoAdvance: () => void;
  applySavedViewFilter: (filter: {
    search?: string;
    discoveryStatus?: string;
    applicationStatus?: string;
    showHidden?: boolean;
  }) => void;
}

function initialStartHere(): boolean {
  try {
    return localStorage.getItem("js_seen_start_here") !== "1";
  } catch {
    return true;
  }
}

const DECIDE_SORT: SortMode = "score_desc";
const TRACK_SORT: SortMode = "needs_action";
// Decide chips keep the original triage filters; Track chips replace them
// with workflow filters. If the active chip doesn't apply to the new mode
// we reset to "" so the user isn't filtering by an irrelevant signal.
const DECIDE_QUICK_FILTERS: ReadonlySet<QuickFilter> = new Set<QuickFilter>([
  "",
  "live_only",
  "unapplied",
  "needs_triage",
]);
const TRACK_QUICK_FILTERS: ReadonlySet<QuickFilter> = new Set<QuickFilter>([
  "",
  "needs_follow_up",
  "waiting",
  "interview_scheduled",
  "no_contact",
  "stale",
  "reverify",
]);
const DECIDE_SORTS: ReadonlySet<SortMode> = new Set<SortMode>([
  "score_desc",
  "date_desc",
  "company_asc",
]);
const TRACK_SORTS: ReadonlySet<SortMode> = new Set<SortMode>([
  "needs_action",
  "oldest_applied",
  "recently_updated",
  "company_asc",
  "upcoming_interview",
]);

export const useUiStore = create<UiState>((set) => ({
  selectedJobId: "",
  search: "",
  discoveryFilter: "",
  applicationFilter: "",
  showHidden: false,
  showClosed: false,
  pipelineMode: "decide",
  trackLayout: "sections",
  collapsedStages: new Set<string>(["closed"]),
  expandedBreakdowns: new Set<string>(),
  activityTab: "triage",
  addJobOpen: false,
  helpOpen: false,
  shortcutOverlayOpen: false,
  showStartHere: initialStartHere(),
  scoreFloor: 0,
  quickFilter: "",
  sortMode: "score_desc",
  autoAdvanceToken: 0,
  setSelectedJobId: (id) => set({ selectedJobId: id }),
  setSearch: (value) => set({ search: value }),
  setDiscoveryFilter: (value) => set({ discoveryFilter: value }),
  setApplicationFilter: (value) => set({ applicationFilter: value }),
  setShowHidden: (value) => set({ showHidden: value }),
  setShowClosed: (value) => set({ showClosed: value }),
  setPipelineMode: (value) =>
    set((state) => {
      const next: Partial<UiState> = { pipelineMode: value };
      const sortSet = value === "decide" ? DECIDE_SORTS : TRACK_SORTS;
      if (!sortSet.has(state.sortMode)) {
        next.sortMode = value === "decide" ? DECIDE_SORT : TRACK_SORT;
      }
      const chipSet =
        value === "decide" ? DECIDE_QUICK_FILTERS : TRACK_QUICK_FILTERS;
      if (!chipSet.has(state.quickFilter)) {
        next.quickFilter = "";
      }
      return next;
    }),
  setTrackLayout: (value) => set({ trackLayout: value }),
  toggleStage: (key) =>
    set((state) => {
      const next = new Set(state.collapsedStages);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { collapsedStages: next };
    }),
  toggleBreakdown: (id) =>
    set((state) => {
      const next = new Set(state.expandedBreakdowns);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedBreakdowns: next };
    }),
  setActivityTab: (tab) => set({ activityTab: tab }),
  setAddJobOpen: (value) => set({ addJobOpen: value }),
  setHelpOpen: (value) => set({ helpOpen: value }),
  setShortcutOverlayOpen: (value) => set({ shortcutOverlayOpen: value }),
  setShowStartHere: (value) => {
    try {
      if (!value) localStorage.setItem("js_seen_start_here", "1");
    } catch {
      // ignore
    }
    set({ showStartHere: value });
  },
  setScoreFloor: (value) => set({ scoreFloor: Math.max(0, Math.min(100, value)) }),
  setQuickFilter: (value) => set({ quickFilter: value }),
  setSortMode: (value) => set({ sortMode: value }),
  requestAutoAdvance: () =>
    set((state) => ({ autoAdvanceToken: state.autoAdvanceToken + 1 })),
  applySavedViewFilter: (filter) =>
    set({
      search: filter.search || "",
      discoveryFilter: filter.discoveryStatus || "",
      applicationFilter: filter.applicationStatus || "",
      showHidden: Boolean(filter.showHidden),
    }),
}));
