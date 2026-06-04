export type RoomLifecycleStatus = "lobby" | "playing" | "finished";

export type RoomLifecycleInput = {
  hostId: string;
  status: RoomLifecycleStatus;
};

export type LobbyLeaveAction = "noop" | "remove-player" | "close-room" | "detach-player";

export type LobbyKickResult =
  | { ok: true; targetPlayerId: string }
  | { ok: false; error: "not-host" | "not-lobby" | "missing-target" | "self-target" };

export function getRoomLeaveAction(room: RoomLifecycleInput | undefined, playerId: string | undefined): LobbyLeaveAction {
  if (!room || !playerId) return "noop";
  if (room.status !== "lobby") return "detach-player";
  return room.hostId === playerId ? "close-room" : "remove-player";
}

export function validateLobbyKick(room: RoomLifecycleInput | undefined, actorPlayerId: string | undefined, targetPlayerId: string | undefined): LobbyKickResult {
  if (!room || room.hostId !== actorPlayerId) return { ok: false, error: "not-host" };
  if (room.status !== "lobby") return { ok: false, error: "not-lobby" };
  if (!targetPlayerId) return { ok: false, error: "missing-target" };
  if (targetPlayerId === actorPlayerId) return { ok: false, error: "self-target" };
  return { ok: true, targetPlayerId };
}
