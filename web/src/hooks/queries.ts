import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
  Job,
  Metrics,
  Profile,
  Reminder,
  ResearchPrompt,
  RubricConfig,
  SavedView,
  StatusModel,
  Strategy,
  StrategyPerformance,
  LlmSettings,
} from "../types";
import { SEED_RUBRIC_CONFIG } from "../lib/scoring";

export const queryKeys = {
  profile: ["profile"] as const,
  statusModel: ["statusModel"] as const,
  strategy: ["strategy"] as const,
  rubrics: ["rubrics"] as const,
  llmSettings: ["llmSettings"] as const,
  metrics: ["metrics"] as const,
  reminders: ["reminders"] as const,
  strategyPerformance: ["strategyPerformance"] as const,
  savedViews: ["savedViews"] as const,
  researchPrompts: ["researchPrompts"] as const,
  jobs: (params: {
    search?: string;
    discoveryStatus?: string;
    applicationStatus?: string;
  }) => ["jobs", params] as const,
  notes: (jobId: string) => ["notes", jobId] as const,
  contacts: (jobId: string) => ["contacts", jobId] as const,
  events: (jobId: string) => ["events", jobId] as const,
};

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => api<Profile>("/api/profile"),
  });
}

export function useStatusModel() {
  return useQuery({
    queryKey: queryKeys.statusModel,
    queryFn: () => api<StatusModel>("/api/status-model"),
  });
}

export function useStrategy() {
  return useQuery({
    queryKey: queryKeys.strategy,
    queryFn: () => api<Strategy>("/api/strategy"),
  });
}

export function useRubrics() {
  return useQuery({
    queryKey: queryKeys.rubrics,
    queryFn: async () => {
      try {
        const cfg = await api<RubricConfig>("/api/rubrics");
        if (!cfg || !Array.isArray(cfg.rubrics) || cfg.rubrics.length === 0) {
          return SEED_RUBRIC_CONFIG;
        }
        return cfg;
      } catch {
        return SEED_RUBRIC_CONFIG;
      }
    },
    initialData: SEED_RUBRIC_CONFIG,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveRubrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RubricConfig) =>
      api<RubricConfig>("/api/rubrics", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.rubrics, data);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useResetRubrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<RubricConfig>("/api/rubrics/reset", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.rubrics, data);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useLlmSettings() {
  return useQuery({
    queryKey: queryKeys.llmSettings,
    queryFn: () => api<LlmSettings>("/api/settings/llm"),
  });
}

export function useMetrics() {
  return useQuery({
    queryKey: queryKeys.metrics,
    queryFn: () => api<Metrics>("/api/metrics/summary?days=7"),
  });
}

export function useReminders() {
  return useQuery({
    queryKey: queryKeys.reminders,
    queryFn: async () => {
      const payload = await api<{ reminders: Reminder[] }>("/api/reminders");
      return payload.reminders || [];
    },
  });
}

export function useStrategyPerformance() {
  return useQuery({
    queryKey: queryKeys.strategyPerformance,
    queryFn: () =>
      api<StrategyPerformance>("/api/metrics/strategy-performance"),
  });
}

export function useSavedViews() {
  return useQuery({
    queryKey: queryKeys.savedViews,
    queryFn: async () => {
      const payload = await api<{ savedViews: SavedView[] }>("/api/saved-views");
      return payload.savedViews || [];
    },
  });
}

export function useResearchPrompts() {
  return useQuery({
    queryKey: queryKeys.researchPrompts,
    queryFn: async () => {
      try {
        const payload =
          await api<{ prompts: ResearchPrompt[] }>("/api/research/prompts");
        return Array.isArray(payload.prompts) ? payload.prompts : [];
      } catch {
        return [];
      }
    },
  });
}

export function useJobs(params: {
  search?: string;
  discoveryStatus?: string;
  applicationStatus?: string;
}) {
  return useQuery({
    queryKey: queryKeys.jobs(params),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params.search) search.set("search", params.search);
      if (params.discoveryStatus)
        search.set("discoveryStatus", params.discoveryStatus);
      if (params.applicationStatus)
        search.set("applicationStatus", params.applicationStatus);
      const payload = await api<{ jobs: Job[] }>(
        `/api/jobs?${search.toString()}`,
      );
      return payload.jobs || [];
    },
    placeholderData: (prev) => prev,
  });
}

export function useNotes(jobId: string) {
  return useQuery({
    queryKey: queryKeys.notes(jobId),
    enabled: Boolean(jobId),
    queryFn: async () => {
      const payload = await api<{ notes: any[] }>(`/api/jobs/${jobId}/notes`);
      return payload.notes || [];
    },
  });
}

export function useContacts(jobId: string) {
  return useQuery({
    queryKey: queryKeys.contacts(jobId),
    enabled: Boolean(jobId),
    queryFn: async () => {
      const payload = await api<{ contacts: any[] }>(
        `/api/jobs/${jobId}/contacts`,
      );
      return payload.contacts || [];
    },
  });
}

export function useEvents(jobId: string) {
  return useQuery({
    queryKey: queryKeys.events(jobId),
    enabled: Boolean(jobId),
    queryFn: async () => {
      const payload = await api<{ events: any[] }>(`/api/jobs/${jobId}/events`);
      return payload.events || [];
    },
  });
}

export function useInvalidateJobs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["jobs"] });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) =>
      api<Job>("/api/jobs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function usePatchJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api<Job>(`/api/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
  });
}

export interface VerifyPostingResult {
  verification: {
    result: "live" | "dead" | "uncertain";
    httpStatus: number | null;
    finalUrl: string;
    note: string;
    checkedAt: string;
  };
  job: Job;
}

export function useVerifyPosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<VerifyPostingResult>(`/api/jobs/${id}/verify`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useAddNote(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { note: string; noteType?: string }) =>
      api(`/api/jobs/${jobId}/notes`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notes(jobId) }),
  });
}

export function useAddContact(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; contactType: string; email: string }) =>
      api(`/api/jobs/${jobId}/contacts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts(jobId) }),
  });
}

export function useAddEvent(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      eventType: string;
      eventDate: string;
      details: string;
    }) =>
      api(`/api/jobs/${jobId}/events`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events(jobId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.metrics });
    },
  });
}

export function useSaveStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Strategy) =>
      api<Strategy>("/api/strategy", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.strategy });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}

export function useSaveLlmSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LlmSettings) =>
      api("/api/settings/llm", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.llmSettings }),
  });
}

export function useSaveSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; filter: any }) =>
      api("/api/saved-views", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.savedViews }),
  });
}

export function useDeleteSavedView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/saved-views/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.savedViews }),
  });
}

export function useReminderAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      action,
    }: {
      key: string;
      action: "snooze" | "complete";
    }) =>
      api(`/api/reminders/${key}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          snoozeDays: action === "snooze" ? 1 : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders });
      queryClient.invalidateQueries({ queryKey: queryKeys.metrics });
    },
  });
}

export function useImportSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) =>
      api("/api/import", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.metrics });
      queryClient.invalidateQueries({ queryKey: queryKeys.savedViews });
    },
  });
}
