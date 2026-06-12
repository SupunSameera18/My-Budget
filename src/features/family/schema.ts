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
