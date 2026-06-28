import type { SubmissionPublic } from "../shared/game.js";
import type { RoomDatabase } from "./roomDatabase.js";

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

export const saveContestSubmission = async (
    db: RoomDatabase,
    input: ContestSubmissionInput,
): Promise<{ submission: ContestSubmissionRecord; reused: boolean }> => {
    const existingSubmission = await readContestSubmissionByIdempotency(
        db,
        input.roomCode,
        input.playerId,
        input.idempotencyKey,
    );
    if (existingSubmission) return { submission: existingSubmission, reused: true };
    return insertContestSubmission(
        db,
        input,
        await allocateContestSubmissionSequence(db, input.roomCode),
    );
};

const allocateContestSubmissionSequence = async (db: RoomDatabase, roomCode: string) => {
    const result = await db.query<{ sequence: number }>(
        `INSERT INTO contest_submission_sequences (room_code, next_sequence)
     VALUES ($1, 2)
     ON CONFLICT (room_code) DO UPDATE SET
       next_sequence = contest_submission_sequences.next_sequence + 1
     RETURNING next_sequence - 1 AS sequence`,
        [roomCode],
    );
    return Number(result.rows[0]?.sequence ?? 1);
};

const insertContestSubmission = async (
    db: RoomDatabase,
    input: ContestSubmissionInput,
    sequence: number,
): Promise<{ submission: ContestSubmissionRecord; reused: boolean }> => {
    const inserted = await db.query<ContestSubmissionRow>(
        `INSERT INTO contest_submissions (
       id, room_code, player_id, problem_id, answer, submitted_at, submitted_at_ms,
       sequence, correct, score_awarded, penalty_ms, attempts, idempotency_key
     )
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $6, $12, $7, $8, $9, $10, $11)
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
            sequence,
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

export const readContestSubmissionsForRoom = async (
    db: RoomDatabase,
    roomCode: string,
): Promise<ContestSubmissionRecord[]> => {
    const result = await db.query<ContestSubmissionRow>(
        `SELECT id, room_code, player_id, problem_id, answer, submitted_at_ms::text,
            sequence, correct, score_awarded, penalty_ms, attempts, idempotency_key
     FROM contest_submissions
     WHERE room_code = $1
     ORDER BY sequence ASC`,
        [roomCode],
    );
    return result.rows.map(rowToContestSubmission);
};
