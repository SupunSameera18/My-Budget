"use client";

import { useState, useTransition } from "react";
import {
  getExportData,
  getMonthlySummaryData,
} from "@/features/analytics/server/actions";
import type { Scope } from "@/features/analytics/schema";

interface ExportPdfButtonProps {
  period: { start: string; end: string };
  selectedMonth: string;
  scope?: Scope;
}

export function ExportPdfButton({
  period,
  selectedMonth,
  scope,
}: ExportPdfButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState("");

  const handleClick = () => {
    setStatusMsg(""); // reset so aria-live re-announces even if next msg is identical
    startTransition(async () => {
      try {
        setStatusMsg("Generating PDF…");
        const [rows, summary] = await Promise.all([
          getExportData(period, scope),
          getMonthlySummaryData(period, scope),
        ]);

        if (!rows || !summary) {
          setStatusMsg("PDF export failed");
          return;
        }

        // Dynamic import — only resolves in browser context
        const { pdf } = await import("@react-pdf/renderer");
        const { BudgetReportPdf } = await import("./BudgetReportPdf");

        const blob = await pdf(
          <BudgetReportPdf
            summary={summary}
            rows={rows}
            selectedMonth={selectedMonth}
          />,
        ).toBlob();

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `my-budget-${selectedMonth}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
        setStatusMsg("PDF ready");
      } catch {
        setStatusMsg("PDF export failed");
      }
    });
  };

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {statusMsg}
      </div>
      <button
        onClick={handleClick}
        disabled={isPending}
        aria-disabled={isPending || undefined}
        className="min-h-[44px] rounded-lg border border-hairline bg-card px-4 text-sm text-ink-primary hover:bg-surface-inset disabled:opacity-50"
      >
        {isPending ? "Generating…" : "Export PDF"}
      </button>
    </>
  );
}
