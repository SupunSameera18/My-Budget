import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { getChartPreferences } from "@/features/analytics/server/actions";
import { ChartPreferencesForm } from "@/features/analytics/components/ChartPreferencesForm";

export default async function AnalyticsSettingsPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  const prefs = await getChartPreferences();

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-ink-primary">Analytics</h1>
      <p className="mb-4 text-sm text-ink-secondary">
        Choose which charts appear in your Analytics view.
      </p>
      <ChartPreferencesForm initialPrefs={prefs} />
    </div>
  );
}
