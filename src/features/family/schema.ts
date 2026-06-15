export interface ContributionEntry {
  contributorId: string;
  displayName: string;
  totalPaidMinor: number;
  transactionCount: number;
  goalContributionMinor: number;
}

export interface ContributionAnalysisData {
  contributions: [ContributionEntry, ContributionEntry];
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export type FamilyStatus =
  | { status: "solo" }
  | {
      status: "has_invite";
      familyUnitId: string;
      invite: { id: string; expiresAt: string; createdAt: string };
    }
  | {
      status: "in_family";
      familyUnitId: string;
      partner: { displayName: string };
    };
