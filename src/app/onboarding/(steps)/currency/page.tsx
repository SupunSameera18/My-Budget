import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { saveCurrencyStep } from "@/features/onboarding/server/actions";
import { SUPPORTED_CURRENCIES } from "@/features/onboarding/schema";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { BackLink } from "../BackLink";

export default async function CurrencyPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  const { supabase, user } = auth;
  const { data } = await supabase
    .from("profiles")
    .select("currency")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 p-6 pt-12">
      <div>
        <BackLink href="/onboarding/name" />
        <p className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Step 2 of 4
        </p>
        <h1 className="text-2xl font-bold text-ink-primary">
          Let&apos;s set up your app.
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Choose the currency you&apos;ll use to track your money.
        </p>
      </div>

      <form action={saveCurrencyStep} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Your currency</Label>
          <select
            id="currency"
            name="currency"
            required
            defaultValue={data?.currency ?? "USD"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {SUPPORTED_CURRENCIES.map(({ code, name }) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </select>
        </div>

        <SubmitButton className="min-h-[44px] w-full">Continue</SubmitButton>
      </form>
    </div>
  );
}
