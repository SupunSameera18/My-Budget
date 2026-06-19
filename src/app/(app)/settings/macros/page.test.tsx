import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { ok, err, ErrorCode } from "@/lib/errors";
import type { MacroWithTarget } from "@/features/macros/schema";

vi.mock("@/lib/supabase/require-user", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/features/macros/server/actions", () => ({
  getMacros: vi.fn(),
  getArchivedMacros: vi.fn(),
}));

vi.mock("@/features/macros/components/MacroCard", () => ({
  MacroCard: ({ macro }: { macro: MacroWithTarget }) => (
    <div data-testid="macro-card">{macro.name}</div>
  ),
}));

vi.mock("@/features/macros/components/ArchivedMacroCard", () => ({
  ArchivedMacroCard: ({ macro }: { macro: MacroWithTarget }) => (
    <div data-testid="archived-macro-card">{macro.name}</div>
  ),
}));

vi.mock("@/features/macros/components/CreateMacroForm", () => ({
  CreateMacroForm: () => <div data-testid="create-macro-form" />,
}));

import MacrosPage from "./page";
import { requireUser } from "@/lib/supabase/require-user";
import { getMacros, getArchivedMacros } from "@/features/macros/server/actions";

function makeQuery(data: unknown) {
  const q: Record<string, unknown> = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.is = vi.fn(() => q);
  q.order = vi.fn(() => Promise.resolve({ data, error: null }));
  q.single = vi.fn(() => Promise.resolve({ data, error: null }));
  return q;
}

const mockUser = { id: "user-1" };

function setupSupabaseMock() {
  const mockSupabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "profiles") return makeQuery({ currency: "USD" });
      if (table === "accounts")
        return makeQuery([{ id: "account-1", name: "Checking" }]);
      if (table === "goals")
        return makeQuery([{ id: "goal-1", name: "Vacation Fund" }]);
      if (table === "categories")
        return makeQuery([
          { id: "cat-1", name: "Entertainment", type: "expense" },
        ]);
      return makeQuery([]);
    }),
  };
  (requireUser as Mock).mockResolvedValue({
    supabase: mockSupabase,
    user: mockUser,
  });
}

const sampleMacro: MacroWithTarget = {
  id: "macro-1",
  user_id: "user-1",
  name: "Netflix",
  amount_minor: 1500,
  account_id: "account-1",
  goal_id: null,
  category_id: "cat-1",
  last_used_at: null,
  archived_at: null,
  created_at: "2026-06-01T00:00:00Z",
  account_name: "Checking",
  goal_name: null,
  category_name: "Entertainment",
};

const archivedMacro: MacroWithTarget = {
  id: "macro-2",
  user_id: "user-1",
  name: "Old Netflix",
  amount_minor: 999,
  account_id: "account-1",
  goal_id: null,
  category_id: "cat-1",
  last_used_at: null,
  archived_at: "2026-06-10T00:00:00Z",
  created_at: "2026-06-01T00:00:00Z",
  account_name: "Checking",
  goal_name: null,
  category_name: "Entertainment",
};

describe("MacrosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSupabaseMock();
    (getMacros as Mock).mockResolvedValue(ok([sampleMacro]));
    (getArchivedMacros as Mock).mockResolvedValue(ok([]));
  });

  it("renders heading and macro list when getMacros returns macros", async () => {
    const jsx = await MacrosPage();
    render(jsx);
    expect(screen.getByText("Macros")).toBeTruthy();
    expect(screen.getByTestId("macro-card")).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
  });

  it("renders empty state when getMacros returns empty array", async () => {
    (getMacros as Mock).mockResolvedValue(ok([]));
    const jsx = await MacrosPage();
    render(jsx);
    expect(screen.getByText(/No macros yet/i)).toBeTruthy();
    expect(screen.queryByTestId("macro-card")).toBeNull();
  });

  it("renders error state when getMacros returns ok: false", async () => {
    (getMacros as Mock).mockResolvedValue(
      err(ErrorCode.MacroFetchFailed, "DB error"),
    );
    const jsx = await MacrosPage();
    render(jsx);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Failed to load macros/i)).toBeTruthy();
  });

  it("renders CreateMacroForm", async () => {
    const jsx = await MacrosPage();
    render(jsx);
    expect(screen.getByTestId("create-macro-form")).toBeTruthy();
  });

  it("renders Add macro section heading", async () => {
    const jsx = await MacrosPage();
    render(jsx);
    expect(screen.getByText(/Add macro/i)).toBeTruthy();
  });

  it("renders archived macros section when archived macros exist", async () => {
    (getArchivedMacros as Mock).mockResolvedValue(ok([archivedMacro]));
    const jsx = await MacrosPage();
    render(jsx);
    expect(screen.getByText(/Archived macros/i)).toBeTruthy();
    expect(screen.getByTestId("archived-macro-card")).toBeTruthy();
    expect(screen.getByText("Old Netflix")).toBeTruthy();
  });

  it("does not render archived macros section when no archived macros", async () => {
    (getArchivedMacros as Mock).mockResolvedValue(ok([]));
    const jsx = await MacrosPage();
    render(jsx);
    expect(screen.queryByText(/Archived macros/i)).toBeNull();
    expect(screen.queryByTestId("archived-macro-card")).toBeNull();
  });
});
