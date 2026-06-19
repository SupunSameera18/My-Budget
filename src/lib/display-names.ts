export const TOMBSTONE_UUID = "00000000-0000-0000-0000-000000000001";

export function getDisplayName(
  userId: string,
  currentUserId: string,
  viewerName?: string,
  partnerName?: string,
): string {
  if (userId === TOMBSTONE_UUID) return "Former member";
  if (userId === currentUserId) return viewerName ?? "You";
  return partnerName ?? "Partner";
}
