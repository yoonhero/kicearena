import type { RuntimeMetricSummary } from "./runtimeMetrics.js";

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

const DEFAULT_SERVICE = "kice-arena";

const sampleOptions = (options: RuntimeMetricSampleOptions = {}) => ({
    collectedAtMs: options.collectedAtMs ?? Date.now(),
    service: options.service ?? DEFAULT_SERVICE,
});

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
