import { describe, expect, it } from "vitest";
import { dedupeRecentNotes, getDefaultNotePrompt } from "./note-suggestions";

// ── dedupeRecentNotes ────────────────────────────────────────────────────────

describe("dedupeRecentNotes", () => {
  it("returns [] for empty rows", () => {
    expect(dedupeRecentNotes([])).toEqual([]);
  });

  it("returns [] when all notes are null", () => {
    expect(
      dedupeRecentNotes([{ note: null }, { note: null }, { note: null }]),
    ).toEqual([]);
  });

  it("returns [] when all notes are empty strings", () => {
    expect(dedupeRecentNotes([{ note: "" }, { note: "" }])).toEqual([]);
  });

  it("deduplicates preserving recency order", () => {
    const rows = [{ note: "A" }, { note: "B" }, { note: "A" }, { note: "C" }];
    expect(dedupeRecentNotes(rows)).toEqual(["A", "B", "C"]);
  });

  it("limits to 5 by default with 6 distinct inputs", () => {
    const rows = [
      { note: "1" },
      { note: "2" },
      { note: "3" },
      { note: "4" },
      { note: "5" },
      { note: "6" },
    ];
    expect(dedupeRecentNotes(rows)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("respects custom limit", () => {
    const rows = [{ note: "A" }, { note: "B" }, { note: "C" }, { note: "D" }];
    expect(dedupeRecentNotes(rows, 3)).toEqual(["A", "B", "C"]);
  });

  it("is case-sensitive — keeps Coffee and coffee as separate entries", () => {
    const rows = [{ note: "Coffee" }, { note: "coffee" }];
    expect(dedupeRecentNotes(rows)).toEqual(["Coffee", "coffee"]);
  });

  it("skips null values interspersed with valid notes", () => {
    const rows = [
      { note: "Coffee" },
      { note: null },
      { note: "Tea" },
      { note: null },
    ];
    expect(dedupeRecentNotes(rows)).toEqual(["Coffee", "Tea"]);
  });

  it("returns deduplicated notes up to limit when duplicates follow unique entries", () => {
    // 6 rows but only 5 distinct — should still return all 5
    const rows = [
      { note: "A" },
      { note: "B" },
      { note: "C" },
      { note: "D" },
      { note: "E" },
      { note: "A" }, // duplicate of first
    ];
    expect(dedupeRecentNotes(rows)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("limit=1 returns only the first unique note", () => {
    const rows = [{ note: "Coffee" }, { note: "Tea" }];
    expect(dedupeRecentNotes(rows, 1)).toEqual(["Coffee"]);
  });
});

// ── getDefaultNotePrompt ─────────────────────────────────────────────────────

describe("getDefaultNotePrompt", () => {
  it("Dining Out → 'Where did you eat?'", () => {
    expect(getDefaultNotePrompt("Dining Out")).toBe("Where did you eat?");
  });

  it("Groceries → 'Which store?'", () => {
    expect(getDefaultNotePrompt("Groceries")).toBe("Which store?");
  });

  it("Transport → 'Which route or service?'", () => {
    expect(getDefaultNotePrompt("Transport")).toBe("Which route or service?");
  });

  it("Housing → 'What for?'", () => {
    expect(getDefaultNotePrompt("Housing")).toBe("What for?");
  });

  it("Utilities → 'Which utility?'", () => {
    expect(getDefaultNotePrompt("Utilities")).toBe("Which utility?");
  });

  it("Healthcare → 'What appointment?'", () => {
    expect(getDefaultNotePrompt("Healthcare")).toBe("What appointment?");
  });

  it("Entertainment → 'What did you do?'", () => {
    expect(getDefaultNotePrompt("Entertainment")).toBe("What did you do?");
  });

  it("Shopping → 'What did you buy?'", () => {
    expect(getDefaultNotePrompt("Shopping")).toBe("What did you buy?");
  });

  it("Education → 'What for?'", () => {
    expect(getDefaultNotePrompt("Education")).toBe("What for?");
  });

  it("Salary → 'Which job or payment?'", () => {
    expect(getDefaultNotePrompt("Salary")).toBe("Which job or payment?");
  });

  it("Freelance → 'Which project?'", () => {
    expect(getDefaultNotePrompt("Freelance")).toBe("Which project?");
  });

  it("Investment → 'Which asset?'", () => {
    expect(getDefaultNotePrompt("Investment")).toBe("Which asset?");
  });

  it("Other → null (generic catch-all, no prompt)", () => {
    expect(getDefaultNotePrompt("Other")).toBeNull();
  });

  it("case-insensitive — 'dining out' (lowercase) → 'Where did you eat?'", () => {
    expect(getDefaultNotePrompt("dining out")).toBe("Where did you eat?");
  });

  it("user-created custom category → null", () => {
    expect(getDefaultNotePrompt("Custom Category")).toBeNull();
  });

  it("'Other Income' → null (not in map)", () => {
    expect(getDefaultNotePrompt("Other Income")).toBeNull();
  });
});
