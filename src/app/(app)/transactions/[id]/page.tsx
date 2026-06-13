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

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">
        Edit Transaction
      </h1>
      <TransactionEditSheet
        {...result.data}
        activityTrail={trail}
        isShared={result.data.transaction.is_shared}
        partnerName={result.data.partnerName}
      />
    </div>
  );
}
