import { Shield } from "lucide-react";

import { useProfile, useStrategy } from "../hooks/queries";
import { dollars } from "../lib/format";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GuardrailValues {
  preferredMarket: string;
  salaryFloor: number;
  travelMax: number;
}

function useGuardrailValues(): GuardrailValues {
  const { data: profile } = useProfile();
  const { data: strategy } = useStrategy();
  const prefs = profile?.preferences || {};
  const preferredMarket =
    strategy?.preferredMarket ||
    prefs.locationPreference?.preferredMarket ||
    "Not set";
  const salaryFloor =
    Number.isFinite(strategy?.minimumBaseSalaryUsd) &&
    (strategy?.minimumBaseSalaryUsd ?? 0) > 0
      ? (strategy?.minimumBaseSalaryUsd ?? 0)
      : prefs.compensation?.minimumBaseSalaryUsd || 0;
  const travelMax =
    Number.isFinite(strategy?.maximumTravelPercent) &&
    (strategy?.maximumTravelPercent ?? 0) > 0
      ? (strategy?.maximumTravelPercent ?? 0)
      : prefs.travel?.maximumPercent || 0;
  return { preferredMarket, salaryFloor, travelMax };
}

/**
 * Sidebar-anchored guardrails: small Shield icon with a tooltip showing
 * market / salary floor / travel cap. Replaces the previous inline panel.
 */
export function GuardrailsBadge() {
  const { preferredMarket, salaryFloor, travelMax } = useGuardrailValues();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Guardrails"
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Shield className="size-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs px-3 py-2">
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="font-semibold text-background">Guardrails</div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="opacity-70">Market</span>
            <span className="font-medium">{preferredMarket}</span>
            <span className="opacity-70">Salary floor</span>
            <span className="font-medium">{dollars(salaryFloor)}</span>
            <span className="opacity-70">Travel max</span>
            <span className="font-medium">{travelMax}%</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Legacy panel layout preserved for any consumers still importing Guardrails.
 * The Layout no longer mounts this; kept exported to avoid breaking imports
 * during the migration.
 */
export function Guardrails() {
  const { preferredMarket, salaryFloor, travelMax } = useGuardrailValues();
  return (
    <div className="guardrails" aria-label="Guardrails">
      <div>
        <span>Market</span>
        <strong id="marketMetric">{preferredMarket}</strong>
      </div>
      <div>
        <span>Salary Floor</span>
        <strong id="salaryMetric">{`${dollars(salaryFloor)} floor`}</strong>
      </div>
      <div>
        <span>Travel</span>
        <strong id="travelMetric">{`${travelMax}% max`}</strong>
      </div>
    </div>
  );
}
