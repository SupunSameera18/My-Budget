"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/require-user";
import { ok, err, ErrorCode } from "@/lib/errors";
import type { Result } from "@/lib/errors";
import type { ReminderPreferences } from "@/features/notifications/schema";

export async function getReminderPreferences(): Promise<ReminderPreferences | null> {
  const auth = await requireUser();
  if (!auth) return null;

  try {
    const { data, error } = await auth.supabase
      .from("profiles")
      .select("reminder_enabled, reminder_time, reminder_timezone")
      .eq("user_id", auth.user.id)
      .single();

    if (error || !data) return null;

    return {
      reminder_enabled: data.reminder_enabled,
      reminder_time: data.reminder_time,
      reminder_timezone: data.reminder_timezone,
    };
  } catch {
    return null;
  }
}

const VALID_TIMEZONES = [
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
] as const;

const reminderSchema = z
  .object({
    reminder_enabled: z.boolean(),
    reminder_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    reminder_timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((val) => VALID_TIMEZONES.includes(val as (typeof VALID_TIMEZONES)[number]), {
        message: "Invalid timezone",
      })
      .nullable(),
  })
  .refine(
    (val) =>
      !val.reminder_enabled ||
      (val.reminder_time !== null && val.reminder_timezone !== null),
    {
      message:
        "reminder_time and reminder_timezone are required when reminder is enabled",
    },
  );

export async function saveReminderPreferences(
  prefs: ReminderPreferences,
): Promise<Result<void>> {
  const auth = await requireUser();
  if (!auth) return redirect("/auth/login") as never;

  const parsed = reminderSchema.safeParse(prefs);
  if (!parsed.success) {
    return err(ErrorCode.ReminderSaveFailed, parsed.error.issues[0]?.message);
  }

  const { reminder_enabled, reminder_time, reminder_timezone } = parsed.data;

  const { error } = await auth.supabase
    .from("profiles")
    .update({
      reminder_enabled,
      reminder_time: reminder_enabled ? reminder_time : null,
      reminder_timezone: reminder_enabled ? reminder_timezone : null,
    })
    .eq("user_id", auth.user.id);

  if (error) return err(ErrorCode.ReminderSaveFailed, error.message);
  return ok(undefined);
}
