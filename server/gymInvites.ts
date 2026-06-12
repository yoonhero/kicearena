export type GymEventInviteBook = Map<string, Map<string, Set<string>>>;

const normalizeKey = (value: string) => value.trim().toLowerCase();

export function parseGymEventInvites(raw: string): GymEventInviteBook {
  const invites: GymEventInviteBook = new Map();

  for (const eventEntry of raw.split(";")) {
    const [rawEventId, rawInvites = ""] = eventEntry.split(":");
    const eventId = rawEventId?.trim();
    if (!eventId) continue;

    const eventInvites = new Map<string, Set<string>>();
    for (const rawInvite of rawInvites.split(",")) {
      const [rawAccountId, rawInviteCodes = ""] = rawInvite.split("=");
      const accountId = normalizeKey(rawAccountId ?? "");
      const inviteCodes = rawInviteCodes
        .split("|")
        .map(normalizeKey)
        .filter(Boolean);
      if (!accountId || inviteCodes.length === 0) continue;
      eventInvites.set(accountId, new Set(inviteCodes));
    }
    if (eventInvites.size > 0) invites.set(eventId, eventInvites);
  }

  return invites;
}

export function hasGymEventInvite(
  invites: GymEventInviteBook,
  eventId: string,
  accountId: string,
  inviteCode: string
) {
  if (!eventId || !accountId || !inviteCode) return false;
  return Boolean(invites.get(eventId)?.get(normalizeKey(accountId))?.has(normalizeKey(inviteCode)));
}
