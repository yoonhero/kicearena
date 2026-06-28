import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";
import { runtimeMetricSamples } from "../shared/runtimeMetricSamples.js";
import { summarizeRoomMetrics, type RoomTtlConfig } from "../shared/runtimeMetrics.js";
import type { RoomState } from "./types.js";

export const createServerMetrics = () => {
    const registry = new Registry();
    collectDefaultMetrics({
        register: registry,
        prefix: "kice_arena_",
    });

    const runtimeMetricsInfoGauge = new Gauge({
        name: "kice_arena_runtime_metrics_info",
        help: "Stable heartbeat emitted by the KICE 아레나 runtime metrics collector.",
        labelNames: ["service"],
        registers: [registry],
    });
    const runtimeMetricsLastSuccessGauge = new Gauge({
        name: "kice_arena_runtime_metrics_last_success_unixtime",
        help: "Unix timestamp of the most recent successful runtime metrics collection.",
        labelNames: ["service"],
        registers: [registry],
    });
    const roomsTotalGauge = new Gauge({
        name: "kice_arena_rooms_total",
        help: "Current total rooms held in memory.",
        registers: [registry],
    });
    const activeRoomsGauge = new Gauge({
        name: "kice_arena_rooms_active",
        help: "Current rooms that are not finished.",
        registers: [registry],
    });
    const roomsByStatusGauge = new Gauge({
        name: "kice_arena_rooms_by_status",
        help: "Current rooms grouped by status.",
        labelNames: ["status"],
        registers: [registry],
    });
    const roomExpirySecondsGauge = new Gauge({
        name: "kice_arena_room_expiry_seconds",
        help: "Seconds until rooms finish or become eligible for cleanup.",
        labelNames: ["stat"],
        registers: [registry],
    });
    const playingRoomTimeRemainingSecondsGauge = new Gauge({
        name: "kice_arena_playing_room_time_remaining_seconds",
        help: "Seconds until playing rooms naturally finish.",
        labelNames: ["stat"],
        registers: [registry],
    });
    const playersGauge = new Gauge({
        name: "kice_arena_players",
        help: "Current player counts.",
        labelNames: ["state"],
        registers: [registry],
    });
    const runtimeMetricGauges = new Map<string, Gauge<string>>([
        ["kice_arena_runtime_metrics_info", runtimeMetricsInfoGauge],
        ["kice_arena_runtime_metrics_last_success_unixtime", runtimeMetricsLastSuccessGauge],
        ["kice_arena_rooms_total", roomsTotalGauge],
        ["kice_arena_rooms_active", activeRoomsGauge],
        ["kice_arena_rooms_by_status", roomsByStatusGauge],
        ["kice_arena_room_expiry_seconds", roomExpirySecondsGauge],
        ["kice_arena_playing_room_time_remaining_seconds", playingRoomTimeRemainingSecondsGauge],
        ["kice_arena_players", playersGauge],
        [
            "kice_arena_players_disconnected_ratio",
            new Gauge({
                name: "kice_arena_players_disconnected_ratio",
                help: "Share of tracked players that are currently disconnected. Value range: 0..1.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_players_per_active_room",
            new Gauge({
                name: "kice_arena_players_per_active_room",
                help: "Average players per non-finished room by player state.",
                labelNames: ["state"],
                registers: [registry],
            }),
        ],
        [
            "kice_arena_rooms_empty_lobby",
            new Gauge({
                name: "kice_arena_rooms_empty_lobby",
                help: "Lobby rooms with no tracked players. High values point to lobby cleanup pressure.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_rooms_disconnected_lobby",
            new Gauge({
                name: "kice_arena_rooms_disconnected_lobby",
                help: "Lobby rooms that still have tracked players but no connected players.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_rooms_partially_disconnected",
            new Gauge({
                name: "kice_arena_rooms_partially_disconnected",
                help: "Active rooms where at least one, but not all, tracked players are disconnected.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_rooms_zombie_playing",
            new Gauge({
                name: "kice_arena_rooms_zombie_playing",
                help: "Playing rooms with no connected players. This is usually a stale game-session signal.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_rooms_player_count_mismatch",
            new Gauge({
                name: "kice_arena_rooms_player_count_mismatch",
                help: "Rooms whose connected player count is negative, exceeds total players, or total players is negative.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_rooms_expiring_soon",
            new Gauge({
                name: "kice_arena_rooms_expiring_soon",
                help: "Rooms whose finish or cleanup deadline is inside the expiringSoonMs window.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_rooms_expired",
            new Gauge({
                name: "kice_arena_rooms_expired",
                help: "Rooms whose finish or cleanup deadline has passed but are still present in memory.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_room_expiry_overdue_seconds",
            new Gauge({
                name: "kice_arena_room_expiry_overdue_seconds",
                help: "How long expired rooms have remained in memory after their deadline.",
                labelNames: ["stat"],
                registers: [registry],
            }),
        ],
        [
            "kice_arena_room_disconnect_risk_score",
            new Gauge({
                name: "kice_arena_room_disconnect_risk_score",
                help: "Weighted active-room disconnect risk score. Value range: 0..1.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_room_cleanup_pressure_score",
            new Gauge({
                name: "kice_arena_room_cleanup_pressure_score",
                help: "Weighted room cleanup pressure score. Value range: 0..1.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_contests_active",
            new Gauge({
                name: "kice_arena_contests_active",
                help: "Distinct contest events with at least one non-finished participant session.",
                registers: [registry],
            }),
        ],
        [
            "kice_arena_contest_sessions",
            new Gauge({
                name: "kice_arena_contest_sessions",
                help: "Contest participant sessions by event and room status.",
                labelNames: ["event_id", "status"],
                registers: [registry],
            }),
        ],
        [
            "kice_arena_contest_participants",
            new Gauge({
                name: "kice_arena_contest_participants",
                help: "Contest participants by event and connection state.",
                labelNames: ["event_id", "state"],
                registers: [registry],
            }),
        ],
    ]);
    const socketConnectionsGauge = new Gauge({
        name: "kice_arena_socket_connections",
        help: "Current Socket.IO connections.",
        registers: [registry],
    });
    const registeredSocketConnectionsGauge = new Gauge({
        name: "kice_arena_registered_socket_connections",
        help: "Current Socket.IO connections associated with a tracked room player.",
        registers: [registry],
    });

    return {
        registry,
        roomsCreatedCounter: new Counter({
            name: "kice_arena_rooms_created_total",
            help: "Total rooms created since server start.",
            registers: [registry],
        }),
        playersJoinedCounter: new Counter({
            name: "kice_arena_players_joined_total",
            help: "Total non-host players joined since server start.",
            registers: [registry],
        }),
        answersSubmittedCounter: new Counter({
            name: "kice_arena_answers_submitted_total",
            help: "Total answer submissions since server start, labeled by correctness.",
            labelNames: ["correct"],
            registers: [registry],
        }),
        contestSubmissionsCounter: new Counter({
            name: "kice_arena_contest_submissions_total",
            help: "Total contest answer submissions since server start, labeled by event and correctness.",
            labelNames: ["event_id", "correct"],
            registers: [registry],
        }),
        httpRequestDurationSeconds: new Histogram({
            name: "kice_arena_http_request_duration_seconds",
            help: "HTTP request duration in seconds.",
            labelNames: ["method", "path", "status"],
            buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
            registers: [registry],
        }),
        updateRuntimeMetrics: ({
            rooms,
            connectedSocketCount,
            registeredSocketCount,
            roomTtl,
        }: {
            rooms: RoomState[];
            connectedSocketCount: number;
            registeredSocketCount: number;
            roomTtl: RoomTtlConfig;
        }) => {
            const now = Date.now();
            const summary = summarizeRoomMetrics(
                rooms.map((room) => ({
                    status: room.status,
                    mode: room.mode,
                    eventId: room.exam.id,
                    endsAt: room.endsAt,
                    createdAt: room.createdAt,
                    lastActivityAt: room.lastActivityAt,
                    playerCount: room.players.size,
                    connectedPlayerCount: [...room.players.values()].filter(
                        (player) => player.connected,
                    ).length,
                })),
                now,
                roomTtl,
            );

            for (const gauge of runtimeMetricGauges.values()) gauge.reset();
            for (const sample of runtimeMetricSamples(summary, { collectedAtMs: now })) {
                const gauge = runtimeMetricGauges.get(sample.name);
                if (!gauge) continue;
                if (sample.labels) gauge.set(sample.labels, sample.value);
                else gauge.set(sample.value);
            }

            socketConnectionsGauge.set(connectedSocketCount);
            registeredSocketConnectionsGauge.set(registeredSocketCount);
        },
    };
};
