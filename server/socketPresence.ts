import type { Server, Socket } from "socket.io";
import type { RedisClientType } from "redis";
import type { RoomState } from "./types.js";

export type SocketPlayerRef = { roomCode: string; playerId: string; socketToken: string };
export type SocketSpectatorRef = { roomCode: string };
export type RoomSocketCleanupPayload = {
    roomCode: string;
    playerIds?: string[];
    socketIds?: string[];
    excludeSocketIds?: string[];
};

export const createSocketPresence = ({
    io,
    rooms,
    socketToPlayer,
    socketToSpectator,
    remotePresenceFetchedAt,
    getRedisClients,
    remotePresenceFetchIntervalMs,
}: {
    io: Server;
    rooms: Map<string, RoomState>;
    socketToPlayer: Map<string, SocketPlayerRef>;
    socketToSpectator: Map<string, SocketSpectatorRef>;
    remotePresenceFetchedAt: Map<string, number>;
    getRedisClients: () => { pubClient: RedisClientType; subClient: RedisClientType } | null;
    remotePresenceFetchIntervalMs: number;
}) => {
    const clearLocalSocketPlayer = (socketId: string) => {
        socketToPlayer.delete(socketId);
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) return;
        delete socket.data.roomCode;
        delete socket.data.playerId;
        delete socket.data.socketToken;
    };

    const setSocketPlayer = (socket: Socket, ref: SocketPlayerRef) => {
        socketToSpectator.delete(socket.id);
        socketToPlayer.set(socket.id, ref);
        socket.data.roomCode = ref.roomCode;
        socket.data.playerId = ref.playerId;
        socket.data.socketToken = ref.socketToken;
        delete socket.data.spectator;
    };

    const findSocketPlayerRefInRooms = (socket: Socket): SocketPlayerRef | undefined => {
        for (const room of rooms.values()) {
            for (const player of room.players.values()) {
                if (player.socketId !== socket.id || !player.socketToken) continue;
                const ref = {
                    roomCode: room.code,
                    playerId: player.id,
                    socketToken: player.socketToken,
                };
                setSocketPlayer(socket, ref);
                return ref;
            }
        }
        return undefined;
    };

    const getSocketPlayerRef = (socket: Socket): SocketPlayerRef | undefined => {
        const existing = socketToPlayer.get(socket.id);
        if (existing) return existing;
        const { roomCode, playerId, socketToken } = socket.data as Partial<SocketPlayerRef>;
        if (
            typeof roomCode !== "string" ||
            typeof playerId !== "string" ||
            typeof socketToken !== "string"
        )
            return findSocketPlayerRefInRooms(socket);
        const ref = { roomCode, playerId, socketToken };
        socketToPlayer.set(socket.id, ref);
        return ref;
    };

    const setSocketSpectator = (socket: Socket, ref: SocketSpectatorRef) => {
        clearLocalSocketPlayer(socket.id);
        socketToSpectator.set(socket.id, ref);
        socket.data.roomCode = ref.roomCode;
        socket.data.spectator = true;
    };

    const clearLocalSocketSpectator = (socketId: string) => {
        socketToSpectator.delete(socketId);
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) return;
        delete socket.data.roomCode;
        delete socket.data.spectator;
    };

    // eslint-disable-next-line complexity
    function cleanupLocalRoomSockets({
        roomCode,
        playerIds,
        socketIds,
        excludeSocketIds,
    }: RoomSocketCleanupPayload) {
        const playerIdSet = playerIds ? new Set(playerIds) : null;
        const socketIdSet = socketIds ? new Set(socketIds) : null;
        const excludedSocketIds = new Set(excludeSocketIds ?? []);
        for (const [socketId, ref] of socketToPlayer.entries()) {
            if (excludedSocketIds.has(socketId)) continue;
            if (ref.roomCode !== roomCode) continue;
            if (
                (playerIdSet || socketIdSet) &&
                !playerIdSet?.has(ref.playerId) &&
                !socketIdSet?.has(socketId)
            )
                continue;
            io.sockets.sockets.get(socketId)?.leave(roomCode);
            clearLocalSocketPlayer(socketId);
        }
        for (const [socketId, ref] of socketToSpectator.entries()) {
            if (excludedSocketIds.has(socketId)) continue;
            if (ref.roomCode !== roomCode) continue;
            if (socketIdSet && !socketIdSet.has(socketId)) continue;
            io.sockets.sockets.get(socketId)?.leave(roomCode);
            clearLocalSocketSpectator(socketId);
        }
    }

    const cleanupRoomSocketsAcrossCluster = (payload: RoomSocketCleanupPayload) => {
        cleanupLocalRoomSockets(payload);
        io.serverSideEmit("room:socket-cleanup", payload);
    };

    const markSocketPresence = (
        room: RoomState,
        ref: Partial<SocketPlayerRef>,
        socketId: string,
    ) => {
        if (ref.roomCode !== room.code || !ref.playerId) return;
        const player = room.players.get(ref.playerId);
        if (!player) return;
        if (!ref.socketToken || player.socketToken !== ref.socketToken) return;
        player.socketId = socketId;
        player.connected = true;
    };

    const applySocketPresence = async (room: RoomState) => {
        const cachedRoom = rooms.get(room.code);
        for (const player of room.players.values()) {
            const cachedPlayer = cachedRoom?.players.get(player.id);
            if (cachedPlayer?.socketToken === player.socketToken) {
                player.socketId = cachedPlayer.socketId;
                player.connected = cachedPlayer.connected;
            } else {
                player.socketId = "";
                player.connected = false;
            }
        }
        for (const [socketId, ref] of socketToPlayer.entries()) {
            if (ref.roomCode !== room.code) continue;
            const socket = io.sockets.sockets.get(socketId);
            if (!room.players.has(ref.playerId) || !socket) {
                clearLocalSocketPlayer(socketId);
                continue;
            }
            markSocketPresence(room, ref, socketId);
        }

        const now = Date.now();
        const shouldFetchRemotePresence =
            getRedisClients() &&
            now - (remotePresenceFetchedAt.get(room.code) ?? 0) >= remotePresenceFetchIntervalMs;
        if (shouldFetchRemotePresence) {
            try {
                const sockets = await io.in(room.code).fetchSockets();
                for (const player of room.players.values()) {
                    if (io.sockets.sockets.has(player.socketId)) continue;
                    player.socketId = "";
                    player.connected = false;
                }
                for (const remoteSocket of sockets) {
                    markSocketPresence(
                        room,
                        remoteSocket.data as Partial<SocketPlayerRef>,
                        remoteSocket.id,
                    );
                }
                remotePresenceFetchedAt.set(room.code, now);
            } catch (error) {
                console.error(`Unable to fetch socket presence for room ${room.code}.`, error);
            }
        }
        return room;
    };

    return {
        applySocketPresence,
        cleanupLocalRoomSockets,
        cleanupRoomSocketsAcrossCluster,
        clearLocalSocketPlayer,
        clearLocalSocketSpectator,
        getSocketPlayerRef,
        setSocketPlayer,
        setSocketSpectator,
    };
};
