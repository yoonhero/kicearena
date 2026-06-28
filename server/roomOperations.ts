import type { Server } from "socket.io";
import type { ArenaLog } from "../shared/game.js";
import { shouldCloseRoomForNoConnectedPlayers } from "../shared/roomLifecycle.js";
import type { createRoomStore } from "./roomStore.js";
import type { RoomState, PlayerState } from "./types.js";

export const createRoomOperations = ({
    io,
    rooms,
    remotePresenceFetchedAt,
    roomStore,
    clearLocalSocketPlayer,
    cleanupRoomSocketsAcrossCluster,
    makeId,
}: {
    io: Server;
    rooms: Map<string, RoomState>;
    remotePresenceFetchedAt: Map<string, number>;
    roomStore: ReturnType<typeof createRoomStore>;
    clearLocalSocketPlayer: (socketId: string) => void;
    cleanupRoomSocketsAcrossCluster: (payload: {
        roomCode: string;
        playerIds?: string[];
        socketIds?: string[];
        excludeSocketIds?: string[];
    }) => void;
    makeId: () => string;
}) => {
    const addLog = (room: RoomState, kind: ArenaLog["kind"], message: string) => {
        room.logs.unshift({ id: makeId(), kind, message, createdAt: Date.now() });
        room.logs = room.logs.slice(0, 24);
    };

    const touchRoom = (room: RoomState) => {
        room.lastActivityAt = Date.now();
    };

    const deleteRoom = (room: RoomState) => {
        cleanupRoomSocketsAcrossCluster({ roomCode: room.code });
        for (const player of room.players.values()) {
            io.sockets.sockets.get(player.socketId)?.leave(room.code);
        }
        rooms.delete(room.code);
        remotePresenceFetchedAt.delete(room.code);
        roomStore.removePersistedRoom(room.code);
    };

    const removePlayerFromRoom = (room: RoomState, player: PlayerState) => {
        room.players.delete(player.id);
        clearLocalSocketPlayer(player.socketId);
        io.sockets.sockets.get(player.socketId)?.leave(room.code);
    };

    const closeLobbyRoom = (room: RoomState) => {
        io.to(room.code).emit("room:closed", { code: room.code });
        deleteRoom(room);
    };

    const closeRoomIfNoConnectedPlayers = (room: RoomState) => {
        if (room.status !== "lobby") return false;
        if (!shouldCloseRoomForNoConnectedPlayers(room.players.values())) return false;
        io.to(room.code).emit("room:closed", { code: room.code });
        deleteRoom(room);
        return true;
    };

    return {
        addLog,
        closeLobbyRoom,
        closeRoomIfNoConnectedPlayers,
        deleteRoom,
        removePlayerFromRoom,
        touchRoom,
    };
};
