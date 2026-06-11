import { describe, it, expect } from "vitest";
import { escapeCsvField, generateCsvString } from "./csv";
import type { ExportRow } from "./schema";

describe("escapeCsvField", () => {
  it("leaves a plain string unchanged", () => {
    expect(escapeCsvField("no special chars")).toBe("no special chars");
  });

  it("wraps and doubles inner quotes", () => {
    expect(escapeCsvField('has "quotes"')).toBe('"has ""quotes"""');
  });

  it("wraps a field containing a comma", () => {
    expect(escapeCsvField("has,comma")).toBe('"has,comma"');
  });

  it("wraps a field containing a newline", () => {
    const result = escapeCsvField("has\nnewline");
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
  });

  it("handles empty string", () => {
    expect(escapeCsvField("")).toBe("");
  });
});

describe("generateCsvString", () => {
  it("returns only the header row when rows is empty", () => {
    const result = generateCsvString([], "USD");
    expect(result).toBe("Date,Amount (USD),Type,Category,Account,Note");
  });

  it("inserts currency into Amount column header", () => {
    const result = generateCsvString([], "EUR");
    expect(result).toContain("Amount (EUR)");
  });

  it("returns header + 1 data line for a single row", () => {
    const row: ExportRow = {
      date: "2026-05-01",
      amount: "50.00",
      type: "expense",
      category: "Groceries",
      account: "Checking",
      note: "",
    };
    const result = generateCsvString([row], "USD");
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Date,Amount (USD),Type,Category,Account,Note");
    expect(lines[1]).toBe("2026-05-01,50.00,expense,Groceries,Checking,");
  });

  it("escapes note field containing a comma", () => {
    const row: ExportRow = {
      date: "2026-05-01",
      amount: "30.00",
      type: "expense",
      category: "Food",
      account: "Cash",
      note: "coffee, pastry",
    };
    const result = generateCsvString([row], "USD");
    expect(result).toContain('"coffee, pastry"');
  });

  it('escapes note field containing quotes — He said, "hello"', () => {
    const row: ExportRow = {
      date: "2026-05-01",
      amount: "10.00",
      type: "income",
      category: "Other",
      account: "Bank",
      note: 'He said, "hello"',
    };
    const result = generateCsvString([row], "USD");
    expect(result).toContain('"He said, ""hello"""');
  });

  it("amount field is never wrapped in quotes (numeric, no special chars)", () => {
    const row: ExportRow = {
      date: "2026-05-15",
      amount: "123.45",
      type: "income",
      category: "Salary",
      account: "Bank",
      note: "",
    };
    const result = generateCsvString([row], "USD");
    const dataLine = result.split("\n")[1];
    // Amount field must appear as plain numeric, not wrapped
    expect(dataLine).toContain(",123.45,");
    expect(dataLine).not.toContain('"123.45"');
  });
});
