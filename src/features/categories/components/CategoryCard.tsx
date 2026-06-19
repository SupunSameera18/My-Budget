"use client";

import { useState, useTransition, useRef } from "react";
import {
  CATEGORY_TYPE_LABELS,
  type Category,
} from "@/features/categories/schema";
import {
  updateCategory,
  archiveCategory,
  unarchiveCategory,
  deleteCategory,
} from "@/features/categories/server/actions";

interface CategoryCardProps {
  category: Category;
  hasHistory: boolean;
  isArchived: boolean;
}

export function CategoryCard({
  category,
  hasHistory,
  isArchived,
}: CategoryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateCategory(category.id, formData);
      if (!result.ok) {
        setError(result.error.message);
      } else {
        setIsEditing(false);
      }
    });
  }

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveCategory(category.id);
      if (!result.ok) {
        setError(result.error.message);
      }
    });
  }

  function handleUnarchive() {
    setError(null);
    startTransition(async () => {
      const result = await unarchiveCategory(category.id);
      if (!result.ok) {
        setError(result.error.message);
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCategory(category.id);
      if (!result.ok) {
        setError(result.error.message);
        setShowDeleteConfirm(false);
      }
    });
  }

  if (isEditing) {
    return (
      <div className="rounded-lg bg-card px-4 py-3 shadow-sm">
        <form
          ref={formRef}
          onSubmit={handleUpdate}
          noValidate
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`name-${category.id}`}
              className="text-xs font-medium text-ink-secondary"
            >
              Category name
            </label>
            <input
              id={`name-${category.id}`}
              name="name"
              type="text"
              defaultValue={category.name}
              maxLength={50}
              required
              autoComplete="off"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              aria-disabled={isPending}
              className="min-h-[44px] flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={isPending}
              aria-disabled={isPending}
              onClick={() => {
                setIsEditing(false);
                setError(null);
              }}
              className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-semibold text-ink-primary hover:bg-surface-inset disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (showDeleteConfirm) {
    return (
      <div className="rounded-lg bg-card px-4 py-3 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-ink-primary">
          {category.name}
        </p>
        <p className="mb-3 text-sm text-ink-secondary">
          Delete permanently? This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mb-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            aria-disabled={isPending}
            onClick={handleDelete}
            className="min-h-[44px] flex-1 rounded-md bg-destructive px-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            disabled={isPending}
            aria-disabled={isPending}
            onClick={() => {
              setShowDeleteConfirm(false);
              setError(null);
            }}
            className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-semibold text-ink-primary hover:bg-surface-inset disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-primary">
            {category.name}
          </p>
          <p className="text-xs text-ink-secondary">
            {CATEGORY_TYPE_LABELS[category.type]}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {!isArchived && (
          <>
            <button
              type="button"
              disabled={isPending}
              aria-disabled={isPending}
              onClick={() => {
                setIsEditing(true);
                setError(null);
              }}
              className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-medium text-ink-primary hover:bg-surface-inset disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={isPending}
              aria-disabled={isPending}
              onClick={handleArchive}
              className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-medium text-ink-secondary hover:bg-surface-inset disabled:opacity-50"
            >
              {isPending ? "Archiving…" : "Archive"}
            </button>
          </>
        )}

        {isArchived && (
          <>
            <button
              type="button"
              disabled={isPending}
              aria-disabled={isPending}
              onClick={handleUnarchive}
              className="min-h-[44px] flex-1 rounded-md border border-input px-3 text-sm font-medium text-ink-primary hover:bg-surface-inset disabled:opacity-50"
            >
              {isPending ? "Restoring…" : "Unarchive"}
            </button>
            <button
              type="button"
              disabled={isPending}
              aria-disabled={isPending}
              onClick={() => {
                setError(null);
                if (hasHistory) {
                  setError(
                    "This category has transactions, so it can't be deleted. Keep it archived instead.",
                  );
                } else {
                  setShowDeleteConfirm(true);
                }
              }}
              className="min-h-[44px] flex-1 rounded-md border border-destructive px-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
