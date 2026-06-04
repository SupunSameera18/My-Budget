import { EmptyState } from "@/components/feedback/EmptyState";

export default function BudgetsPage() {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Budgets</h1>
      <EmptyState
        heading="No budgets yet"
        body="Budgets let you set spending limits per category. Coming in a future update."
      />
    </div>
  );
}
