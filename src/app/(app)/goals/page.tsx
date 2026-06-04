import { EmptyState } from "@/components/feedback/EmptyState";

export default function GoalsPage() {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Goals</h1>
      <EmptyState
        heading="No goals yet"
        body="Savings goals are coming in a future update."
      />
    </div>
  );
}
