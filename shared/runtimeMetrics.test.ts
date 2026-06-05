import { describe, expect, it } from "vitest";
import {
  derivedRuntimeMetricSamples,
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
  status: "lobby",
  endsAt: null,
  createdAt: now,
  lastActivityAt: now,
  playerCount: 0,
  connectedPlayerCount: 0,
  ...overrides
});

const metricValue = (name: string, labels?: Record<string, string>) => {
  const labelEntries = Object.entries(labels ?? {});
  return (summary: ReturnType<typeof summarizeRoomMetrics>) => {
    const sample = derivedRuntimeMetricSamples(summary).find(
      (candidate) =>
        candidate.name === name &&
        labelEntries.every(([key, value]) => candidate.labels?.[key] === value) &&
        Object.keys(candidate.labels ?? {}).length === labelEntries.length
    );
    if (!sample) throw new Error(`Missing metric sample ${name}`);
    return sample.value;
  };
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
