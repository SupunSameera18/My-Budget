import { notFound } from "next/navigation";
import {
  getTransaction,
  getActivityTrail,
} from "@/features/transactions/server/actions";
import { TransactionEditSheet } from "@/features/transactions/components/TransactionEditSheet";

export const metadata = { title: "Edit Transaction – My Budget" };

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await getTransaction(id);
  if (!result.ok) {
    notFound();
  }

  const trail = await getActivityTrail(id);

  const isShared = result.data.transaction.is_shared;
  const isSettleLocked =
    isShared &&
    !!result.data.lastSettledAt &&
    new Date(result.data.transaction.created_at) <=
      new Date(result.data.lastSettledAt);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1
        className="mb-6 text-xl font-bold text-ink-primary"
        aria-label={isShared ? "Edit shared transaction" : "Edit transaction"}
      >
        {isShared ? "Edit Shared Transaction" : "Edit Transaction"}
      </h1>
      <TransactionEditSheet
        {...result.data}
        activityTrail={trail}
        isShared={isShared}
        partnerName={result.data.partnerName}
        viewerUserId={result.data.viewerUserId}
        lastSettledAt={result.data.lastSettledAt}
        isSettleLocked={isSettleLocked}
      />
    </div>
  );
}
