import { describe, expect, it } from "vitest";
import {
  baseRuntimeMetricSamples,
  derivedRuntimeMetricSamples,
  runtimeMetricSamples,
  summarizeRoomMetrics,
  type RoomMetricInput,
  type RoomTtlConfig
} from "./runtimeMetrics.js";

const ttl: RoomTtlConfig = {
  emptyLobbyMs: 10 * 60 * 1000,
  disconnectedLobbyMs: 30 * 60 * 1000,
  finishedMs: 30 * 60 * 1000
};

const now = 1_000_000;

const room = (overrides: Partial<RoomMetricInput>): RoomMetricInput => ({
  mode: "casual",
  eventId: "preliminary-day",
  status: "lobby",
  endsAt: null,
  createdAt: now,
  lastActivityAt: now,
  playerCount: 0,
  connectedPlayerCount: 0,
  ...overrides
});

const sampleValue = (samples: ReturnType<typeof runtimeMetricSamples>, name: string, labels?: Record<string, string>) => {
  const labelEntries = Object.entries(labels ?? {});
  const sample = samples.find(
    (candidate) =>
      candidate.name === name &&
      labelEntries.every(([key, value]) => candidate.labels?.[key] === value) &&
      Object.keys(candidate.labels ?? {}).length === labelEntries.length
  );
  if (!sample) throw new Error(`Missing metric sample ${name}`);
  return sample.value;
};

const metricValue = (name: string, labels?: Record<string, string>) => {
  return (summary: ReturnType<typeof summarizeRoomMetrics>) => sampleValue(runtimeMetricSamples(summary), name, labels);
};

describe("summarizeRoomMetrics", () => {
  it("counts a playing room's remaining game time as room expiry time", () => {
    const summary = summarizeRoomMetrics(
      [
        room({
          status: "playing",
          endsAt: now + 60_000,
          playerCount: 2,
          connectedPlayerCount: 2
        })
      ],
      now,
      ttl
    );

    expect(summary.roomCount).toBe(1);
    expect(summary.activeRoomCount).toBe(1);
    expect(summary.statusCounts.playing).toBe(1);
    expect(summary.totalPlayers).toBe(2);
    expect(summary.connectedPlayers).toBe(2);
    expect(summary.roomExpirySeconds).toEqual({ avg: 60, max: 60 });
    expect(summary.roomExpiryOverdueSeconds).toEqual({ avg: 0, max: 0 });
    expect(summary.playingRoomTimeRemainingSeconds).toEqual({ avg: 60, max: 60 });
    expect(summary.playersPerActiveRoom).toEqual({ total: 2, connected: 2 });
    expect(summary.expiringSoonRooms).toBe(1);
    expect(summary.roomDisconnectRiskScore).toBe(0);
    expect(summary.roomCleanupPressureScore).toBe(0.25);
  });

  it("combines playing finish deadlines and cleanup deadlines for avg/max room expiry", () => {
    const summary = summarizeRoomMetrics(
      [
        room({
          status: "playing",
          endsAt: now + 60_000,
          playerCount: 1,
          connectedPlayerCount: 1
        }),
        room({
          status: "finished",
          lastActivityAt: now,
          playerCount: 2,
          connectedPlayerCount: 0
        }),
        room({
          status: "lobby",
          createdAt: now,
          playerCount: 0,
          connectedPlayerCount: 0
        })
      ],
      now,
      ttl
    );

    expect(summary.statusCounts).toEqual({ lobby: 1, playing: 1, finished: 1 });
    expect(summary.activeRoomCount).toBe(2);
    expect(summary.totalPlayers).toBe(3);
    expect(summary.connectedPlayers).toBe(1);
    expect(summary.disconnectedPlayers).toBe(2);
    expect(summary.disconnectedPlayerRatio).toBeCloseTo(2 / 3);
    expect(summary.playersPerActiveRoom).toEqual({ total: 1.5, connected: 0.5 });
    expect(summary.emptyLobbyRooms).toBe(1);
    expect(summary.disconnectedLobbyRooms).toBe(0);
    expect(summary.roomExpirySeconds).toEqual({ avg: 820, max: 1800 });
    expect(summary.roomExpiryOverdueSeconds).toEqual({ avg: 0, max: 0 });
    expect(summary.playingRoomTimeRemainingSeconds).toEqual({ avg: 60, max: 60 });
    expect(metricValue("kice_arena_players_disconnected_ratio")(summary)).toBeCloseTo(2 / 3);
    expect(metricValue("kice_arena_players_per_active_room", { state: "connected" })(summary)).toBe(0.5);
  });

  it("does not invent an expiry deadline for a connected lobby room", () => {
    const summary = summarizeRoomMetrics(
      [
        room({
          status: "lobby",
          playerCount: 2,
          connectedPlayerCount: 1
        })
      ],
      now,
      ttl
    );

    expect(summary.roomExpirySeconds).toEqual({ avg: 0, max: 0 });
    expect(summary.roomExpiryOverdueSeconds).toEqual({ avg: 0, max: 0 });
    expect(summary.playingRoomTimeRemainingSeconds).toEqual({ avg: 0, max: 0 });
    expect(summary.partiallyDisconnectedRooms).toBe(1);
    expect(summary.roomDisconnectRiskScore).toBeCloseTo(0.3);
  });

  it("surfaces stale rooms that should already have been cleaned up", () => {
    const summary = summarizeRoomMetrics(
      [
        room({
          status: "lobby",
          createdAt: now - ttl.emptyLobbyMs - 5_000,
          playerCount: 0,
          connectedPlayerCount: 0
        }),
        room({
          status: "playing",
          endsAt: now - 15_000,
          playerCount: 2,
          connectedPlayerCount: 0
        })
      ],
      now,
      ttl
    );

    expect(summary.expiredRooms).toBe(2);
    expect(summary.expiringSoonRooms).toBe(0);
    expect(summary.roomExpirySeconds).toEqual({ avg: 0, max: 0 });
    expect(summary.roomExpiryOverdueSeconds).toEqual({ avg: 10, max: 15 });
    expect(summary.zombiePlayingRooms).toBe(1);
    expect(summary.roomDisconnectRiskScore).toBeCloseTo(0.5);
    expect(summary.roomCleanupPressureScore).toBe(1);
    expect(metricValue("kice_arena_rooms_expired")(summary)).toBe(2);
    expect(metricValue("kice_arena_room_expiry_overdue_seconds", { stat: "max" })(summary)).toBe(15);
  });

  it("tracks disconnected lobby rooms, partial disconnects, and player count mismatches", () => {
    const summary = summarizeRoomMetrics(
      [
        room({
          status: "lobby",
          playerCount: 2,
          connectedPlayerCount: 0
        }),
        room({
          status: "playing",
          endsAt: now + 5 * 60_000,
          playerCount: 4,
          connectedPlayerCount: 3
        }),
        room({
          status: "playing",
          endsAt: now + 5 * 60_000,
          playerCount: 1,
          connectedPlayerCount: 2
        })
      ],
      now,
      ttl
    );

    expect(summary.disconnectedLobbyRooms).toBe(1);
    expect(summary.partiallyDisconnectedRooms).toBe(1);
    expect(summary.playerCountMismatchRooms).toBe(1);
    expect(summary.disconnectedPlayers).toBe(2);
    expect(summary.roomDisconnectRiskScore).toBeCloseTo((0.7 + 0.3) / 3);
    expect(metricValue("kice_arena_rooms_disconnected_lobby")(summary)).toBe(1);
    expect(metricValue("kice_arena_rooms_player_count_mismatch")(summary)).toBe(1);
  });
});

