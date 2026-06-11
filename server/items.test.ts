import { describe, expect, it } from "vitest";
import type { ExamManifest } from "../shared/game.js";
import { cleanupEffects, findAdviceNoteProblem, maybeAwardItems, validateItemTarget } from "./items.js";
import type { PlayerState, RoomState } from "./types.js";

const now = 1_000_000;
const exam: ExamManifest = {
  id: "mock",
  title: "Mock",
  subtitle: "Mock",
  timeLimitSec: 600,
  problems: [
    { id: "p1", number: 1, title: "P1", answerKind: "short", answer: "1", difficulty: 5, image: "p1.png" },
    { id: "p2", number: 2, title: "P2", answerKind: "short", answer: "2", difficulty: 1, image: "p2.png" }
  ]
};

const player = (overrides: Partial<PlayerState>): PlayerState => ({
  id: "player",
  socketId: "socket",
  socketToken: "socket-token",
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

const room = (players: PlayerState[], overrides: Partial<RoomState> = {}): RoomState => ({
  code: "ROOM1",
  hostId: players[0]?.id ?? "host",
  exam,
  mode: "casual",
  maxPlayers: 60,
  version: 0,
  status: "playing",
  timeLimitSec: 600,
  freezeBeforeSec: 60,
  itemEnabled: true,
  startedAt: now,
  endsAt: now + 600_000,
  scoreboardFrozenAt: null,
  frozenStandings: [],
  scoreboardRevealCount: 0,
  players: new Map(players.map((entry) => [entry.id, entry])),
  logs: [],
  createdAt: now,
  lastActivityAt: now,
  ...overrides
});

describe("server items", () => {
  it("moves expired item effects to the short-lived expired list and clears cooldowns", () => {
    const target = player({
      effects: [
        { id: "cover", label: "Cover", sourceName: "A", expiresAt: now - 1 },
        { id: "blur", label: "Blur", sourceName: "A", expiresAt: now - 1 },
        { id: "penLock", label: "Pen", sourceName: "A", expiresAt: now + 1 }
      ],
      itemCooldowns: { cover: now - 1, penLock: now + 1000 }
    });

    expect(cleanupEffects(room([target]), now)).toBe(true);
    expect(target.effects.map((effect) => effect.id)).toEqual(["penLock"]);
    expect(target.expiredEffects.map((effect) => effect.id)).toEqual(["cover"]);
    expect(target.itemCooldowns).toEqual({ penLock: now + 1000 });
  });

  it("requires an advice-note problem that sender solved and target has not solved", () => {
    const sender = player({
      id: "sender",
      submissionHistory: [{ problemId: "p1", answer: "1", correct: true, submittedAt: now, scoreAwarded: 4, penaltyMs: 0, attempts: 1 }]
    });
    const target = player({ id: "target" });

    expect(findAdviceNoteProblem(room([sender, target]), sender, target)?.id).toBe("p1");
    expect(validateItemTarget(room([sender, target]), "adviceNote", sender, target)).toEqual({ ok: true });
  });

  it("blocks self-targeting and duplicate active disruptor effects", () => {
    const sender = player({ id: "sender" });
    const target = player({ id: "target", effects: [{ id: "cover", label: "Cover", sourceName: "A", expiresAt: now + 1000 }] });

    expect(validateItemTarget(room([sender, target]), "cover", sender, sender, now).ok).toBe(false);
    expect(validateItemTarget(room([sender, target]), "cover", sender, target, now).ok).toBe(false);
  });

  it("awards deterministic items when chance rolls pass", () => {
    const sender = player({ id: "sender", score: 0 });
    const leader = player({ id: "leader", score: 300 });
    const rolls = [0.01, 0, 0.01, 0.2];
    const awards = maybeAwardItems(room([sender, leader]), sender, exam.problems[0], 1, () => rolls.shift() ?? 1);

    expect(awards).toEqual([
      { itemId: "cover", reason: "comeback" },
      { itemId: "rotateProblem", reason: "firstTry" }
    ]);
  });
});
