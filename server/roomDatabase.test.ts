import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll } from "vitest";
import type { ExamManifest } from "../shared/game.js";
import type { PlayerState, RoomState } from "./types.js";
import { migrateExamCatalog, seedExamCatalog } from "./examDatabase.js";
import { deleteRoomState, deserializeRoomState, migrateRoomState, readRoomState, saveRoomState, serializeRoomState } from "./roomDatabase.js";

const exam: ExamManifest = {
  id: "persisted-exam",
  title: "Persisted Exam",
  subtitle: "Room state",
  timeLimitSec: 600,
  problems: [{ id: "p1", number: 1, title: "P1", answerKind: "short", answer: "1", difficulty: 1 }]
};

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: "player",
  socketId: "socket-1",
  nickname: "민재",
  score: 4,
  penaltyMs: 0,
  scoreBreakdown: { solved: 1, timeBonus: 0, difficultyBonus: 0 },
  ready: true,
  currentProblemId: "p1",
  consecutiveWrong: 0,
  inventory: ["cover"],
  itemCooldowns: {},
  effects: [],
  expiredEffects: [],
  submissions: [{ problemId: "p1", answer: "1", correct: true, submittedAt: 1000, scoreAwarded: 4, penaltyMs: 0, attempts: 1 }],
  submissionHistory: [{ problemId: "p1", answer: "1", correct: true, submittedAt: 1000, scoreAwarded: 4, penaltyMs: 0, attempts: 1 }],
  connected: true,
  ...overrides
});

const room = (): RoomState => ({
  code: "ABCDE",
  hostId: "player",
  exam,
  status: "playing",
  timeLimitSec: 600,
  freezeBeforeSec: 60,
  itemEnabled: true,
  startedAt: 1000,
  endsAt: 601000,
  scoreboardFrozenAt: 541000,
  frozenStandings: [],
  scoreboardRevealCount: 0,
  players: new Map([["player", player()]]),
  logs: [{ id: "log", kind: "system", message: "started", createdAt: 1000 }],
  createdAt: 900,
  lastActivityAt: 1000
});

describe("room state persistence", () => {
  it("round-trips game state while dropping process-local socket ids", () => {
    const serialized = serializeRoomState(room());
    expect(serialized.players[0]).toMatchObject({
      id: "player",
      socketId: "",
      connected: false,
      submissions: [{ problemId: "p1", correct: true }]
    });

    const restored = deserializeRoomState(serialized, exam);
    expect(restored).toMatchObject({
      code: "ABCDE",
      hostId: "player",
      status: "playing",
      startedAt: 1000,
      endsAt: 601000
    });
    expect(restored.players.get("player")).toMatchObject({
      nickname: "민재",
      socketId: "",
      connected: false,
      inventory: ["cover"],
      submissions: [{ problemId: "p1", correct: true }]
    });
  });
});

const dbTestUrl = process.env.KICE_DB_TEST_URL?.trim();
const describePostgres = dbTestUrl ? describe : describe.skip;

describePostgres("postgres room state persistence", () => {
  let adminPool: Pool;
  let pool: Pool;
  let schemaName: string;

  beforeAll(async () => {
    schemaName = `kice_room_test_${randomUUID().replaceAll("-", "_")}`;
    adminPool = new Pool({ connectionString: dbTestUrl! });
    await adminPool.query(`CREATE SCHEMA ${schemaName}`);
    pool = new Pool({ connectionString: dbTestUrl!, options: `-c search_path=${schemaName}` });
    await migrateExamCatalog(pool);
    await seedExamCatalog(pool, [exam], new Set([exam.id]));
    await migrateRoomState(pool);
  });

  afterAll(async () => {
    await pool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      await adminPool.end();
    }
  });

  it("saves, reads, and deletes room snapshots", async () => {
    const original = room();
    await saveRoomState(pool, original);

    const restored = await readRoomState(pool, original.code, new Map([[exam.id, exam]]));
    expect(restored).toMatchObject({
      code: original.code,
      hostId: original.hostId,
      status: "playing",
      startedAt: original.startedAt
    });
    expect(restored?.players.get("player")).toMatchObject({
      nickname: "민재",
      connected: false,
      socketId: ""
    });

    await deleteRoomState(pool, original.code);
    await expect(readRoomState(pool, original.code, new Map([[exam.id, exam]]))).resolves.toBeNull();
  });
});
