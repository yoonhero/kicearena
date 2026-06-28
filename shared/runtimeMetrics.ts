import type { RoomMode, RoomStatus } from "./game.js";

export interface RoomMetricInput {
    mode: RoomMode;
    eventId: string;
    status: RoomStatus;
    endsAt: number | null;
    createdAt: number;
    lastActivityAt: number;
    playerCount: number;
    connectedPlayerCount: number;
}

export interface RoomTtlConfig {
    emptyLobbyMs: number;
    disconnectedLobbyMs: number;
    finishedMs: number;
    /**
     * Rooms with a cleanup / finish deadline inside this window are counted as
     * expiring soon. Defaults to 60 seconds so cleanup waves are visible before
     * they become backlog.
     */
    expiringSoonMs?: number;
}

export interface RuntimeMetricSummary {
    roomCount: number;
    activeRoomCount: number;
    statusCounts: Record<RoomStatus, number>;
    totalPlayers: number;
    connectedPlayers: number;
    disconnectedPlayers: number;
    disconnectedPlayerRatio: number;
    playersPerActiveRoom: {
        total: number;
        connected: number;
    };
    emptyLobbyRooms: number;
    disconnectedLobbyRooms: number;
    partiallyDisconnectedRooms: number;
    zombiePlayingRooms: number;
    playerCountMismatchRooms: number;
    expiringSoonRooms: number;
    expiredRooms: number;
    roomExpirySeconds: {
        avg: number;
        max: number;
    };
    roomExpiryOverdueSeconds: {
        avg: number;
        max: number;
    };
    playingRoomTimeRemainingSeconds: {
        avg: number;
        max: number;
    };
    roomDisconnectRiskScore: number;
    roomCleanupPressureScore: number;
    contestCount: number;
    contestSessionsByStatus: Record<string, Record<RoomStatus, number>>;
    contestParticipantsByState: Record<
        string,
        { total: number; connected: number; disconnected: number }
    >;
}

const DEFAULT_EXPIRING_SOON_MS = 60 * 1000;

const summarizeSeconds = (values: number[]) => ({
    avg: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
    max: values.length === 0 ? 0 : Math.max(...values),
});

const ratio = (numerator: number, denominator: number) =>
    denominator <= 0 ? 0 : numerator / denominator;

const boundedScore = (value: number) => Math.max(0, Math.min(1, value));

const roomExpiryDeadline = (room: RoomMetricInput, ttl: RoomTtlConfig) => {
    if (room.status === "playing" && room.endsAt !== null) return room.endsAt;
    if (room.status === "finished") return room.lastActivityAt + ttl.finishedMs;
    if (room.status === "lobby" && room.playerCount === 0) return room.createdAt + ttl.emptyLobbyMs;
    if (room.status === "lobby" && room.connectedPlayerCount === 0)
        return room.lastActivityAt + ttl.disconnectedLobbyMs;
    return null;
};

