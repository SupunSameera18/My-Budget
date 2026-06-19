"use client";

import { useState, useTransition } from "react";
import { saveNameStep } from "@/features/onboarding/server/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

export function NameForm({ defaultName = "" }: { defaultName?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // Custom validation replacing the native `required` constraint.
    const name = (formData.get("display_name") as string)?.trim() ?? "";
    if (!name) {
      setError("Enter your name.");
      return;
    }
    if (name.length > 50) {
      setError("Name must be 50 characters or fewer.");
      return;
    }
    setError(null);
    startTransition(async () => {
      await saveNameStep(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">Your name</Label>
        <Input
          id="display_name"
          name="display_name"
          type="text"
          placeholder="e.g. John"
          maxLength={50}
          defaultValue={defaultName}
          autoFocus
          autoComplete="given-name"
          aria-invalid={!!error}
          className="min-h-[44px]"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <SubmitButton className="min-h-[44px] w-full" disabled={isPending}>
        Continue
      </SubmitButton>
    </form>
  );
}
