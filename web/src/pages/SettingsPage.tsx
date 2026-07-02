import { useEffect, useRef, useState } from "react";
import { Download, Monitor, Moon, Sun, Upload } from "lucide-react";

import {
  useImportSnapshot,
  useLlmSettings,
  useProfile,
  useSaveLlmSettings,
  useSaveStrategy,
  useStrategy,
} from "../hooks/queries";
import { api } from "../lib/api";
import { dollars } from "../lib/format";
import type { Strategy } from "../types";
import { RubricsEditor } from "../components/settings/RubricsEditor";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageShell, SectionHeader } from "@/components/patterns";

type Theme = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "jsing.theme";

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    // ignore
  }
  // Default: whatever the pre-paint script in index.html applied. Reading the
  // class avoids a first-mount theme flip when the user hasn't made a choice
  // (#BUG-260604-0006).
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  let dark: boolean;
  if (theme === "system") {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } else {
    dark = theme === "dark";
  }
  root.classList.toggle("dark", dark);
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  // Only persist + apply after the user explicitly picks something. Mounting
  // Settings must never change the active theme on its own.
  const userChangedRef = useRef(false);

  useEffect(() => {
    if (!userChangedRef.current) return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
    applyTheme(theme);
  }, [theme]);

  // Keep "system" preference responsive to OS changes while the user has it
  // selected, without forcing it when other modes are active.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const onSelect = (next: Theme) => {
    userChangedRef.current = true;
    setTheme(next);
  };

  return (
    <SegmentedControl<Theme>
      ariaLabel="Theme"
      value={theme}
      onChange={onSelect}
      size="sm"
      className="max-w-full"
      options={[
        { id: "light", label: "Light", icon: Sun },
        { id: "dark", label: "Dark", icon: Moon },
        { id: "system", label: "System", icon: Monitor },
      ]}
    />
  );
}

