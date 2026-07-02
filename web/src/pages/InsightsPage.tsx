import { RefreshCw, TrendingUp } from "lucide-react";

import {
  useMetrics,
  useReminderAction,
  useReminders,
  useStrategyPerformance,
} from "../hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorState,
  SkeletonCards,
  SkeletonRows,
} from "../components/States";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard, PageShell, SectionHeader } from "@/components/patterns";

export function InsightsPage() {
  const queryClient = useQueryClient();
  const metricsQuery = useMetrics();
  const remindersQuery = useReminders();
  const performanceQuery = useStrategyPerformance();
  const metrics = metricsQuery.data;
  const reminders = remindersQuery.data ?? [];
  const strategyPerformance = performanceQuery.data;
  const reminderAction = useReminderAction();
  const metricsLoading = metricsQuery.isLoading && !metricsQuery.data;
  const metricsError = metricsQuery.isError;
  const remindersLoading = remindersQuery.isLoading && !remindersQuery.data;
  const remindersError = remindersQuery.isError;
  const performanceLoading =
    performanceQuery.isLoading && !performanceQuery.data;
  const performanceError = performanceQuery.isError;

  const heroMetric = metrics
    ? {
        label: "Response rate",
        value: `${metrics.conversion.responseRate}%`,
        sub: `${metrics.weekly.applications} applications this week · ${metrics.weekly.screens} screens`,
      }
    : null;

  const supportingMetrics = metrics
    ? [
        { label: "Interview rate", value: `${metrics.conversion.interviewRate}%` },
        { label: "Interviews this week", value: metrics.weekly.interviews },
        { label: "Overdue follow-ups", value: metrics.followups.overdue },
        { label: "Target discoveries", value: metrics.discovery.target || 0 },
        { label: "Applied (total)", value: metrics.application.applied || 0 },
      ]
    : [];

  const sourceRows = strategyPerformance?.sources || [];
  const savedRows = strategyPerformance?.savedViews || [];

  const severityBadge: Record<string, "destructive" | "warning" | "secondary"> =
    {
      high: "destructive",
      medium: "warning",
      low: "secondary",
    };

  return (
    <PageShell>
      <SectionHeader
        title="Insights"
        description="Weekly funnel performance and source effectiveness."
        align="start"
        actions={
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["metrics"] })
            }
            className="gap-1"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        }
      />

        {metricsError ? (
          <ErrorState
            title="We couldn't load this week's numbers."
            error={metricsQuery.error}
            onRetry={() =>
              queryClient.invalidateQueries({ queryKey: ["metrics"] })
            }
          />
        ) : metricsLoading ? (
          <SkeletonCards count={6} />
        ) : metrics ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {heroMetric ? (
              <div className="sm:col-span-2 lg:col-span-2">
                <MetricCard
                  hero
                  label={heroMetric.label}
                  value={heroMetric.value}
                  sub={heroMetric.sub}
                />
              </div>
            ) : null}
            {supportingMetrics.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={String(card.value)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No metrics yet."
            body="Apply to a few roles and metrics will start filling in."
          />
        )}

        <section className="flex flex-col gap-3">
          <SectionHeader
            as="div"
            level="section"
            title="Reminder queue"
            actions={
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["reminders"] })
                }
                className="gap-1"
              >
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
            }
          />
          <div className="flex flex-col gap-3">
            {remindersError ? (
              <ErrorState
                title="Reminders failed to load."
                error={remindersQuery.error}
                onRetry={() =>
                  queryClient.invalidateQueries({ queryKey: ["reminders"] })
                }
              />
            ) : remindersLoading ? (
              <SkeletonRows count={3} />
            ) : reminders.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No reminders due right now.
                </CardContent>
              </Card>
            ) : (
              reminders.map((item) => (
                <Card key={item.key}>
                  <CardHeader className="gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant={severityBadge[item.severity] || "secondary"}
                        className="h-5"
                      >
                        {item.severity}
                      </Badge>
                      <span>{item.type}</span>
                      <span>·</span>
                      <span>Due {item.dueDate}</span>
                    </div>
                    <CardTitle className="text-sm">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {item.detail}
                  </CardContent>
                  <div className="flex items-center gap-2 px-4 pb-3">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        reminderAction.mutate({
                          key: item.key,
                          action: "snooze",
                        })
                      }
                    >
                      Snooze 1 day
                    </Button>
                    <Button
                      size="xs"
                      onClick={() =>
                        reminderAction.mutate({
                          key: item.key,
                          action: "complete",
                        })
                      }
                    >
                      Complete
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            as="div"
            level="section"
            title={
              <span className="flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                Source / channel effectiveness
              </span>
            }
          />
          <div className="flex flex-col gap-3">
            {performanceError ? (
              <ErrorState
                title="Source performance failed to load."
                error={performanceQuery.error}
                onRetry={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["strategyPerformance"],
                  })
                }
              />
            ) : performanceLoading ? (
              <SkeletonRows count={3} />
            ) : sourceRows.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No source data yet. Add and apply to a few roles, then check
                  back.
                </CardContent>
              </Card>
            ) : (
              sourceRows.map((row) => (
                <Card
                  key={row.source}
                  className="flex flex-row items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="font-semibold text-foreground">
                      {row.source}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Sourced: {row.sourced}</span>
                      <span>Applied: {row.applied}</span>
                      <span>Response: {row.responseRate}%</span>
                      <span>Interview: {row.interviewRate}%</span>
                    </div>
                  </div>
                  <Badge
                    variant={row.underperforming ? "destructive" : "success"}
                    className="h-5"
                  >
                    {row.underperforming ? "underperforming" : "healthy"}
                  </Badge>
                </Card>
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            as="div"
            level="section"
            title="Saved search performance"
          />
          <div className="flex flex-col gap-3">
            {performanceLoading ? (
              <SkeletonRows count={2} />
            ) : savedRows.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No saved-view performance yet.
                </CardContent>
              </Card>
            ) : (
              savedRows.map((row) => (
                <Card
                  key={row.name}
                  className="flex flex-row items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="font-semibold text-foreground">
                      {row.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Matched: {row.matched}</span>
                      <span>Applied: {row.applied}</span>
                      <span>Screens: {row.screens}</span>
                      <span>Screen rate: {row.screenRate}%</span>
                    </div>
                  </div>
                  <Badge
                    variant={row.underperforming ? "destructive" : "success"}
                    className="h-5"
                  >
                    {row.underperforming ? "underperforming" : "healthy"}
                  </Badge>
                </Card>
              ))
            )}
          </div>
        </section>
    </PageShell>
  );
}
