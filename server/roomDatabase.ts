import type { QueryResult } from "pg";
import type { ArenaLog, ExamManifest, StandingPublic, SubmissionPublic } from "../shared/game.js";
import { ROOM_GUARDRAILS } from "../shared/game.js";
import type { PlayerState, RoomState } from "./types.js";

export interface RoomDatabase {
    query<T extends object = Record<string, unknown>>(
        text: string,
        values?: unknown[],
    ): Promise<QueryResult<T>>;
}

type PersistedPlayerState = Omit<PlayerState, "socketId" | "connected"> & {
    socketId?: string;
    socketToken?: string;
    connected?: boolean;
};

type PersistedRoomState = {
    code: string;
    hostId: string;
    examId: string;
    eventId?: string;
    mode?: RoomState["mode"];
    maxPlayers?: number;
    version?: number;
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

export type ContestSubmissionInput = {
    id: string;
    roomCode: string;
    playerId: string;
    problemId: string;
    answer: string;
    submittedAt: number;
    correct: boolean;
    scoreAwarded: number;
    penaltyMs: number;
    attempts: number;
    idempotencyKey: string;
};

export type ContestSubmissionRecord = ContestSubmissionInput & {
    sequence: number;
};

type ContestSubmissionRow = {
    id: string;
    room_code: string;
    player_id: string;
    problem_id: string;
    answer: string;
    submitted_at_ms: string;
    sequence: number;
    correct: boolean;
    score_awarded: number;
    penalty_ms: number;
    attempts: number;
    idempotency_key: string;
};

const rowToContestSubmission = (row: ContestSubmissionRow): ContestSubmissionRecord => ({
    id: row.id,
    roomCode: row.room_code,
    playerId: row.player_id,
    problemId: row.problem_id,
    answer: row.answer,
    submittedAt: Number(row.submitted_at_ms),
    sequence: Number(row.sequence),
    correct: row.correct,
    scoreAwarded: Number(row.score_awarded),
    penaltyMs: Number(row.penalty_ms),
    attempts: Number(row.attempts),
    idempotencyKey: row.idempotency_key,
});

export const contestSubmissionToPublic = (
    submission: Pick<
        ContestSubmissionRecord,
        | "problemId"
        | "answer"
        | "correct"
        | "submittedAt"
        | "scoreAwarded"
        | "penaltyMs"
        | "attempts"
    >,
): SubmissionPublic => ({
    problemId: submission.problemId,
    answer: submission.answer,
    correct: submission.correct,
    submittedAt: submission.submittedAt,
    scoreAwarded: submission.scoreAwarded,
    penaltyMs: submission.penaltyMs,
    attempts: submission.attempts,
});

export const migrateRoomState = async (db: RoomDatabase) => {
    await db.query(
        `CREATE TABLE IF NOT EXISTS room_states (
      code text PRIMARY KEY,
      exam_id text NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
      status text NOT NULL CHECK (status IN ('lobby', 'playing', 'finished')),
      state jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS room_states_status_updated_idx ON room_states(status, updated_at)",
    );
    await db.query(
        `CREATE TABLE IF NOT EXISTS contest_submissions (
      id text PRIMARY KEY,
      room_code text NOT NULL,
      player_id text NOT NULL,
      problem_id text NOT NULL,
      answer text NOT NULL,
      submitted_at timestamptz NOT NULL,
      submitted_at_ms bigint NOT NULL,
      sequence integer NOT NULL,
      correct boolean NOT NULL,
      score_awarded integer NOT NULL,
      penalty_ms integer NOT NULL,
      attempts integer NOT NULL,
      idempotency_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (room_code, sequence),
      UNIQUE (room_code, player_id, idempotency_key)
    )`,
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS contest_submissions_room_player_idx ON contest_submissions(room_code, player_id, sequence)",
    );
};

export const serializeRoomState = (room: RoomState): PersistedRoomState => ({
    code: room.code,
    hostId: room.hostId,
    examId: room.exam.id,
    eventId: room.eventId,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    version: room.version,
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
        connected: false,
    })),
    logs: room.logs,
    createdAt: room.createdAt,
    lastActivityAt: room.lastActivityAt,
});

export const deserializeRoomState = (state: PersistedRoomState, exam: ExamManifest): RoomState => ({
    code: state.code,
    hostId: state.hostId,
    exam,
    eventId: state.eventId,
    mode: state.mode ?? "casual",
    maxPlayers: state.maxPlayers ?? ROOM_GUARDRAILS.maxPlayersPerRoom,
    version: state.version ?? 0,
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
                socketToken: player.socketToken ?? "",
                connected: player.connected === true,
            },
        ]),
    ),
    logs: state.logs,
    createdAt: state.createdAt,
    lastActivityAt: state.lastActivityAt,
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
        [room.code, room.exam.id, room.status, JSON.stringify(state), room.createdAt],
    );
};

export const deleteRoomState = async (db: RoomDatabase, code: string) => {
    await db.query("DELETE FROM contest_submissions WHERE room_code = $1", [code]);
    await db.query("DELETE FROM room_states WHERE code = $1", [code]);
};

export const readRoomStates = async (
    db: RoomDatabase,
    examsById: Map<string, ExamManifest>,
): Promise<RoomState[]> => {
    const result = await db.query<RoomRow>(
        `SELECT code, exam_id, state
     FROM room_states
     ORDER BY updated_at ASC`,
    );

    return result.rows.flatMap((row) => {
        const exam = examsById.get(row.exam_id);
        if (!exam) return [];
        return [deserializeRoomState(row.state, exam)];
    });
};

export const readRoomState = async (
    db: RoomDatabase,
    code: string,
    examsById: Map<string, ExamManifest>,
): Promise<RoomState | null> => {
    const result = await db.query<RoomRow>(
        `SELECT code, exam_id, state
     FROM room_states
     WHERE code = $1`,
        [code],
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
     ORDER BY updated_at ASC`,
    );
    return result.rows.map((row) => row.code);
};

export const countActiveRoomStates = async (db: RoomDatabase): Promise<number> => {
    const result = await db.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM room_states WHERE status <> 'finished'",
    );
    return Number(result.rows[0]?.count ?? 0);
};

