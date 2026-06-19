import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Subcategory } from "@/features/categories/schema";

vi.mock("@/features/categories/server/actions", () => ({
  updateSubcategory: vi.fn(),
  archiveSubcategory: vi.fn(),
  unarchiveSubcategory: vi.fn(),
  deleteSubcategory: vi.fn(),
}));

import {
  updateSubcategory,
  archiveSubcategory,
  unarchiveSubcategory,
  deleteSubcategory,
} from "@/features/categories/server/actions";
import { SubcategoryRow } from "./SubcategoryRow";

const mockSubcategory: Subcategory = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  user_id: "u1",
  category_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  name: "Electricity",
  archived_at: null,
  created_at: "2026-06-05T00:00:00Z",
  updated_at: "2026-06-05T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  (archiveSubcategory as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (unarchiveSubcategory as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (deleteSubcategory as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: undefined,
  });
  (updateSubcategory as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: mockSubcategory,
  });
});

describe("SubcategoryRow — active subcategory (isArchived=false)", () => {
  it("shows subcategory name", () => {
    render(
      <SubcategoryRow
        subcategory={mockSubcategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    expect(screen.getByText("Electricity")).toBeInTheDocument();
  });

  it("shows Edit and Archive buttons; no Delete button", () => {
    render(
      <SubcategoryRow
        subcategory={mockSubcategory}
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

  it("clicking Edit shows inline name field with current value", async () => {
    render(
      <SubcategoryRow
        subcategory={mockSubcategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    const nameInput = screen.getByRole("textbox");
    expect(nameInput).toBeInTheDocument();
    expect((nameInput as HTMLInputElement).defaultValue).toBe("Electricity");
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("clicking Cancel from edit returns to view mode without calling updateSubcategory", async () => {
    render(
      <SubcategoryRow
        subcategory={mockSubcategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByText("Electricity")).toBeInTheDocument();
    expect(updateSubcategory).not.toHaveBeenCalled();
  });

  it("clicking Archive calls archiveSubcategory with the subcategory id", async () => {
    render(
      <SubcategoryRow
        subcategory={mockSubcategory}
        hasHistory={false}
        isArchived={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /archive/i }));
    await waitFor(() => {
      expect(archiveSubcategory).toHaveBeenCalledWith(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      );
    });
  });
});

describe("SubcategoryRow — archived subcategory (isArchived=true)", () => {
  const archivedSubcategory: Subcategory = {
    ...mockSubcategory,
    archived_at: "2026-06-05T00:00:00Z",
  };

  it("shows Delete button when hasHistory=false", () => {
    render(
      <SubcategoryRow
        subcategory={archivedSubcategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("shows Delete button when hasHistory=true but clicking explains it is blocked", async () => {
    render(
      <SubcategoryRow
        subcategory={archivedSubcategory}
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
    expect(
      screen.queryByText(/delete permanently\? this cannot be undone/i),
    ).not.toBeInTheDocument();
    expect(deleteSubcategory).not.toHaveBeenCalled();
  });

  it("clicking Delete shows confirmation UI before calling deleteSubcategory", async () => {
    render(
      <SubcategoryRow
        subcategory={archivedSubcategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(
      screen.getByText(/delete permanently\? this cannot be undone/i),
    ).toBeInTheDocument();
    expect(deleteSubcategory).not.toHaveBeenCalled();
  });

  it("confirming delete calls deleteSubcategory with the subcategory id", async () => {
    render(
      <SubcategoryRow
        subcategory={archivedSubcategory}
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
      expect(deleteSubcategory).toHaveBeenCalledWith(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      );
    });
  });

  it("clicking Unarchive calls unarchiveSubcategory with the subcategory id", async () => {
    render(
      <SubcategoryRow
        subcategory={archivedSubcategory}
        hasHistory={false}
        isArchived={true}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /unarchive/i }));
    await waitFor(() => {
      expect(unarchiveSubcategory).toHaveBeenCalledWith(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      );
    });
  });
});
