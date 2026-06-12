import type { ExportRow } from "./schema";

/**
 * Escapes a CSV field per RFC 4180.
 * Wraps in double-quotes if the value contains commas, double-quotes, or newlines.
 * Doubles any existing double-quote characters.
 */
export function escapeCsvField(value: string): string {
  if (
    value.includes('"') ||
    value.includes(",") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Converts ExportRow[] to a valid RFC 4180 CSV string.
 * Header row: Date, Amount ($), Type, Category, Account, Note
 */
export function generateCsvString(rows: ExportRow[], currency: string): string {
  void currency;
  const header = `Date,Amount ($),Type,Category,Account,Note`;
  if (rows.length === 0) return header;

  const dataLines = rows.map((r) =>
    [
      r.date,
      r.amount,
      r.type,
      escapeCsvField(r.category),
      escapeCsvField(r.account),
      escapeCsvField(r.note),
    ].join(","),
  );

  return [header, ...dataLines].join("\n");
}

export function triggerCsvDownload(content: string, filename: string): void {
  // UTF-8 BOM (﻿) signals Excel to open as UTF-8 instead of Windows-1252,
  // which prevents special characters (em dashes, accented letters, etc.) from
  // appearing as garbled sequences like "â€"".
  const blob = new Blob(["﻿" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