describe("runtimeMetricSamples", () => {
  it("always emits base room metrics and heartbeat samples, even when there are no rooms", () => {
    const summary = summarizeRoomMetrics([], now, ttl);
    const samples = runtimeMetricSamples(summary, { collectedAtMs: now, service: "kice-arena-test" });

    expect(sampleValue(samples, "kice_arena_runtime_metrics_info", { service: "kice-arena-test" })).toBe(1);
    expect(sampleValue(samples, "kice_arena_runtime_metrics_last_success_unixtime", { service: "kice-arena-test" })).toBe(1000);
    expect(sampleValue(samples, "kice_arena_rooms_total")).toBe(0);
    expect(sampleValue(samples, "kice_arena_rooms_active")).toBe(0);
    expect(sampleValue(samples, "kice_arena_rooms_by_status", { status: "lobby" })).toBe(0);
    expect(sampleValue(samples, "kice_arena_players", { state: "connected" })).toBe(0);
  });

  it("keeps base and derived sample groups available separately", () => {
    const summary = summarizeRoomMetrics(
      [
        room({
          status: "playing",
          endsAt: now + 60_000,
          playerCount: 2,
          connectedPlayerCount: 1
        })
      ],
      now,
      ttl
    );

    expect(baseRuntimeMetricSamples(summary).some((sample) => sample.name === "kice_arena_rooms_active")).toBe(true);
    expect(derivedRuntimeMetricSamples(summary).some((sample) => sample.name === "kice_arena_rooms_active")).toBe(false);
    expect(runtimeMetricSamples(summary).some((sample) => sample.name === "kice_arena_rooms_active")).toBe(true);
    expect(runtimeMetricSamples(summary).some((sample) => sample.name === "kice_arena_room_disconnect_risk_score")).toBe(true);
  });

  it("emits contest event metrics separately from casual room metrics", () => {
    const summary = summarizeRoomMetrics(
      [
        room({
          mode: "contest",
          eventId: "preliminary-day",
          status: "playing",
          endsAt: now + 60_000,
          playerCount: 2,
          connectedPlayerCount: 1
        }),
        room({
          mode: "contest",
          eventId: "preliminary-day",
          status: "lobby",
          playerCount: 1,
          connectedPlayerCount: 1
        }),
        room({
          mode: "casual",
          eventId: "problemset-later",
          playerCount: 3,
          connectedPlayerCount: 3
        })
      ],
      now,
      ttl
    );

    const samples = runtimeMetricSamples(summary);
    expect(sampleValue(samples, "kice_arena_contests_active")).toBe(1);
    expect(sampleValue(samples, "kice_arena_contest_sessions", { event_id: "preliminary-day", status: "playing" })).toBe(1);
    expect(sampleValue(samples, "kice_arena_contest_sessions", { event_id: "preliminary-day", status: "lobby" })).toBe(1);
    expect(sampleValue(samples, "kice_arena_contest_participants", { event_id: "preliminary-day", state: "total" })).toBe(3);
    expect(sampleValue(samples, "kice_arena_contest_participants", { event_id: "preliminary-day", state: "connected" })).toBe(2);
    expect(sampleValue(samples, "kice_arena_contest_participants", { event_id: "preliminary-day", state: "disconnected" })).toBe(1);
  });
});
