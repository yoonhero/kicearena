import type { QueryResult } from "pg";
import type { ArenaLog, ExamManifest, StandingPublic } from "../shared/game.js";
import type { PlayerState, RoomState } from "./types.js";

export interface RoomDatabase {
  query<T extends object = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

type PersistedPlayerState = Omit<PlayerState, "socketId" | "connected"> & {
  socketId?: string;
  connected?: boolean;
};

type PersistedRoomState = {
  code: string;
  hostId: string;
  examId: string;
  status: RoomState["status"];
  timeLimitSec: number;
  freezeBeforeSec: number;
  itemEnabled: boolean;
  startedAt: number | null;
  endsAt: number | null;
  scoreboardFrozenAt: number | null;
  frozenStandings: StandingPublic[];
  scoreboardRevealCount: number;
  players: PersistedPlayerState[];
  logs: ArenaLog[];
  createdAt: number;
  lastActivityAt: number;
};

type RoomRow = {
  code: string;
  exam_id: string;
  state: PersistedRoomState;
};

export const migrateRoomState = async (db: RoomDatabase) => {
  await db.query(
    `CREATE TABLE IF NOT EXISTS room_states (
      code text PRIMARY KEY,
      exam_id text NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
      status text NOT NULL CHECK (status IN ('lobby', 'playing', 'finished')),
      state jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`
  );
  await db.query("CREATE INDEX IF NOT EXISTS room_states_status_updated_idx ON room_states(status, updated_at)");
};

export const serializeRoomState = (room: RoomState): PersistedRoomState => ({
  code: room.code,
  hostId: room.hostId,
  examId: room.exam.id,
  status: room.status,
  timeLimitSec: room.timeLimitSec,
  freezeBeforeSec: room.freezeBeforeSec,
  itemEnabled: room.itemEnabled,
  startedAt: room.startedAt,
  endsAt: room.endsAt,
  scoreboardFrozenAt: room.scoreboardFrozenAt,
  frozenStandings: room.frozenStandings,
  scoreboardRevealCount: room.scoreboardRevealCount,
  players: [...room.players.values()].map(({ socketId: _socketId, ...player }) => ({
    ...player,
    socketId: "",
    connected: false
  })),
  logs: room.logs,
  createdAt: room.createdAt,
  lastActivityAt: room.lastActivityAt
});

export const deserializeRoomState = (state: PersistedRoomState, exam: ExamManifest): RoomState => ({
  code: state.code,
  hostId: state.hostId,
  exam,
  status: state.status,
  timeLimitSec: state.timeLimitSec,
  freezeBeforeSec: state.freezeBeforeSec,
  itemEnabled: state.itemEnabled,
  startedAt: state.startedAt,
  endsAt: state.endsAt,
  scoreboardFrozenAt: state.scoreboardFrozenAt,
  frozenStandings: state.frozenStandings,
  scoreboardRevealCount: state.scoreboardRevealCount,
  players: new Map(
    state.players.map((player) => [
      player.id,
      {
        ...player,
        socketId: "",
        connected: player.connected === true
      }
    ])
  ),
  logs: state.logs,
  createdAt: state.createdAt,
  lastActivityAt: state.lastActivityAt
});

export const saveRoomState = async (db: RoomDatabase, room: RoomState) => {
  const state = serializeRoomState(room);
  await db.query(
    `INSERT INTO room_states (code, exam_id, status, state, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, to_timestamp($5 / 1000.0), now())
     ON CONFLICT (code) DO UPDATE SET
       exam_id = EXCLUDED.exam_id,
       status = EXCLUDED.status,
       state = EXCLUDED.state,
       updated_at = now()`,
    [room.code, room.exam.id, room.status, JSON.stringify(state), room.createdAt]
  );
};

export const deleteRoomState = async (db: RoomDatabase, code: string) => {
  await db.query("DELETE FROM room_states WHERE code = $1", [code]);
};

export const readRoomStates = async (db: RoomDatabase, examsById: Map<string, ExamManifest>): Promise<RoomState[]> => {
  const result = await db.query<RoomRow>(
    `SELECT code, exam_id, state
     FROM room_states
     ORDER BY updated_at ASC`
  );

  return result.rows.flatMap((row) => {
    const exam = examsById.get(row.exam_id);
    if (!exam) return [];
    return [deserializeRoomState(row.state, exam)];
  });
};

export const readRoomState = async (db: RoomDatabase, code: string, examsById: Map<string, ExamManifest>): Promise<RoomState | null> => {
  const result = await db.query<RoomRow>(
    `SELECT code, exam_id, state
     FROM room_states
     WHERE code = $1`,
    [code]
  );
  const row = result.rows[0];
  if (!row) return null;
  const exam = examsById.get(row.exam_id);
  return exam ? deserializeRoomState(row.state, exam) : null;
};

export const readRoomStateCodes = async (db: RoomDatabase): Promise<string[]> => {
  const result = await db.query<{ code: string }>(
    `SELECT code
     FROM room_states
     ORDER BY updated_at ASC`
  );
  return result.rows.map((row) => row.code);
};

export const countActiveRoomStates = async (db: RoomDatabase): Promise<number> => {
  const result = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM room_states WHERE status <> 'finished'");
  return Number(result.rows[0]?.count ?? 0);
};
