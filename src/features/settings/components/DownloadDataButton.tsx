"use client";

import { useState, useTransition } from "react";
import { getAllUserData } from "@/features/settings/server/actions";

export function DownloadDataButton() {
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState("");

  const handleClick = () => {
    setStatusMsg("Preparing your data…");
    startTransition(async () => {
      const result = await getAllUserData();
      if (!result.ok) {
        setStatusMsg("Export failed");
        return;
      }
      let json: string;
      try {
        json = JSON.stringify(result.data, null, 2);
      } catch {
        setStatusMsg("Export failed");
        return;
      }
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-budget-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setStatusMsg("Download started");
    });
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isPending}
        aria-disabled={isPending}
        className="min-h-[44px] rounded-lg border border-hairline bg-card px-4 text-sm text-ink-primary hover:bg-surface-inset"
      >
        {isPending ? "Preparing…" : "Download my data (JSON)"}
      </button>
      <div role="status" aria-live="polite" className="sr-only">
        {statusMsg}
      </div>
    </>
  );
}
