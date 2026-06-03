import { EmptyState } from "@/components/feedback/EmptyState";

export default function TransactionsPage() {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Transactions</h1>
      <EmptyState
        heading="No transactions yet"
        body="Your spending and income will show up here."
        actionLabel="Log your first"
        actionHref="/transactions/new"
      />
    </div>
  );
}
