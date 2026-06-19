import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContributionAnalysis } from "./ContributionAnalysis";
import type { ContributionAnalysisData } from "@/features/family/schema";

const makeData = (
  aliceName = "Alice",
  bobName = "Bob",
): ContributionAnalysisData => ({
  contributions: [
    {
      contributorId: "alice-id",
      displayName: aliceName,
      totalPaidMinor: 6000,
      transactionCount: 3,
      goalContributionMinor: 500,
    },
    {
      contributorId: "bob-id",
      displayName: bobName,
      totalPaidMinor: 4000,
      transactionCount: 3,
      goalContributionMinor: 0,
    },
  ],
  currency: "USD",
  settledAt: "2026-06-01T00:00:00Z",
  periodEnd: "2026-06-30",
});

describe("ContributionAnalysis", () => {
  it("renders two columns with partner names when in family mode", () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders formatted money totals", () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    // formatMoney(6000, "USD") → "$60.00"
    expect(screen.getByText("$60.00")).toBeInTheDocument();
    expect(screen.getByText("$40.00")).toBeInTheDocument();
  });

  it("renders transaction count", () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    expect(screen.getAllByText("3 transactions")).toHaveLength(2);
  });

  it("renders goal contribution row when any contributor has goal contributions", () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    expect(screen.getAllByText(/Goal contributions:/i)).toHaveLength(2);
  });

  it("section is hidden when not in family mode", () => {
    const { container } = render(
      <ContributionAnalysis initialData={null} isFamilyMode={false} />,
    );

    const section = container.querySelector(
      "section[aria-labelledby='contribution-analysis-heading']",
    );
    expect(section).toHaveAttribute("hidden");
  });

  it("aria-live region is always mounted (even in solo mode)", () => {
    render(<ContributionAnalysis initialData={null} isFamilyMode={false} />);

    const liveRegion = screen.getByRole("status", { hidden: true });
    expect(liveRegion).toBeInTheDocument();
  });

  it("uses a table with caption and th scope=col for semantic relationship", () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Alice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Bob" }),
    ).toBeInTheDocument();
  });

  it("shows empty state when both contributors have 0 transactions", () => {
    const emptyData: ContributionAnalysisData = {
      contributions: [
        {
          contributorId: "a",
          displayName: "Alice",
          totalPaidMinor: 0,
          transactionCount: 0,
          goalContributionMinor: 0,
        },
        {
          contributorId: "b",
          displayName: "Bob",
          totalPaidMinor: 0,
          transactionCount: 0,
          goalContributionMinor: 0,
        },
      ],
      currency: "USD",
      settledAt: null,
      periodEnd: null,
    };
    render(
      <ContributionAnalysis initialData={emptyData} isFamilyMode={true} />,
    );

    expect(screen.getByText("No shared expenses")).toBeInTheDocument();
  });

  it("shows empty state when initialData is null", () => {
    render(<ContributionAnalysis initialData={null} isFamilyMode={true} />);

    expect(screen.getByText("No shared expenses")).toBeInTheDocument();
  });

  it("uses partnerName prop for partner column header instead of displayName from data", () => {
    render(
      <ContributionAnalysis
        initialData={makeData("You", "Partner")}
        isFamilyMode={true}
        partnerName="Jordan"
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Jordan" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Partner" })).not.toBeInTheDocument();
  });

  it("shows 'All time' subtitle when no lastSettledAt", () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("shows 'Since [date]' subtitle when lastSettledAt is provided", () => {
    render(
      <ContributionAnalysis
        initialData={makeData()}
        isFamilyMode={true}
        lastSettledAt="2026-05-31T10:00:00Z"
      />,
    );
    expect(screen.getByText(/Since/i)).toBeInTheDocument();
  });
});
