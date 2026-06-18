export type RoomLifecycleStatus = "lobby" | "playing" | "finished";

export type RoomLifecycleInput = {
    hostId: string;
    status: RoomLifecycleStatus;
    mode?: "casual" | "contest";
};

export type ConnectedPlayerInput = {
    connected: boolean;
};

export type LobbyLeaveAction = "noop" | "remove-player" | "close-room" | "detach-player";

export type LobbyKickResult =
    | { ok: true; targetPlayerId: string }
    | { ok: false; error: "not-host" | "not-lobby" | "missing-target" | "self-target" };

export type RoomJoinResult =
    | { ok: true; status: RoomLifecycleStatus }
    | { ok: false; error: "missing-room" | "finished" | "contest-invite-only" };

export function getRoomLeaveAction(
    room: RoomLifecycleInput | undefined,
    playerId: string | undefined,
): LobbyLeaveAction {
    if (!room || !playerId) return "noop";
    if (room.status !== "lobby") return "detach-player";
    return room.hostId === playerId ? "close-room" : "remove-player";
}

export function validateRoomJoin(room: RoomLifecycleInput | undefined): RoomJoinResult {
    if (!room) return { ok: false, error: "missing-room" };
    if (room.status === "finished") return { ok: false, error: "finished" };
    if (room.mode === "contest") return { ok: false, error: "contest-invite-only" };
    return { ok: true, status: room.status };
}

export function validateLobbyKick(
    room: RoomLifecycleInput | undefined,
    actorPlayerId: string | undefined,
    targetPlayerId: string | undefined,
): LobbyKickResult {
    if (!room || room.hostId !== actorPlayerId) return { ok: false, error: "not-host" };
    if (room.status !== "lobby") return { ok: false, error: "not-lobby" };
    if (!targetPlayerId) return { ok: false, error: "missing-target" };
    if (targetPlayerId === actorPlayerId) return { ok: false, error: "self-target" };
    return { ok: true, targetPlayerId };
}

export function shouldCloseRoomForNoConnectedPlayers(players: Iterable<ConnectedPlayerInput>) {
    for (const player of players) {
        if (player.connected) return false;
    }
    return true;
}
