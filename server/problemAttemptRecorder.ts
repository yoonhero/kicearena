import type { Pool, PoolClient } from "pg";
import type { ProblemManifest } from "../shared/game.js";
import { saveProblemAttemptRecord } from "./problemAttemptDatabase.js";
import type { contestSubmissionToPublic } from "./roomDatabase.js";
import type { PlayerState, RoomState } from "./types.js";

export const recordProblemAttempt = async ({
    roomDatabase,
    makeSubmissionId,
    room,
    player,
    problem,
    submission,
    idempotencyKey,
}: {
    roomDatabase: () => Pool | PoolClient | null;
    makeSubmissionId: () => string;
    room: RoomState;
    player: PlayerState;
    problem: ProblemManifest;
    submission: ReturnType<typeof contestSubmissionToPublic>;
    idempotencyKey: string;
}) => {
    const db = roomDatabase();
    if (!db) return;
    try {
        await saveProblemAttemptRecord(db, {
            id: makeSubmissionId(),
            roomCode: room.code,
            roomMode: room.mode,
            eventId: room.eventId ?? null,
            examId: room.exam.id,
            playerId: player.id,
            playerNickname: player.nickname,
            problemId: problem.id,
            problemNumber: problem.number,
            problemTitle: problem.title,
            answerKind: problem.answerKind,
            answer: submission.answer,
            submittedAt: submission.submittedAt,
            elapsedMs:
                room.startedAt === null
                    ? null
                    : Math.max(0, submission.submittedAt - room.startedAt),
            correct: submission.correct,
            scoreAwarded: submission.scoreAwarded,
            penaltyMs: submission.penaltyMs,
            attemptNumber: submission.attempts,
            idempotencyKey,
        });
    } catch (error) {
        console.error(`Unable to record problem attempt for room ${room.code}.`, error);
    }
};
