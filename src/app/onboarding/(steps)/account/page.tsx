import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { AccountForm } from "./AccountForm";

export default async function AccountPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  const { supabase, user } = auth;
  const { data } = await supabase
    .from("profiles")
    .select("currency")
    .eq("user_id", user.id)
    .single();

  const currency = data?.currency ?? "USD";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 p-6 pt-12">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Step 3 of 4
        </p>
        <h1 className="text-2xl font-bold text-ink-primary">
          Create your first account.
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Add the account you&apos;ll track your money in (e.g. your main bank
          account).
        </p>
      </div>

      <AccountForm currency={currency} />
    </div>
  );
}
