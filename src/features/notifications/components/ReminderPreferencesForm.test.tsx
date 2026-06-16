import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/features/notifications/server/reminder-actions", () => ({
  saveReminderPreferences: vi.fn(),
}));

import { ReminderPreferencesForm } from "./ReminderPreferencesForm";
import { saveReminderPreferences } from "@/features/notifications/server/reminder-actions";
import type { ReminderPreferences } from "@/features/notifications/schema";

const DISABLED_PREFS: ReminderPreferences = {
  reminder_enabled: false,
  reminder_time: null,
  reminder_timezone: null,
};

const ENABLED_PREFS: ReminderPreferences = {
  reminder_enabled: true,
  reminder_time: "20:30",
  reminder_timezone: "Asia/Colombo",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(saveReminderPreferences).mockResolvedValue({
    ok: true,
    data: undefined,
  });
});

describe("ReminderPreferencesForm", () => {
  it("renders toggle off when reminder_enabled=false", () => {
    render(<ReminderPreferencesForm initialPrefs={DISABLED_PREFS} />);
    const toggle = screen.getByRole("switch", { name: /daily log reminder/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("does not show time/timezone fields when reminder is disabled", () => {
    render(<ReminderPreferencesForm initialPrefs={DISABLED_PREFS} />);
    expect(screen.queryByLabelText(/reminder time/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/timezone/i)).not.toBeInTheDocument();
  });

  it("shows time and timezone fields when reminder is enabled", () => {
    render(<ReminderPreferencesForm initialPrefs={ENABLED_PREFS} />);
    expect(screen.getByLabelText(/reminder time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument();
  });

  it("toggling on reveals time and timezone fields and calls saveReminderPreferences", async () => {
    render(<ReminderPreferencesForm initialPrefs={DISABLED_PREFS} />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByLabelText(/reminder time/i)).toBeInTheDocument();
      expect(vi.mocked(saveReminderPreferences)).toHaveBeenCalledOnce();
      expect(vi.mocked(saveReminderPreferences)).toHaveBeenCalledWith(
        expect.objectContaining({ reminder_enabled: true }),
      );
    });
  });

  it("toggling off hides time and timezone fields and clears them in save payload", async () => {
    render(<ReminderPreferencesForm initialPrefs={ENABLED_PREFS} />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByLabelText(/reminder time/i)).not.toBeInTheDocument();
      expect(vi.mocked(saveReminderPreferences)).toHaveBeenCalledWith(
        expect.objectContaining({
          reminder_enabled: false,
          reminder_time: null,
          reminder_timezone: null,
        }),
      );
    });
  });

  it("announces 'Saved.' in ARIA live region on success", async () => {
    render(<ReminderPreferencesForm initialPrefs={DISABLED_PREFS} />);
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    });
  });

  it("shows error message in live region when save fails", async () => {
    vi.mocked(saveReminderPreferences).mockResolvedValue({
      ok: false,
      error: { code: "REMINDER_SAVE_FAILED" as never, message: "db error" },
    });

    render(<ReminderPreferencesForm initialPrefs={DISABLED_PREFS} />);
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Failed to save. Please try again.",
      );
    });
  });

  it("ARIA live region is in DOM before any interaction", () => {
    render(<ReminderPreferencesForm initialPrefs={DISABLED_PREFS} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("toggle has aria-disabled=true while save is in-flight", async () => {
    vi.mocked(saveReminderPreferences).mockImplementation(
      () => new Promise(() => {}),
    );
    render(<ReminderPreferencesForm initialPrefs={DISABLED_PREFS} />);
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      const toggle = screen.getByRole("switch");
      expect(toggle).toHaveAttribute("aria-disabled", "true");
    });
  });

  it("blurring time input triggers save with updated time", async () => {
    render(<ReminderPreferencesForm initialPrefs={ENABLED_PREFS} />);
    vi.mocked(saveReminderPreferences).mockClear();

    const timeInput = screen.getByLabelText(/reminder time/i);
    fireEvent.change(timeInput, { target: { value: "08:00" } });
    fireEvent.blur(timeInput);

    await waitFor(() => {
      expect(vi.mocked(saveReminderPreferences)).toHaveBeenCalledWith(
        expect.objectContaining({
          reminder_time: "08:00",
          reminder_enabled: true,
        }),
      );
    });
  });

  it("blurring timezone select triggers save with updated timezone", async () => {
    render(<ReminderPreferencesForm initialPrefs={ENABLED_PREFS} />);
    vi.mocked(saveReminderPreferences).mockClear();

    const tzSelect = screen.getByLabelText(/timezone/i);
    fireEvent.change(tzSelect, { target: { value: "Europe/London" } });
    fireEvent.blur(tzSelect);

    await waitFor(() => {
      expect(vi.mocked(saveReminderPreferences)).toHaveBeenCalledWith(
        expect.objectContaining({
          reminder_timezone: "Europe/London",
          reminder_enabled: true,
        }),
      );
    });
  });
});
