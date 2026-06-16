"use client";

import { useState, useTransition } from "react";
import type { ReminderPreferences } from "@/features/notifications/schema";
import { saveReminderPreferences } from "@/features/notifications/server/reminder-actions";

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Kolkata",
  "Asia/Colombo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIMEZONE_OPTIONS.includes(tz)) return tz;
  } catch {
    // ignore
  }
  return "UTC";
}

interface ReminderPreferencesFormProps {
  initialPrefs: ReminderPreferences;
}

export function ReminderPreferencesForm({
  initialPrefs,
}: ReminderPreferencesFormProps) {
  const [enabled, setEnabled] = useState(initialPrefs.reminder_enabled);
  const [time, setTime] = useState(initialPrefs.reminder_time ?? "20:00");
  const [timezone, setTimezone] = useState(
    initialPrefs.reminder_timezone ?? detectBrowserTimezone(),
  );
  const [statusMsg, setStatusMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const newEnabled = !enabled;
    const prev = { enabled, time, timezone };
    setEnabled(newEnabled);

    const prefs: ReminderPreferences = {
      reminder_enabled: newEnabled,
      reminder_time: newEnabled ? time : null,
      reminder_timezone: newEnabled ? timezone : null,
    };

    setStatusMsg("");
    startTransition(async () => {
      const result = await saveReminderPreferences(prefs);
      if (result.ok) {
        setStatusMsg("Saved.");
      } else {
        setEnabled(prev.enabled);
        setStatusMsg("Failed to save. Please try again.");
      }
    });
  }

  function handleTimeBlur(e: React.FocusEvent<HTMLInputElement>) {
    const newTime = e.target.value;
    const prevTime = time;
    setTime(newTime);
    if (!enabled) return;
    setStatusMsg("");
    startTransition(async () => {
      const result = await saveReminderPreferences({
        reminder_enabled: true,
        reminder_time: newTime,
        reminder_timezone: timezone,
      });
      if (result.ok) {
        setStatusMsg("Saved.");
      } else {
        setTime(prevTime);
        setStatusMsg("Failed to save. Please try again.");
      }
    });
  }

  function handleTimezoneBlur(e: React.FocusEvent<HTMLSelectElement>) {
    const newTz = e.target.value;
    const prevTz = timezone;
    setTimezone(newTz);
    if (!enabled) return;
    setStatusMsg("");
    startTransition(async () => {
      const result = await saveReminderPreferences({
        reminder_enabled: true,
        reminder_time: time,
        reminder_timezone: newTz,
      });
      if (result.ok) {
        setStatusMsg("Saved.");
      } else {
        setTimezone(prevTz);
        setStatusMsg("Failed to save. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-sm">
      <div aria-live="polite" role="status" className="sr-only">
        {statusMsg}
      </div>

      {/* Toggle row */}
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        <label
          htmlFor="reminder-toggle"
          className="text-sm font-medium text-ink-primary"
        >
          Daily log reminder
        </label>
        <button
          id="reminder-toggle"
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-disabled={isPending ? "true" : undefined}
          onClick={isPending ? undefined : handleToggle}
          className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
            enabled ? "bg-brand-accent-strong" : "bg-ink-secondary/30"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "left-[calc(100%-1.375rem)]" : "left-0.5"
            }`}
          />
          <span className="sr-only">{enabled ? "On" : "Off"}</span>
        </button>
      </div>

      {/* Conditional time + timezone fields */}
      {enabled && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reminder-time"
              className="text-xs font-medium text-ink-secondary"
            >
              Reminder time
            </label>
            <input
              id="reminder-time"
              type="time"
              defaultValue={time}
              onBlur={handleTimeBlur}
              disabled={isPending}
              className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 text-sm text-ink-primary focus:border-brand-accent focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reminder-timezone"
              className="text-xs font-medium text-ink-secondary"
            >
              Timezone
            </label>
            <select
              id="reminder-timezone"
              defaultValue={timezone}
              onBlur={handleTimezoneBlur}
              disabled={isPending}
              className="min-h-[44px] rounded-md border border-hairline bg-surface-base px-3 text-sm text-ink-primary focus:border-brand-accent focus:outline-none disabled:opacity-50"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
