import { describe, expect, it } from "vitest";
import { summarizeRoomMetrics, type RoomMetricInput, type RoomTtlConfig } from "./runtimeMetrics.js";

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
    expect(summary.playingRoomTimeRemainingSeconds).toEqual({ avg: 60, max: 60 });
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
    expect(summary.roomExpirySeconds).toEqual({ avg: 820, max: 1800 });
    expect(summary.playingRoomTimeRemainingSeconds).toEqual({ avg: 60, max: 60 });
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
    expect(summary.playingRoomTimeRemainingSeconds).toEqual({ avg: 0, max: 0 });
  });
});
