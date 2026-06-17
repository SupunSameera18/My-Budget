"use client";

import { useState, useEffect } from "react";

/** Returns today's date as YYYY-MM-DD (local calendar) and re-fires at midnight. */
export function useTodayDate(): string {
  const getToday = () => new Date().toLocaleDateString("en-CA");
  const [today, setToday] = useState(getToday);

  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
      now.getTime();

    const timer = setTimeout(() => {
      setToday(getToday());
    }, msUntilMidnight + 1000);

    return () => clearTimeout(timer);
  }, [today]);

  return today;
}
