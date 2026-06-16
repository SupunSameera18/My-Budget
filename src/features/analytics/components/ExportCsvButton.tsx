"use client";

import { useState, useTransition } from "react";
import { getExportData } from "@/features/analytics/server/actions";
import {
  generateCsvString,
  triggerCsvDownload,
} from "@/features/analytics/csv";
import type { Scope } from "@/features/analytics/schema";

interface ExportCsvButtonProps {
  period: { start: string; end: string };
  currency: string;
  selectedMonth: string;
  scope?: Scope;
}

export function ExportCsvButton({
  period,
  currency,
  selectedMonth,
  scope,
}: ExportCsvButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState("");

  const handleClick = () => {
    setStatusMsg(""); // reset so aria-live re-announces even if next msg is identical
    startTransition(async () => {
      setStatusMsg("Exporting…");
      const rows = await getExportData(period, scope);
      if (!rows) {
        setStatusMsg("Export failed");
        return;
      }
      const csv = generateCsvString(rows, currency);
      triggerCsvDownload(csv, `my-budget-${selectedMonth}.csv`);
      setStatusMsg("Export complete");
    });
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        aria-disabled={isPending || undefined}
        className="min-h-[44px] rounded-lg border border-hairline bg-card px-4 text-sm text-ink-primary hover:bg-surface-inset"
      >
        {isPending ? "Exporting…" : "Export CSV"}
      </button>
      <div role="status" aria-live="polite" className="sr-only">
        {statusMsg}
      </div>
    </>
  );
}
