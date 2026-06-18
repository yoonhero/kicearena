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

export interface RuntimeMetricGaugeSample {
    name: string;
    help: string;
    value: number;
    labels?: Record<string, string>;
}

export interface RuntimeMetricSampleOptions {
    collectedAtMs?: number;
    service?: string;
}

const DEFAULT_EXPIRING_SOON_MS = 60 * 1000;
const DEFAULT_SERVICE = "kice-arena";

const summarizeSeconds = (values: number[]) => ({
    avg: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
    max: values.length === 0 ? 0 : Math.max(...values),
});

const ratio = (numerator: number, denominator: number) =>
    denominator <= 0 ? 0 : numerator / denominator;

const boundedScore = (value: number) => Math.max(0, Math.min(1, value));

const sampleOptions = (options: RuntimeMetricSampleOptions = {}) => ({
    collectedAtMs: options.collectedAtMs ?? Date.now(),
    service: options.service ?? DEFAULT_SERVICE,
});

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

export const baseRuntimeMetricSamples = (
    summary: RuntimeMetricSummary,
    options: RuntimeMetricSampleOptions = {},
): RuntimeMetricGaugeSample[] => {
    const resolved = sampleOptions(options);

    return [
        {
            name: "kice_arena_runtime_metrics_info",
            help: "Stable heartbeat emitted by the KICE 아레나 runtime metrics collector.",
            labels: { service: resolved.service },
            value: 1,
        },
        {
            name: "kice_arena_runtime_metrics_last_success_unixtime",
            help: "Unix timestamp of the most recent successful runtime metrics collection.",
            labels: { service: resolved.service },
            value: Math.floor(resolved.collectedAtMs / 1000),
        },
        {
            name: "kice_arena_rooms_total",
            help: "Total rooms currently tracked in memory.",
            value: summary.roomCount,
        },
        {
            name: "kice_arena_rooms_active",
            help: "Rooms currently tracked in memory that are not finished.",
            value: summary.activeRoomCount,
        },
        ...(["lobby", "playing", "finished"] as const).map((status) => ({
            name: "kice_arena_rooms_by_status",
            help: "Rooms currently tracked in memory by room status.",
            labels: { status },
            value: summary.statusCounts[status],
        })),
        {
            name: "kice_arena_players",
            help: "Tracked players by connection state.",
            labels: { state: "total" },
            value: summary.totalPlayers,
        },
        {
            name: "kice_arena_players",
            help: "Tracked players by connection state.",
            labels: { state: "connected" },
            value: summary.connectedPlayers,
        },
        {
            name: "kice_arena_players",
            help: "Tracked players by connection state.",
            labels: { state: "disconnected" },
            value: summary.disconnectedPlayers,
        },
        {
            name: "kice_arena_room_expiry_seconds",
            help: "Seconds until the next finish or cleanup deadline among rooms with a deadline.",
            labels: { stat: "avg" },
            value: summary.roomExpirySeconds.avg,
        },
        {
            name: "kice_arena_room_expiry_seconds",
            help: "Seconds until the next finish or cleanup deadline among rooms with a deadline.",
            labels: { stat: "max" },
            value: summary.roomExpirySeconds.max,
        },
        {
            name: "kice_arena_playing_room_time_remaining_seconds",
            help: "Seconds remaining for currently playing rooms.",
            labels: { stat: "avg" },
            value: summary.playingRoomTimeRemainingSeconds.avg,
        },
        {
            name: "kice_arena_playing_room_time_remaining_seconds",
            help: "Seconds remaining for currently playing rooms.",
            labels: { stat: "max" },
            value: summary.playingRoomTimeRemainingSeconds.max,
        },
    ];
};

