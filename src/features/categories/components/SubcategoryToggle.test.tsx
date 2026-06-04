import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/features/categories/server/actions", () => ({
  toggleSubcategories: vi.fn(),
}));

import { toggleSubcategories } from "@/features/categories/server/actions";
import { SubcategoryToggle } from "./SubcategoryToggle";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("SubcategoryToggle", () => {
  it("shows 'Off' when enabled=false", () => {
    render(<SubcategoryToggle enabled={false} />);
    expect(screen.getByRole("button")).toHaveTextContent("Off");
  });

  it("shows 'On' when enabled=true", () => {
    render(<SubcategoryToggle enabled={true} />);
    expect(screen.getByRole("button")).toHaveTextContent("On");
  });

  it("button is disabled while pending", async () => {
    let resolve: () => void;
    (toggleSubcategories as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<{ ok: true; data: undefined }>((res) => {
          resolve = () => res({ ok: true, data: undefined });
        }),
    );
    render(<SubcategoryToggle enabled={false} />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toBeDisabled();
    resolve!();
  });

  it("calls toggleSubcategories(true) when clicking Off", async () => {
    (toggleSubcategories as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: undefined,
    });
    render(<SubcategoryToggle enabled={false} />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(toggleSubcategories).toHaveBeenCalledWith(true);
    });
  });

  it("calls toggleSubcategories(false) when clicking On", async () => {
    (toggleSubcategories as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: undefined,
    });
    render(<SubcategoryToggle enabled={true} />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(toggleSubcategories).toHaveBeenCalledWith(false);
    });
  });

  it("shows error message when toggle fails", async () => {
    (toggleSubcategories as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: {
        code: "subcategory_toggle_failed",
        message: "Failed to update subcategory setting.",
      },
    });
    render(<SubcategoryToggle enabled={false} />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Failed to update subcategory setting.",
      );
    });
  });

  it("clears error on subsequent successful toggle", async () => {
    (toggleSubcategories as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "subcategory_toggle_failed",
          message: "Failed to update subcategory setting.",
        },
      })
      .mockResolvedValueOnce({ ok: true, data: undefined });

    render(<SubcategoryToggle enabled={false} />);
    const button = screen.getByRole("button");

    await userEvent.click(button);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    await userEvent.click(button);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
