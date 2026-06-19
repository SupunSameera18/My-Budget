"use client";

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { MonthlySummaryData } from "@/features/analytics/server/actions";
import type { ExportRow } from "@/features/analytics/schema";
import { formatMoney } from "@/lib/format";

interface BudgetReportPdfProps {
  summary: MonthlySummaryData;
  rows: ExportRow[];
  selectedMonth: string;
}

export function BudgetReportPdf({
  summary,
  rows,
  selectedMonth,
}: BudgetReportPdfProps) {
  return (
    <Document title={`My Budget — ${selectedMonth}`} author="My Budget">
      <Page size="A4" style={styles.page}>
        {/* ── Executive Summary ── */}
        <View style={styles.section}>
          <Text style={styles.heading}>Monthly Summary — {selectedMonth}</Text>
          <Text>
            Net: {summary.netMinor >= 0 ? "+" : ""}
            {formatMoney(summary.netMinor, summary.currency)}
          </Text>
          <Text>Income: {formatMoney(summary.incomeMinor, summary.currency)}</Text>
          <Text>
            Expenses: {formatMoney(summary.expenseMinor, summary.currency)}
          </Text>
          {summary.healthScore && (
            <Text>Health Score: {summary.healthScore.score}/100</Text>
          )}
        </View>

        {/* ── Top Categories ── */}
        {summary.topCategories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.subheading}>Top Spending Categories</Text>
            {summary.topCategories.map((c) => (
              <View key={c.name} style={styles.row}>
                <Text>{c.name}</Text>
                <Text>{formatMoney(c.amountMinor, summary.currency)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Budget Performance ── */}
        {summary.budgets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.subheading}>Budgets</Text>
            {summary.budgets.map((b) => (
              <View key={b.id} style={styles.row}>
                <Text>{b.name}</Text>
                <Text>
                  {b.hit ? "Over" : "On track"} ({b.pctUsed.toFixed(0)}%)
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Transaction Detail ── */}
        <View style={styles.section}>
          <Text style={styles.subheading}>Transactions ({rows.length})</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDate, styles.colHeaderText]}>Date</Text>
            <Text style={[styles.colAmount, styles.colHeaderText]}>Amount</Text>
            <Text style={[styles.colType, styles.colHeaderText]}>Type</Text>
            <Text style={[styles.colCategory, styles.colHeaderText]}>
              Category
            </Text>
            <Text style={[styles.colNote, styles.colHeaderText]}>Note</Text>
          </View>
          {rows.map((row, i) => (
            <View
              key={i}
              style={[styles.row, i % 2 === 0 ? styles.rowEven : styles.rowOdd]}
            >
              <Text style={styles.colDate}>{row.date}</Text>
              <Text style={styles.colAmount}>{row.amount}</Text>
              <Text style={styles.colType}>{row.type}</Text>
              <Text style={styles.colCategory}>{row.category}</Text>
              <Text style={styles.colNote}>{row.note}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10 },
  section: { marginBottom: 16 },
  heading: { fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  subheading: { fontSize: 12, fontWeight: "bold", marginBottom: 4 },
  row: { flexDirection: "row", paddingVertical: 2 },
  rowEven: { backgroundColor: "#f9fafb" },
  rowOdd: {},
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    paddingBottom: 4,
    marginBottom: 4,
  },
  colDate: { width: "15%" },
  colAmount: { width: "15%", textAlign: "right", paddingRight: 8 },
  colType: { width: "12%", paddingLeft: 4 },
  colCategory: { width: "20%" },
  colNote: { flex: 1 },
  colHeaderText: { fontWeight: "bold" },
});
