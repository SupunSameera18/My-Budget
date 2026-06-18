import { saveNameStep } from "@/features/onboarding/server/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

export default function NamePage() {
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

      <form action={saveNameStep} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="display_name">Your name</Label>
          <Input
            id="display_name"
            name="display_name"
            type="text"
            placeholder="e.g. John"
            maxLength={50}
            required
            autoFocus
            autoComplete="given-name"
            className="min-h-[44px]"
          />
        </div>

        <SubmitButton className="min-h-[44px] w-full">Continue</SubmitButton>
      </form>
    </div>
  );
}
