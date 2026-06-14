import { describe, it, expect } from "vitest";
import { getDisplayName, TOMBSTONE_UUID } from "./display-names";

describe("getDisplayName", () => {
  const currentUserId = "aaaaaaaa-0000-4000-8000-000000000001";
  const partnerUserId = "bbbbbbbb-0000-4000-8000-000000000001";

  it("returns 'Former member' for tombstone UUID", () => {
    expect(getDisplayName(TOMBSTONE_UUID, currentUserId)).toBe("Former member");
  });

  it("returns 'You' for current user's ID", () => {
    expect(getDisplayName(currentUserId, currentUserId)).toBe("You");
  });

  it("returns 'Partner' for a different non-tombstone user", () => {
    expect(getDisplayName(partnerUserId, currentUserId)).toBe("Partner");
  });

  it("TOMBSTONE_UUID is the correct sentinel value", () => {
    expect(TOMBSTONE_UUID).toBe("00000000-0000-0000-0000-000000000001");
  });
});
