import type { Pool } from "pg";
import type { RoomPublic } from "../shared/game.js";
import {
    formatDatabaseErrorSummary,
    isDatabaseConnectionUnavailableError,
} from "./databaseHealth.js";
import { cleanupEffects } from "./items.js";
import { readRoomStateCodes } from "./roomDatabase.js";
import type { RoomState } from "./types.js";

type RoomTtl = {
    emptyLobbyMs: number;
    disconnectedLobbyMs: number;
    finishedMs: number;
};

const skipForDatabaseError = (phase: string, error: unknown) => {
    if (!isDatabaseConnectionUnavailableError(error)) return false;
    console.warn(
        `Room maintenance skipped while Postgres is unavailable during ${phase}: ${formatDatabaseErrorSummary(error)}`,
    );
    return true;
};

export const createRoomMaintenance = ({
    rooms,
    getPool,
    withRoomMutation,
    getPersistedRoom,
    expiredEffectNoticeMs,
    roomTtl,
    maybeStartReleasedEventRoom,
    isFinished,
    finishRoom,
    maybeFreezeScoreboard,
    emitRoom,
    deleteRoom,
}: {
    rooms: Map<string, RoomState>;
    getPool: () => Pool | null;
    withRoomMutation: <T>(code: string, callback: () => Promise<T>) => Promise<T>;
    getPersistedRoom: (code: string) => Promise<RoomState | null>;
    expiredEffectNoticeMs: number;
    roomTtl: RoomTtl;
    maybeStartReleasedEventRoom: (room: RoomState) => boolean;
    isFinished: (room: RoomState) => boolean;
    finishRoom: (room: RoomState, reason?: string) => RoomPublic | null;
    maybeFreezeScoreboard: (room: RoomState) => boolean;
    emitRoom: (room: RoomState) => RoomPublic;
    deleteRoom: (room: RoomState) => void;
}) => {
    const runRoomMaintenance = async () => {
        const now = Date.now();
        const codes = new Set(rooms.keys());
        const pool = getPool();
        if (pool) {
            try {
                for (const code of await readRoomStateCodes(pool)) codes.add(code);
            } catch (error) {
                if (skipForDatabaseError("room-code fetch", error)) return;
                throw error;
            }
        }
        for (const code of codes) {
            try {
                await withRoomMutation(code, async () => {
                    const room = await getPersistedRoom(code);
                    if (!room) return;
                    const effectsChanged = cleanupEffects(room, now, expiredEffectNoticeMs);
                    const startedEventRoom = maybeStartReleasedEventRoom(room);
                    if (isFinished(room)) finishRoom(room);
                    else if (startedEventRoom) emitRoom(room);
                    else if (maybeFreezeScoreboard(room)) emitRoom(room);
                    else if (effectsChanged) emitRoom(room);

                    const hasConnectedPlayers = [...room.players.values()].some(
                        (player) => player.connected,
                    );
                    const shouldDelete =
                        (room.status === "finished" &&
                            now - room.lastActivityAt > roomTtl.finishedMs) ||
                        (room.status === "lobby" &&
                            room.players.size === 0 &&
                            now - room.createdAt > roomTtl.emptyLobbyMs) ||
                        (room.status === "lobby" &&
                            !hasConnectedPlayers &&
                            now - room.lastActivityAt > roomTtl.disconnectedLobbyMs);
                    if (shouldDelete) deleteRoom(room);
                });
            } catch (error) {
                if (skipForDatabaseError(`room ${code}`, error)) return;
                throw error;
            }
        }
    };

    return { runRoomMaintenance };
};
