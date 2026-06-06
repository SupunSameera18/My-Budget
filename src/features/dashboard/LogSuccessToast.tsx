"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export function LogSuccessToast() {
  const params = useSearchParams();
  const router = useRouter();
  const [show, setShow] = useState(params.get("saved") === "1");

  useEffect(() => {
    if (show) {
      router.replace("/dashboard", { scroll: false });
      const t = setTimeout(() => setShow(false), 3000);
      return () => clearTimeout(t);
    }
  }, [show, router]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="rounded-lg border border-hairline bg-surface-base px-4 py-2 text-sm text-ink-primary"
    >
      Logged. Nice.
    </div>
  );
}
