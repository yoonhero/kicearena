import type { RoomDatabase } from "./roomDatabase.js";

export type ProblemAttemptRecordInput = {
    id: string;
    roomCode: string;
    roomMode: string;
    eventId: string | null;
    examId: string;
    playerId: string;
    playerNickname: string;
    problemId: string;
    problemNumber: number;
    problemTitle: string;
    answerKind: string;
    answer: string;
    submittedAt: number;
    elapsedMs: number | null;
    correct: boolean;
    scoreAwarded: number;
    penaltyMs: number;
    attemptNumber: number;
    idempotencyKey: string;
};

export const migrateProblemAttemptRecords = async (db: RoomDatabase) => {
    await db.query(
        `CREATE TABLE IF NOT EXISTS problem_attempt_records (
      id text PRIMARY KEY,
      room_code text NOT NULL,
      room_mode text NOT NULL,
      event_id text,
      exam_id text NOT NULL,
      player_id text NOT NULL,
      player_nickname text NOT NULL,
      problem_id text NOT NULL,
      problem_number integer NOT NULL,
      problem_title text NOT NULL,
      answer_kind text NOT NULL,
      answer text NOT NULL,
      submitted_at timestamptz NOT NULL,
      submitted_at_ms bigint NOT NULL,
      elapsed_ms bigint,
      correct boolean NOT NULL,
      score_awarded integer NOT NULL,
      penalty_ms integer NOT NULL,
      attempt_number integer NOT NULL,
      idempotency_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (room_code, player_id, idempotency_key)
    )`,
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS problem_attempt_records_exam_submitted_idx ON problem_attempt_records(exam_id, submitted_at)",
    );
    await db.query(
        "CREATE INDEX IF NOT EXISTS problem_attempt_records_room_player_problem_idx ON problem_attempt_records(room_code, player_id, problem_id, submitted_at)",
    );
};

export const saveProblemAttemptRecord = async (
    db: RoomDatabase,
    input: ProblemAttemptRecordInput,
): Promise<boolean> => {
    const inserted = await db.query<{ id: string }>(
        `INSERT INTO problem_attempt_records (
       id, room_code, room_mode, event_id, exam_id, player_id, player_nickname,
       problem_id, problem_number, problem_title, answer_kind, answer,
       submitted_at, submitted_at_ms, elapsed_ms, correct, score_awarded,
       penalty_ms, attempt_number, idempotency_key
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       to_timestamp($13 / 1000.0), $13, $14, $15, $16,
       $17, $18, $19
     )
     ON CONFLICT (room_code, player_id, idempotency_key) DO NOTHING
     RETURNING id`,
        [
            input.id,
            input.roomCode,
            input.roomMode,
            input.eventId,
            input.examId,
            input.playerId,
            input.playerNickname,
            input.problemId,
            input.problemNumber,
            input.problemTitle,
            input.answerKind,
            input.answer,
            input.submittedAt,
            input.elapsedMs,
            input.correct,
            input.scoreAwarded,
            input.penaltyMs,
            input.attemptNumber,
            input.idempotencyKey,
        ],
    );

    return Boolean(inserted.rows[0]);
};
