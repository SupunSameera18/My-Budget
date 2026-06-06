const COLD_START_PROMPTS: Record<string, string> = {
  "dining out": "Where did you eat?",
  groceries: "Which store?",
  transport: "Which route or service?",
  housing: "What for?",
  utilities: "Which utility?",
  healthcare: "What appointment?",
  entertainment: "What did you do?",
  shopping: "What did you buy?",
  education: "What for?",
  salary: "Which job or payment?",
  freelance: "Which project?",
  investment: "Which asset?",
};

export function dedupeRecentNotes(
  rows: Array<{ note: string | null }>,
  limit = 5,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    if (row.note !== null && row.note !== "" && !seen.has(row.note)) {
      seen.add(row.note);
      result.push(row.note);
    }
    if (result.length >= limit) break;
  }
  return result;
}

export function getDefaultNotePrompt(categoryName: string): string | null {
  return COLD_START_PROMPTS[categoryName.toLowerCase()] ?? null;
}
