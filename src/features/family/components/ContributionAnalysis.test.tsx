import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ContributionAnalysis } from "./ContributionAnalysis";
import type { ContributionAnalysisData } from "@/features/family/schema";

vi.mock("@/features/family/server/actions", () => ({
  getContributionAnalysis: vi.fn(),
}));

// Import after mock so vi.mocked() works
import { getContributionAnalysis } from "@/features/family/server/actions";

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
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getContributionAnalysis).mockResolvedValue(makeData());
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

    // Accessible name is not computed for hidden subtrees; query by attribute
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
      periodStart: null,
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

  it("period selector has role=radiogroup with aria-label", () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    const group = screen.getByRole("radiogroup", { name: /analysis period/i });
    expect(group).toBeInTheDocument();
  });

  it("each period option has role=radio with aria-checked", () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // "This month" is the default — should be checked
    const thisMonth = screen.getByRole("radio", { name: /this month/i });
    expect(thisMonth).toHaveAttribute("aria-checked", "true");
  });

  it("changes period and calls server action when selector is clicked", async () => {
    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    const lastThree = screen.getByRole("radio", { name: /last 3 months/i });
    await act(async () => {
      fireEvent.click(lastThree);
    });

    expect(vi.mocked(getContributionAnalysis)).toHaveBeenCalledWith(
      expect.any(String), // start
      expect.any(String), // end
    );
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

  it("shows error message and populates aria-live region on fetch failure", async () => {
    vi.mocked(getContributionAnalysis).mockResolvedValue(null);

    render(
      <ContributionAnalysis initialData={makeData()} isFamilyMode={true} />,
    );

    const allTime = screen.getByRole("radio", { name: /all time/i });
    await act(async () => {
      fireEvent.click(allTime);
    });

    // Both aria-live and visual <p> contain the error — use getAllByText
    const errorElements = screen.getAllByText(
      /could not load contribution data/i,
    );
    expect(errorElements.length).toBeGreaterThan(0);
  });
});
