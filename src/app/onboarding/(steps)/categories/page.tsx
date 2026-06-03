import { completeOnboarding } from "@/features/onboarding/server/actions";
import { SubmitButton } from "@/components/ui/submit-button";

export default function CategoriesPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 p-6 pt-12">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Step 3 of 3
        </p>
        <h1 className="text-2xl font-bold text-ink-primary">
          Your categories are ready.
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          We&apos;ve set up a starter set of income and expense categories for
          you. You can add, rename, or archive them anytime in Settings.
        </p>
      </div>

      <div className="rounded-lg bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold text-ink-primary">Income</p>
        <p className="mt-1 text-xs text-ink-secondary">
          Salary, Freelance, and more
        </p>
        <p className="mt-3 text-sm font-semibold text-ink-primary">Expenses</p>
        <p className="mt-1 text-xs text-ink-secondary">
          Housing, Food, Transport, and more
        </p>
      </div>

      <form action={completeOnboarding}>
        <SubmitButton className="min-h-[44px] w-full">
          Looks good — let&apos;s go
        </SubmitButton>
      </form>
    </div>
  );
}
