import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { NameForm } from "./NameForm";

export default async function NamePage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");

  const { supabase, user } = auth;
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 p-6 pt-12">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Step 1 of 4
        </p>
        <h1 className="text-2xl font-bold text-ink-primary">
          What should we call you?
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          We&apos;ll use your name to greet you in the app.
        </p>
      </div>

      <NameForm defaultName={data?.display_name ?? ""} />
    </div>
  );
}
