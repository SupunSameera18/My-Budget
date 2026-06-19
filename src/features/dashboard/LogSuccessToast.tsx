"use client";

import { useState, useEffect } from "react";

export function LogSuccessToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("saved") === "1") {
      setShow(true);
      // Use native History API so Next.js does not re-render the server component
      // tree (which would remount this component and reset the show state).
      window.history.replaceState(null, "", "/dashboard");
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, [show]);

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
