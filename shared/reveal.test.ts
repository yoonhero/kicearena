import { describe, expect, it } from "vitest";
import type { PlayerPublic, RoomPublic, StandingPublic } from "./game.js";
import { makeScoreboardRevealState } from "./reveal.js";

const frozenAt = 1_000;

const player = (overrides: Partial<PlayerPublic>): PlayerPublic => ({
  id: "player",
  nickname: "Player",
  score: 0,
  penaltyMs: 0,
  scoreBreakdown: { solved: 0, timeBonus: 0, difficultyBonus: 0 },
  ready: true,
  currentProblemId: "p1",
  consecutiveWrong: 0,
  inventory: [],
  itemCooldowns: {},
  effects: [],
  expiredEffects: [],
  submissions: [],
  submissionHistory: [],
  connected: true,
  ...overrides
});

const frozenStanding = (overrides: Partial<StandingPublic>): StandingPublic => ({
  playerId: "player",
  nickname: "Player",
  score: 0,
  penaltyMs: 0,
  solved: 0,
  lastAcceptedAt: null,
  ...overrides
});

const room = (overrides: Partial<RoomPublic>): RoomPublic => ({
  code: "ROOM1",
  hostId: "host",
  exam: {
    id: "exam",
    title: "Exam",
    subtitle: "Mock",
    timeLimitSec: 600,
    problemCount: 1,
    problems: [{ id: "p1", number: 1, title: "P1", answerKind: "short", difficulty: 1, pointValue: 2 }]
  },
  mode: "contest",
  maxPlayers: 200,
  version: 1,
  status: "finished",
  timeLimitSec: 600,
  freezeBeforeSec: 60,
  itemEnabled: false,
  startedAt: 0,
  endsAt: 10_000,
  scoreboardFrozen: false,
  scoreboardFrozenAt: frozenAt,
  frozenStandings: [],
  scoreboardRevealCount: 0,
  players: [],
  logs: [],
  ...overrides
});

describe("scoreboard reveal", () => {
  it("keeps late joiners out of the frozen reveal board", () => {
    const state = makeScoreboardRevealState(
      room({
        frozenStandings: [frozenStanding({ playerId: "host", nickname: "Host" })],
        players: [
          player({ id: "host", nickname: "Host" }),
          player({
            id: "late",
            nickname: "Late",
            submissionHistory: [{ problemId: "p1", answer: "1", correct: true, submittedAt: frozenAt + 1_000, scoreAwarded: 2, penaltyMs: 60_000, attempts: 1 }]
          })
        ]
      })
    );

    expect(state.rows.map((row) => row.playerId)).toEqual(["host"]);
    expect(state.events).toEqual([]);
  });
});
