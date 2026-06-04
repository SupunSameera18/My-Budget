"use client";

import { useState, useTransition, useRef } from "react";
import { createSubcategory } from "@/features/categories/server/actions";
import { OfflineRetryBanner } from "@/components/feedback/OfflineRetryBanner";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCode, type AppError } from "@/lib/errors";

interface CreateSubcategoryFormProps {
  categoryId: string;
}

export function CreateSubcategoryForm({
  categoryId,
}: CreateSubcategoryFormProps) {
  const [isPending, startTransition] = useTransition();
  const [appError, setAppError] = useState<AppError | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isOnline = useOnlineStatus();

  function submitForm(form: HTMLFormElement) {
    setAppError(null);
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await createSubcategory(categoryId, formData);
        if (!result.ok) {
          setAppError(result.error);
        } else {
          form.reset();
        }
      } catch {
        setAppError({
          code: ErrorCode.SubcategoryCreateFailed,
          message:
            "Could not save — please check your connection and try again.",
        });
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitForm(e.currentTarget);
  }

  function handleRetry() {
    if (formRef.current) {
      submitForm(formRef.current);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="flex max-w-sm flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`subcategory-name-${categoryId}`} className="text-xs">
          New subcategory
        </Label>
        <Input
          id={`subcategory-name-${categoryId}`}
          name="name"
          type="text"
          placeholder="e.g. Electricity"
          maxLength={50}
          autoComplete="off"
          disabled={isPending}
        />
        {appError?.field === "name" && (
          <p className="text-xs text-destructive">{appError.message}</p>
        )}
      </div>

      {appError && !appError.field && (
        <p className="text-sm text-destructive">{appError.message}</p>
      )}

      <OfflineRetryBanner onRetry={handleRetry} disabled={isPending} />

      <Button
        type="submit"
        disabled={isPending || !isOnline}
        className="min-h-[44px] w-full"
        variant="outline"
      >
        {isPending ? "Adding…" : "Add subcategory"}
      </Button>
    </form>
  );
}
