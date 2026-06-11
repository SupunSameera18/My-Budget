"use client";

import { useState, useTransition } from "react";
import {
  CHART_TYPES,
  isChartEnabled,
  type ChartPreferences,
  type ChartTypeKey,
} from "@/features/analytics/schema";
import { saveChartPreferences } from "@/features/analytics/server/actions";

interface ChartPreferencesFormProps {
  initialPrefs: ChartPreferences;
}

export function ChartPreferencesForm({
  initialPrefs,
}: ChartPreferencesFormProps) {
  const [prefs, setPrefs] = useState<ChartPreferences>(initialPrefs);
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState("");

  const handleToggle = (key: ChartTypeKey) => {
    const prevPrefs = prefs;
    const newPrefs: ChartPreferences = {
      ...prefs,
      [key]: !isChartEnabled(prefs, key),
    };

    setPrefs(newPrefs);
    setStatusMsg(""); // reset before save so consecutive saves re-announce

    startTransition(async () => {
      const result = await saveChartPreferences(newPrefs);
      if (result.ok) {
        setStatusMsg("Chart preferences saved");
      } else {
        setPrefs(prevPrefs); // revert on error
        setStatusMsg("Failed to save preferences");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="status" aria-live="polite" className="sr-only">
        {statusMsg}
      </div>
      {CHART_TYPES.map((chart) => (
        <label
          key={chart.key}
          className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg border border-hairline bg-card px-4"
        >
          <span className="text-sm text-ink-primary">{chart.label}</span>
          <input
            type="checkbox"
            checked={isChartEnabled(prefs, chart.key)}
            onChange={() => handleToggle(chart.key)}
            disabled={isPending}
            className="h-4 w-4 accent-[#4FA6A6]"
          />
        </label>
      ))}
    </div>
  );
}
