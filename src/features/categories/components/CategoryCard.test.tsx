import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Category } from "@/features/categories/schema";

vi.mock("@/features/categories/server/actions", () => ({
  updateCategory: vi.fn(),
  archiveCategory: vi.fn(),
  unarchiveCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

import {
  updateCategory,
  archiveCategory,
  unarchiveCategory,
  deleteCategory,
} from "@/features/categories/server/actions";
import { CategoryCard } from "./CategoryCard";

const mockCategory: Category = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  user_id: "u1",
  name: "Groceries",
  type: "expense",
  archived_at: null,
  created_at: "2026-06-04T00:00:00Z",
  updated_at: "2026-06-04T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  (archiveCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (unarchiveCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (deleteCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (updateCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: mockCategory,
  });
});

describe("CategoryCard — active category (isArchived=false)", () => {
  it("shows category name and type label", () => {
    render(
      <CategoryCard
        category={mockCategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
  });

  it("shows Edit and Archive buttons; no Delete button", () => {
    render(
      <CategoryCard
        category={mockCategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /archive/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking Edit shows inline name field with current value; no type field (immutable)", async () => {
    render(
      <CategoryCard
        category={mockCategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    const nameInput = screen.getByRole("textbox");
    expect(nameInput).toBeInTheDocument();
    expect((nameInput as HTMLInputElement).defaultValue).toBe("Groceries");
    // No type selector — type is immutable
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("clicking Cancel from edit returns to view mode without calling updateCategory", async () => {
    render(
      <CategoryCard
        category={mockCategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(updateCategory).not.toHaveBeenCalled();
  });

  it("clicking Archive calls archiveCategory with the category id", async () => {
    render(
      <CategoryCard
        category={mockCategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /archive/i }));
    await waitFor(() => {
      expect(archiveCategory).toHaveBeenCalledWith(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
    });
  });
});

describe("CategoryCard — archived category (isArchived=true)", () => {
  const archivedCategory: Category = {
    ...mockCategory,
    archived_at: "2026-06-04T00:00:00Z",
  };

  it("shows Unarchive button; no Archive button", () => {
    render(
      <CategoryCard
        category={archivedCategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    expect(
      screen.getByRole("button", { name: /unarchive/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^archive$/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Delete button when hasHistory=false", () => {
    render(
      <CategoryCard
        category={archivedCategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("shows Delete button when hasHistory=true but clicking explains it is blocked", async () => {
    render(
      <CategoryCard
        category={archivedCategory}
        hasHistory={true}
        isArchived={true}
      />,
    );
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    expect(deleteBtn).toBeInTheDocument();
    await userEvent.click(deleteBtn);
    expect(
      screen.getByText(/has transactions, so it can't be deleted/i),
    ).toBeInTheDocument();
    // No confirmation UI and no server call when blocked
    expect(
      screen.queryByText(/delete permanently\? this cannot be undone/i),
    ).not.toBeInTheDocument();
    expect(deleteCategory).not.toHaveBeenCalled();
  });

  it("clicking Delete shows confirmation UI before calling deleteCategory", async () => {
    render(
      <CategoryCard
        category={archivedCategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(
      screen.getByText(/delete permanently\? this cannot be undone/i),
    ).toBeInTheDocument();
    expect(deleteCategory).not.toHaveBeenCalled();
  });

  it("confirming delete calls deleteCategory with the category id", async () => {
    render(
      <CategoryCard
        category={archivedCategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(
      screen.getByText(/delete permanently\? this cannot be undone/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => {
      expect(deleteCategory).toHaveBeenCalledWith(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
    });
  });

  it("cancelling delete confirmation returns to view mode", async () => {
    render(
      <CategoryCard
        category={archivedCategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByText(/delete permanently\? this cannot be undone/i),
    ).not.toBeInTheDocument();
    expect(deleteCategory).not.toHaveBeenCalled();
  });

  it("clicking Unarchive calls unarchiveCategory with the category id", async () => {
    render(
      <CategoryCard
        category={archivedCategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unarchive/i }));
    await waitFor(() => {
      expect(unarchiveCategory).toHaveBeenCalledWith(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
    });
  });
});