export const saveContestSubmission = async (
    db: RoomDatabase,
    input: ContestSubmissionInput,
): Promise<{ submission: ContestSubmissionRecord; reused: boolean }> => {
    const inserted = await db.query<ContestSubmissionRow>(
        `WITH next_sequence AS (
       SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
       FROM contest_submissions
       WHERE room_code = $2
     )
     INSERT INTO contest_submissions (
       id, room_code, player_id, problem_id, answer, submitted_at, submitted_at_ms,
       sequence, correct, score_awarded, penalty_ms, attempts, idempotency_key
     )
     SELECT $1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $6, next_sequence.sequence, $7, $8, $9, $10, $11
     FROM next_sequence
     ON CONFLICT (room_code, player_id, idempotency_key) DO NOTHING
     RETURNING id, room_code, player_id, problem_id, answer, submitted_at_ms::text, sequence, correct, score_awarded, penalty_ms, attempts, idempotency_key`,
        [
            input.id,
            input.roomCode,
            input.playerId,
            input.problemId,
            input.answer,
            input.submittedAt,
            input.correct,
            input.scoreAwarded,
            input.penaltyMs,
            input.attempts,
            input.idempotencyKey,
        ],
    );

    const insertedSubmission = inserted.rows[0];
    if (insertedSubmission)
        return { submission: rowToContestSubmission(insertedSubmission), reused: false };

    const existingSubmission = await readContestSubmissionByIdempotency(
        db,
        input.roomCode,
        input.playerId,
        input.idempotencyKey,
    );
    if (existingSubmission) return { submission: existingSubmission, reused: true };
    throw new Error("Unable to save contest submission.");
};

export const readContestSubmissionByIdempotency = async (
    db: RoomDatabase,
    roomCode: string,
    playerId: string,
    idempotencyKey: string,
): Promise<ContestSubmissionRecord | null> => {
    const existing = await db.query<ContestSubmissionRow>(
        `SELECT id, room_code, player_id, problem_id, answer, submitted_at_ms::text, sequence, correct, score_awarded, penalty_ms, attempts, idempotency_key
     FROM contest_submissions
     WHERE room_code = $1 AND player_id = $2 AND idempotency_key = $3`,
        [roomCode, playerId, idempotencyKey],
    );
    return existing.rows[0] ? rowToContestSubmission(existing.rows[0]) : null;
};