export const summarizeRoomMetrics = (
    rooms: RoomMetricInput[],
    now: number,
    ttl: RoomTtlConfig,
): RuntimeMetricSummary => {
    const statusCounts: Record<RoomStatus, number> = {
        lobby: 0,
        playing: 0,
        finished: 0,
    };
    const expiringSoonMs = ttl.expiringSoonMs ?? DEFAULT_EXPIRING_SOON_MS;
    let totalPlayers = 0;
    let connectedPlayers = 0;
    let emptyLobbyRooms = 0;
    let disconnectedLobbyRooms = 0;
    let partiallyDisconnectedRooms = 0;
    let zombiePlayingRooms = 0;
    let playerCountMismatchRooms = 0;
    let expiringSoonRooms = 0;
    let expiredRooms = 0;
    const expirySeconds: number[] = [];
    const overdueSeconds: number[] = [];
    const playingTimeRemainingSeconds: number[] = [];
    const activeContestIds = new Set<string>();
    const contestSessionsByStatus: RuntimeMetricSummary["contestSessionsByStatus"] = {};
    const contestParticipantsByState: RuntimeMetricSummary["contestParticipantsByState"] = {};

    for (const room of rooms) {
        statusCounts[room.status] += 1;
        totalPlayers += room.playerCount;
        connectedPlayers += room.connectedPlayerCount;

        if (
            room.connectedPlayerCount < 0 ||
            room.playerCount < 0 ||
            room.connectedPlayerCount > room.playerCount
        ) {
            playerCountMismatchRooms += 1;
        }

        if (room.status === "lobby" && room.playerCount === 0) emptyLobbyRooms += 1;
        if (room.status === "lobby" && room.playerCount > 0 && room.connectedPlayerCount === 0)
            disconnectedLobbyRooms += 1;
        if (
            room.status !== "finished" &&
            room.connectedPlayerCount > 0 &&
            room.connectedPlayerCount < room.playerCount
        ) {
            partiallyDisconnectedRooms += 1;
        }
        if (room.status === "playing" && room.connectedPlayerCount === 0) zombiePlayingRooms += 1;

        const expiryDeadline = roomExpiryDeadline(room, ttl);
        if (expiryDeadline !== null) {
            const msUntilExpiry = expiryDeadline - now;
            if (msUntilExpiry <= 0) {
                expiredRooms += 1;
                overdueSeconds.push(Math.abs(msUntilExpiry) / 1000);
            } else {
                expirySeconds.push(msUntilExpiry / 1000);
                if (msUntilExpiry <= expiringSoonMs) expiringSoonRooms += 1;
            }
        }

        if (room.status === "playing" && room.endsAt !== null) {
            playingTimeRemainingSeconds.push(Math.max(0, (room.endsAt - now) / 1000));
        }

        if (room.mode === "contest") {
            const eventId = room.eventId || "unknown";
            contestSessionsByStatus[eventId] ??= { lobby: 0, playing: 0, finished: 0 };
            contestParticipantsByState[eventId] ??= { total: 0, connected: 0, disconnected: 0 };
            contestSessionsByStatus[eventId][room.status] += 1;
            contestParticipantsByState[eventId].total += room.playerCount;
            contestParticipantsByState[eventId].connected += room.connectedPlayerCount;
            contestParticipantsByState[eventId].disconnected += Math.max(
                0,
                room.playerCount - room.connectedPlayerCount,
            );
            if (room.status !== "finished") activeContestIds.add(eventId);
        }
    }

    const activeRoomCount = rooms.filter((room) => room.status !== "finished").length;
    const disconnectedPlayers = Math.max(0, totalPlayers - connectedPlayers);
    const disconnectRiskNumerator =
        zombiePlayingRooms + disconnectedLobbyRooms * 0.7 + partiallyDisconnectedRooms * 0.3;
    const cleanupRiskNumerator = expiredRooms + expiringSoonRooms * 0.25;

    return {
        roomCount: rooms.length,
        activeRoomCount,
        statusCounts,
        totalPlayers,
        connectedPlayers,
        disconnectedPlayers,
        disconnectedPlayerRatio: ratio(disconnectedPlayers, totalPlayers),
        playersPerActiveRoom: {
            total: ratio(totalPlayers, activeRoomCount),
            connected: ratio(connectedPlayers, activeRoomCount),
        },
        emptyLobbyRooms,
        disconnectedLobbyRooms,
        partiallyDisconnectedRooms,
        zombiePlayingRooms,
        playerCountMismatchRooms,
        expiringSoonRooms,
        expiredRooms,
        roomExpirySeconds: summarizeSeconds(expirySeconds),
        roomExpiryOverdueSeconds: summarizeSeconds(overdueSeconds),
        playingRoomTimeRemainingSeconds: summarizeSeconds(playingTimeRemainingSeconds),
        roomDisconnectRiskScore: boundedScore(ratio(disconnectRiskNumerator, activeRoomCount)),
        roomCleanupPressureScore: boundedScore(ratio(cleanupRiskNumerator, activeRoomCount)),
        contestCount: activeContestIds.size,
        contestSessionsByStatus,
        contestParticipantsByState,
    };
};

export {
    baseRuntimeMetricSamples,
    derivedRuntimeMetricSamples,
    runtimeMetricSamples,
    type RuntimeMetricGaugeSample,
    type RuntimeMetricSampleOptions,
} from "./runtimeMetricSamples.js";
