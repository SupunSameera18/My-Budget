import { requireUser } from "@/lib/supabase/require-user";
import { getMacros } from "@/features/macros/server/actions";
import { MacroCard } from "@/features/macros/components/MacroCard";
import { CreateMacroForm } from "@/features/macros/components/CreateMacroForm";
import { redirect } from "next/navigation";

export default async function MacrosPage() {
  const auth = await requireUser();
  if (!auth) redirect("/auth/login");
  const { supabase, user } = auth;

  const [macrosResult, accountsRes, goalsRes, categoriesRes, profileRes] =
    await Promise.all([
      getMacros(),
      supabase
        .from("accounts")
        .select("id, name")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("goals")
        .select("id, name")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("categories")
        .select("id, name, type")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("currency")
        .eq("user_id", user.id)
        .single(),
    ]);

  const accounts = (accountsRes.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const goals = (goalsRes.data ?? []) as Array<{ id: string; name: string }>;
  const categories = (categoriesRes.data ?? []) as Array<{
    id: string;
    name: string;
    type: string;
  }>;
  const currency =
    (profileRes.data as { currency: string } | null)?.currency ?? "USD";

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-xl font-bold text-ink-primary">Macros</h1>

      {macrosResult.ok ? (
        macrosResult.data.length > 0 ? (
          <ul className="mb-8 flex flex-col gap-3" aria-label="Your macros">
            {macrosResult.data.map((m) => (
              <li key={m.id}>
                <MacroCard
                  macro={m}
                  currency={currency}
                  accounts={accounts}
                  goals={goals}
                  categories={categories}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-8 text-sm text-ink-secondary">
            No macros yet. Create your first one below.
          </p>
        )
      ) : (
        <p role="alert" className="mb-8 text-sm text-destructive">
          Failed to load macros.
        </p>
      )}

      <section aria-labelledby="create-macro-heading">
        <h2
          id="create-macro-heading"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          Add macro
        </h2>
        <CreateMacroForm
          accounts={accounts}
          goals={goals}
          categories={categories}
        />
      </section>
    </div>
  );
}