export const derivedRuntimeMetricSamples = (
    summary: RuntimeMetricSummary,
): RuntimeMetricGaugeSample[] => [
    {
        name: "kice_arena_players_disconnected_ratio",
        help: "Share of tracked players that are currently disconnected. Value range: 0..1.",
        value: summary.disconnectedPlayerRatio,
    },
    {
        name: "kice_arena_players_per_active_room",
        help: "Average players per non-finished room by player state.",
        labels: { state: "total" },
        value: summary.playersPerActiveRoom.total,
    },
    {
        name: "kice_arena_players_per_active_room",
        help: "Average players per non-finished room by player state.",
        labels: { state: "connected" },
        value: summary.playersPerActiveRoom.connected,
    },
    {
        name: "kice_arena_rooms_empty_lobby",
        help: "Lobby rooms with no tracked players. High values point to lobby cleanup pressure.",
        value: summary.emptyLobbyRooms,
    },
    {
        name: "kice_arena_rooms_disconnected_lobby",
        help: "Lobby rooms that still have tracked players but no connected players.",
        value: summary.disconnectedLobbyRooms,
    },
    {
        name: "kice_arena_rooms_partially_disconnected",
        help: "Active rooms where at least one, but not all, tracked players are disconnected.",
        value: summary.partiallyDisconnectedRooms,
    },
    {
        name: "kice_arena_rooms_zombie_playing",
        help: "Playing rooms with no connected players. This is usually a stale game-session signal.",
        value: summary.zombiePlayingRooms,
    },
    {
        name: "kice_arena_rooms_player_count_mismatch",
        help: "Rooms whose connected player count is negative, exceeds total players, or total players is negative.",
        value: summary.playerCountMismatchRooms,
    },
    {
        name: "kice_arena_rooms_expiring_soon",
        help: "Rooms whose finish or cleanup deadline is inside the expiringSoonMs window.",
        value: summary.expiringSoonRooms,
    },
    {
        name: "kice_arena_rooms_expired",
        help: "Rooms whose finish or cleanup deadline has passed but are still present in memory.",
        value: summary.expiredRooms,
    },
    {
        name: "kice_arena_room_expiry_overdue_seconds",
        help: "How long expired rooms have remained in memory after their deadline.",
        labels: { stat: "avg" },
        value: summary.roomExpiryOverdueSeconds.avg,
    },
    {
        name: "kice_arena_room_expiry_overdue_seconds",
        help: "How long expired rooms have remained in memory after their deadline.",
        labels: { stat: "max" },
        value: summary.roomExpiryOverdueSeconds.max,
    },
    {
        name: "kice_arena_room_disconnect_risk_score",
        help: "Weighted active-room disconnect risk score. Value range: 0..1.",
        value: summary.roomDisconnectRiskScore,
    },
    {
        name: "kice_arena_room_cleanup_pressure_score",
        help: "Weighted room cleanup pressure score. Value range: 0..1.",
        value: summary.roomCleanupPressureScore,
    },
    {
        name: "kice_arena_contests_active",
        help: "Distinct contest events with at least one non-finished participant session.",
        value: summary.contestCount,
    },
    ...Object.entries(summary.contestSessionsByStatus).flatMap(([eventId, counts]) =>
        (["lobby", "playing", "finished"] as const).map((status) => ({
            name: "kice_arena_contest_sessions",
            help: "Contest participant sessions by event and room status.",
            labels: { event_id: eventId, status },
            value: counts[status],
        })),
    ),
    ...Object.entries(summary.contestParticipantsByState).flatMap(([eventId, counts]) =>
        (["total", "connected", "disconnected"] as const).map((state) => ({
            name: "kice_arena_contest_participants",
            help: "Contest participants by event and connection state.",
            labels: { event_id: eventId, state },
            value: counts[state],
        })),
    ),
];

export const runtimeMetricSamples = (
    summary: RuntimeMetricSummary,
    options: RuntimeMetricSampleOptions = {},
): RuntimeMetricGaugeSample[] => [
    ...baseRuntimeMetricSamples(summary, options),
    ...derivedRuntimeMetricSamples(summary),
];