export function SettingsPage() {
  const { data: strategy } = useStrategy();
  const { data: profile } = useProfile();
  const { data: llmSettings } = useLlmSettings();
  const saveStrategy = useSaveStrategy();
  const saveLlmSettings = useSaveLlmSettings();
  const importSnapshot = useImportSnapshot();

  const [market, setMarket] = useState("");
  const [salaryFloor, setSalaryFloor] = useState("");
  const [travel, setTravel] = useState("");
  const [targets, setTargets] = useState("");
  const [keywords, setKeywords] = useState("");
  const [strategySummary, setStrategySummary] = useState("");
  const [llmEndpoint, setLlmEndpoint] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmStatus, setLlmStatus] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!strategy) return;
    setMarket(strategy.preferredMarket || "");
    setSalaryFloor(
      Number.isFinite(strategy.minimumBaseSalaryUsd)
        ? String(strategy.minimumBaseSalaryUsd)
        : "",
    );
    setTravel(
      Number.isFinite(strategy.maximumTravelPercent)
        ? String(strategy.maximumTravelPercent)
        : "",
    );
    setTargets((strategy.roleFamilies || []).join("\n"));
    setKeywords((strategy.keywords || []).join(", "));
    setStrategySummary(
      `Market: ${strategy.preferredMarket || "unset"} · Salary floor: ${dollars(strategy.minimumBaseSalaryUsd)} · Travel: ${strategy.maximumTravelPercent || 0}% · Keywords: ${(strategy.keywords || []).length}`,
    );
  }, [strategy]);

  useEffect(() => {
    if (!llmSettings) return;
    setLlmEndpoint(llmSettings.endpoint || "");
    setLlmModel(llmSettings.model || "openai.gpt-4.1-mini");
  }, [llmSettings]);

  function strategyFromInputs(): Strategy {
    return {
      preferredMarket: market.trim(),
      minimumBaseSalaryUsd: Number(salaryFloor || 0),
      maximumTravelPercent: Number(travel || 0),
      roleFamilies: targets
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      keywords: keywords
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  const prefs = profile?.preferences || {};
  const preferredMarket =
    strategy?.preferredMarket ||
    prefs.locationPreference?.preferredMarket ||
    "Not set";
  const computedSalaryFloor =
    Number.isFinite(strategy?.minimumBaseSalaryUsd) &&
    (strategy?.minimumBaseSalaryUsd ?? 0) > 0
      ? (strategy?.minimumBaseSalaryUsd ?? 0)
      : prefs.compensation?.minimumBaseSalaryUsd || 0;
  const travelMax =
    Number.isFinite(strategy?.maximumTravelPercent) &&
    (strategy?.maximumTravelPercent ?? 0) > 0
      ? (strategy?.maximumTravelPercent ?? 0)
      : prefs.travel?.maximumPercent || 0;

  const roleFamilies = strategy?.roleFamilies?.length
    ? strategy.roleFamilies.map((name) => ({ name }))
    : profile?.targetSearch?.roleFamilies || [];

  async function handleSaveStrategy() {
    const next = strategyFromInputs();
    try {
      const saved = await saveStrategy.mutateAsync(next);
      setStrategySummary(
        `Saved strategy for ${saved.preferredMarket || "any market"} (${(saved.roleFamilies || []).length} target families).`,
      );
    } catch (error) {
      setStrategySummary(
        `Couldn't save strategy: ${error instanceof Error ? error.message : "unknown error"}. Your changes are still in the form.`,
      );
    }
  }

  async function handleSaveLlm() {
    try {
      await saveLlmSettings.mutateAsync({
        endpoint: llmEndpoint.trim(),
        model: llmModel.trim() || "openai.gpt-4.1-mini",
        apiKey: llmKey.trim(),
      });
      setLlmKey("");
      setLlmStatus("LLM settings saved.");
    } catch (error) {
      setLlmStatus(
        `Couldn't save LLM settings: ${error instanceof Error ? error.message : "unknown error"}.`,
      );
    }
  }

  async function handleExport() {
    try {
      const payload = await api("/api/export");
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `job-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupStatus("Snapshot exported.");
    } catch (error) {
      setBackupStatus(
        `Export failed: ${error instanceof Error ? error.message : "unknown error"}.`,
      );
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);
      await importSnapshot.mutateAsync(payload);
      setBackupStatus(`Imported ${file.name}.`);
    } catch (error) {
      setBackupStatus(
        `Import failed: ${error instanceof Error ? error.message : "unknown error"}. Check the JSON file and try again.`,
      );
    } finally {
      event.target.value = "";
    }
  }

  function FieldLabel({
    htmlFor,
    children,
    hint,
  }: {
    htmlFor?: string;
    children: React.ReactNode;
    hint?: string;
  }) {
    return (
      <label
        htmlFor={htmlFor}
        className="flex flex-col gap-1.5 text-sm font-medium text-foreground"
      >
        <span>{children}</span>
        {hint ? (
          <span className="text-xs font-normal text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </label>
    );
  }

  return (
    <PageShell width="4xl">
      <SectionHeader
        title="Settings + Tools"
        description="Strategy, scoring, LLM, theme, and backup."
      />

        <Card>
          <CardHeader>
            <CardTitle>Search strategy</CardTitle>
            <CardDescription>
              Used for guardrails, scoring hints, and the Lookup New Roles
              button.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <FieldLabel htmlFor="market">Preferred market</FieldLabel>
              <FieldLabel htmlFor="salaryFloor">Salary floor (USD)</FieldLabel>
              <FieldLabel htmlFor="travel">Max travel (%)</FieldLabel>
              <Input
                id="market"
                type="text"
                placeholder="NYC metro"
                value={market}
                onChange={(event) => setMarket(event.target.value)}
              />
              <Input
                id="salaryFloor"
                type="number"
                min={0}
                step={1000}
                placeholder="180000"
                value={salaryFloor}
                onChange={(event) => setSalaryFloor(event.target.value)}
              />
              <Input
                id="travel"
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="20"
                value={travel}
                onChange={(event) => setTravel(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="targets">
                Target role families
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (one per line)
                </span>
              </FieldLabel>
              <Textarea
                id="targets"
                rows={4}
                placeholder={"Applied AI Product\nRetail Product Systems"}
                value={targets}
                onChange={(event) => setTargets(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="keywords">
                Search keywords
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (comma separated)
                </span>
              </FieldLabel>
              <Textarea
                id="keywords"
                rows={3}
                placeholder="applied AI, product strategy, merchandising systems"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSaveStrategy}
                disabled={saveStrategy.isPending}
              >
                Save strategy
              </Button>
              <span className="text-xs text-muted-foreground">
                {strategySummary}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scoring rubrics</CardTitle>
            <CardDescription>
              Edit categories, caps, and keyword lists. Caps must sum to 100.
              Use lane-bound rubrics to score Applied AI roles differently from
              Retail Systems, etc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RubricsEditor />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LLM assist (optional)</CardTitle>
            <CardDescription>
              All LLM actions are user-triggered. Key is stored encrypted in
              your local SQLite DB and never sent anywhere unless you click an
              Assist button.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="llmEndpoint">Endpoint URL</FieldLabel>
              <Input
                id="llmEndpoint"
                type="url"
                placeholder="https://genai-sharedservice-americas.pwcinternal.com/v1/chat/completions"
                value={llmEndpoint}
                onChange={(event) => setLlmEndpoint(event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="llmModel">Model</FieldLabel>
                <Input
                  id="llmModel"
                  type="text"
                  placeholder="openai.gpt-4.1-mini"
                  value={llmModel}
                  onChange={(event) => setLlmModel(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="llmKey">API key</FieldLabel>
                <Input
                  id="llmKey"
                  type="password"
                  placeholder="sk-..."
                  value={llmKey}
                  onChange={(event) => setLlmKey(event.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSaveLlm}
                disabled={saveLlmSettings.isPending}
              >
                Save LLM settings
              </Button>
              {llmStatus ? (
                <span className="text-xs text-muted-foreground">
                  {llmStatus}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Choose how the app renders. System follows your OS preference.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backup + restore</CardTitle>
            <CardDescription>
              JSON snapshot of jobs, notes, contacts, events, saved views.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={handleExport}
                className="gap-2"
              >
                <Download className="size-4" />
                Export snapshot
              </Button>
              <Button
                variant="outline"
                onClick={() => importInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="size-4" />
                Import snapshot
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                onChange={handleImport}
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
            {backupStatus ? (
              <p className="text-xs text-muted-foreground">{backupStatus}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guardrails reference</CardTitle>
            <CardDescription>
              Hard guardrails resolved from your strategy and profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Location
                </dt>
                <dd className="font-medium text-foreground">
                  {preferredMarket}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Salary
                </dt>
                <dd className="font-medium text-foreground">
                  {dollars(computedSalaryFloor)} minimum
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Travel
                </dt>
                <dd className="font-medium text-foreground">
                  {travelMax}% max
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Type
                </dt>
                <dd className="font-medium text-foreground">
                  {(prefs.employmentType?.allowed || []).join(", ") || "Not set"}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Sponsorship
                </dt>
                <dd className="font-medium text-foreground">
                  {profile?.candidate?.workAuthorization?.requiresSponsorship
                    ? "Required"
                    : "Not required"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Target families</CardTitle>
            <Badge variant="secondary" className="h-5">
              {roleFamilies.length}
            </Badge>
          </CardHeader>
          <CardContent>
            {roleFamilies.length ? (
              <ul className="flex flex-col gap-2">
                {roleFamilies.map((family: { name: string }) => (
                  <li
                    key={family.name}
                    className="rounded-lg border border-border bg-card/50 px-3 py-2 text-sm font-medium text-foreground"
                  >
                    {family.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No target families yet. Add them under Search strategy.
              </p>
            )}
          </CardContent>
        </Card>
    </PageShell>
  );
}
