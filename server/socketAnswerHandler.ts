/* eslint-disable complexity */
import type { Pool, PoolClient } from "pg";
import type { Socket } from "socket.io";
import {
    type ArenaLog,
    ITEM_DEFINITIONS,
    type ItemAward,
    type ItemId,
    type ProblemManifest,
    type RoomPublic,
    type ServerResponse,
    WRONG_ANSWER_PENALTY_MS,
    normalizeAnswer,
} from "../shared/game.js";
import { contestSubmissionToPublic, saveContestSubmission } from "./roomDatabase.js";
import { maybeAwardItems, randomWeakDebuff } from "./items.js";
import { recordProblemAttempt } from "./problemAttemptRecorder.js";
import { readString } from "./requestUtils.js";
import { createServerMetrics } from "./serverMetrics.js";
import { formatPenaltyMinutes, normalizeSubmissionPenalty, scoreForAccepted } from "./scoring.js";
import type { SocketPlayerRef } from "./socketPresence.js";
import type { PlayerState, RoomState } from "./types.js";

type AnswerReply = (
    response: ServerResponse<{
        correct: boolean;
        itemAwarded: ItemId | null;
        itemAwards: ItemAward[];
    }>,
) => void;

type SocketAnswerHandlerOptions = {
    rooms: Map<string, RoomState>;
    getSocketPlayerRef: (socket: Socket) => SocketPlayerRef | undefined;
    getPersistedRoom: (code: string) => Promise<RoomState | null>;
    withRoomMutation: <T>(code: string, callback: () => Promise<T>) => Promise<T>;
    roomDatabase: () => Pool | PoolClient | null;
    contestSubmitMutex: {
        run: <T>(key: string, callback: () => Promise<T>) => Promise<T>;
    };
    serverMetrics: ReturnType<typeof createServerMetrics>;
    answerSubmitRateLimitMs: number;
    makeSubmissionId: () => string;
    isCurrentPlayerSocket: (
        player: PlayerState | undefined,
        ref: SocketPlayerRef | undefined,
    ) => player is PlayerState;
    isFinished: (room: RoomState) => boolean;
    finishRoom: (room: RoomState, reason?: string) => RoomPublic | null;
    getProblem: (room: RoomState, problemId: string) => ProblemManifest | undefined;
    shouldRateLimit: (socketId: string, eventName: string, minIntervalMs: number) => boolean;
    addLog: (room: RoomState, kind: ArenaLog["kind"], message: string) => void;
    touchRoom: (room: RoomState) => void;
    emitRoom: (room: RoomState) => RoomPublic;
    emitRoomAfterCommit: (room: RoomState) => void;
    replyAfterRoomCommit: <TResponse>(
        reply: ((response: TResponse) => void) | undefined,
        response: TResponse,
    ) => void;
};

const applySubmissionToPlayer = (
    player: PlayerState,
    submission: ReturnType<typeof contestSubmissionToPublic>,
) => {
    player.submissions = player.submissions.filter(
        (existing) => existing.problemId !== submission.problemId,
    );
    player.submissions.push(submission);
    player.submissionHistory.push(submission);
    if (submission.correct) {
        player.score += submission.scoreAwarded;
        player.penaltyMs += submission.penaltyMs;
        player.scoreBreakdown.solved += 1;
        player.scoreBreakdown.difficultyBonus += 0;
        player.scoreBreakdown.timeBonus += 0;
        player.consecutiveWrong = 0;
    } else {
        player.consecutiveWrong += 1;
    }
};

const appendSubmissionLog = ({
    options,
    room,
    player,
    problem,
    submission,
    extra = "",
}: {
    options: SocketAnswerHandlerOptions;
    room: RoomState;
    player: PlayerState;
    problem: ProblemManifest;
    submission: ReturnType<typeof contestSubmissionToPublic>;
    extra?: string;
}) => {
    options.addLog(
        room,
        "submit",
        submission.correct
            ? `${player.nickname} ${problem.number}번 정답 +${submission.scoreAwarded}점, 페널티 +${formatPenaltyMinutes(submission.penaltyMs)}분.${extra}`
            : `${player.nickname} ${problem.number}번 오답. 정답 시 오답 페널티 +${Math.round(WRONG_ANSWER_PENALTY_MS / 60000)}분, 연속 ${player.consecutiveWrong}회.`,
    );
};

const submitContestAnswerFast = async (
    options: SocketAnswerHandlerOptions,
    socket: Socket,
    ref: SocketPlayerRef,
    payload: { problemId: string; answer: string; idempotencyKey?: string },
    reply: AnswerReply,
) => {
    const room = options.rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    if (!room || !options.isCurrentPlayerSocket(player, ref) || room.status !== "playing") {
        reply({ ok: false, error: "진행 중인 시험이 아닙니다." });
        return true;
    }
    if (room.mode !== "contest") return false;
    if (options.isFinished(room)) {
        options.finishRoom(room);
        reply({ ok: false, error: "시험이 종료되었습니다." });
        return true;
    }

    const problem = options.getProblem(room, readString(payload?.problemId, 80));
    if (!problem) {
        reply({ ok: false, error: "문제를 찾을 수 없습니다." });
        return true;
    }
    const answer = readString(payload?.answer, 24);
    if (!answer) {
        reply({ ok: false, error: "답안을 입력하세요." });
        return true;
    }

    const idempotencyKey = readString(payload?.idempotencyKey, 120) || options.makeSubmissionId();
    if (options.shouldRateLimit(socket.id, "answer:submit", options.answerSubmitRateLimitMs)) {
        reply({ ok: false, error: "답안 제출 간격이 너무 짧습니다." });
        return true;
    }
    const correct = normalizeAnswer(answer) === normalizeAnswer(problem.answer);
    const previousCorrect = player.submissions.some(
        (submission) => submission.problemId === problem.id && submission.correct,
    );
    const previousSubmission = player.submissions.find(
        (submission) => submission.problemId === problem.id,
    );
    if (previousCorrect) {
        reply({ ok: false, error: "이미 맞힌 문항입니다." });
        return true;
    }
    if (problem.answerKind === "choice" && previousSubmission) {
        reply({ ok: false, error: "5지선다 문항은 한 번만 제출할 수 있습니다." });
        return true;
    }

    const attempts = (previousSubmission?.attempts ?? 0) + 1;
    const submission = normalizeSubmissionPenalty(room, {
        problemId: problem.id,
        answer,
        correct,
        submittedAt: Date.now(),
        scoreAwarded: correct && !previousCorrect ? scoreForAccepted(problem) : 0,
        penaltyMs: 0,
        attempts,
    });
    const db = options.roomDatabase();
    if (!db) {
        reply({ ok: false, error: "답안 저장소를 사용할 수 없습니다." });
        return true;
    }

    const saved = await saveContestSubmission(db, {
        id: options.makeSubmissionId(),
        roomCode: room.code,
        playerId: player.id,
        problemId: problem.id,
        answer,
        submittedAt: submission.submittedAt,
        correct: submission.correct,
        scoreAwarded: submission.scoreAwarded,
        penaltyMs: submission.penaltyMs,
        attempts: submission.attempts,
        idempotencyKey,
    });
    if (saved.reused) {
        reply({
            ok: true,
            data: { correct: saved.submission.correct, itemAwarded: null, itemAwards: [] },
        });
        return true;
    }

    const durableSubmission = contestSubmissionToPublic(saved.submission);
    options.serverMetrics.answersSubmittedCounter.inc({
        correct: String(durableSubmission.correct),
    });
    options.serverMetrics.contestSubmissionsCounter.inc({
        event_id: room.exam.id,
        correct: String(durableSubmission.correct),
    });
    await recordProblemAttempt({
        roomDatabase: options.roomDatabase,
        makeSubmissionId: options.makeSubmissionId,
        room,
        player,
        problem,
        submission: durableSubmission,
        idempotencyKey,
    });
    applySubmissionToPlayer(player, durableSubmission);
    appendSubmissionLog({
        options,
        room,
        player,
        problem,
        submission: durableSubmission,
    });
    options.touchRoom(room);
    reply({
        ok: true,
        data: { correct: durableSubmission.correct, itemAwarded: null, itemAwards: [] },
    });
    options.emitRoomAfterCommit(room);
    return true;
};

const submitAnswer = async (
    options: SocketAnswerHandlerOptions,
    socket: Socket,
    payload: { problemId: string; answer: string; idempotencyKey?: string },
    reply: AnswerReply,
) => {
    const ref = options.getSocketPlayerRef(socket);
    if (!ref) {
        options.replyAfterRoomCommit(reply, {
            ok: false,
            error: "참가자 정보를 찾을 수 없습니다.",
        });
        return;
    }
    const contestSubmitKey = `${ref.roomCode}:${ref.playerId}:${readString(payload?.problemId, 80)}`;
    if (
        await options.contestSubmitMutex.run(contestSubmitKey, () =>
            submitContestAnswerFast(options, socket, ref, payload, reply),
        )
    )
        return;
    await options.withRoomMutation(ref.roomCode, async () => {
        const room = await options.getPersistedRoom(ref.roomCode);
        const player = room?.players.get(ref.playerId);
        if (!room || !options.isCurrentPlayerSocket(player, ref) || room.status !== "playing") {
            options.replyAfterRoomCommit(reply, { ok: false, error: "진행 중인 시험이 아닙니다." });
            return;
        }
        if (options.isFinished(room)) {
            options.finishRoom(room);
            options.replyAfterRoomCommit(reply, { ok: false, error: "시험이 종료되었습니다." });
            return;
        }
        const problem = options.getProblem(room, readString(payload?.problemId, 80));
        if (!problem) {
            options.replyAfterRoomCommit(reply, { ok: false, error: "문제를 찾을 수 없습니다." });
            return;
        }
        if (
            player.effects.some(
                (effect) =>
                    ["penLock", "slowInput"].includes(effect.id) && effect.expiresAt > Date.now(),
            )
        ) {
            options.replyAfterRoomCommit(reply, {
                ok: false,
                error: "지금은 펜이 압수된 상태입니다.",
            });
            return;
        }

        const answer = readString(payload?.answer, 24);
        if (!answer) {
            options.replyAfterRoomCommit(reply, { ok: false, error: "답안을 입력하세요." });
            return;
        }
        const correct = normalizeAnswer(answer) === normalizeAnswer(problem.answer);
        const idempotencyKey =
            readString(payload?.idempotencyKey, 120) || options.makeSubmissionId();
        if (options.shouldRateLimit(socket.id, "answer:submit", options.answerSubmitRateLimitMs)) {
            options.replyAfterRoomCommit(reply, {
                ok: false,
                error: "답안 제출 간격이 너무 짧습니다.",
            });
            return;
        }
        const previousCorrect = player.submissions.some(
            (submission) => submission.problemId === problem.id && submission.correct,
        );
        const previousSubmission = player.submissions.find(
            (submission) => submission.problemId === problem.id,
        );
        if (previousCorrect) {
            options.replyAfterRoomCommit(reply, { ok: false, error: "이미 맞힌 문항입니다." });
            return;
        }
        if (problem.answerKind === "choice" && previousSubmission) {
            options.replyAfterRoomCommit(reply, {
                ok: false,
                error: "5지선다 문항은 한 번만 제출할 수 있습니다.",
            });
            return;
        }

        const attempts = (previousSubmission?.attempts ?? 0) + 1;
        const scoreAwarded = correct && !previousCorrect ? scoreForAccepted(problem) : 0;
        const submission = normalizeSubmissionPenalty(room, {
            problemId: problem.id,
            answer,
            correct,
            submittedAt: Date.now(),
            scoreAwarded,
            penaltyMs: 0,
            attempts,
        });
        options.serverMetrics.answersSubmittedCounter.inc({ correct: String(correct) });
        await recordProblemAttempt({
            roomDatabase: options.roomDatabase,
            makeSubmissionId: options.makeSubmissionId,
            room,
            player,
            problem,
            submission,
            idempotencyKey,
        });
        player.submissions = player.submissions.filter(
            (candidate) => candidate.problemId !== problem.id,
        );
        player.submissions.push(submission);
        player.submissionHistory.push(submission);

        const itemAwards = correct ? maybeAwardItems(room, player, problem, attempts) : [];
        if (correct) {
            player.score += scoreAwarded;
            player.penaltyMs += submission.penaltyMs;
            player.scoreBreakdown.solved += 1;
            player.scoreBreakdown.difficultyBonus += 0;
            player.scoreBreakdown.timeBonus += 0;
            player.consecutiveWrong = 0;
            for (const award of itemAwards) player.inventory.push(award.itemId);
            const itemAwardNames = itemAwards.map((award) => ITEM_DEFINITIONS[award.itemId].name);
            appendSubmissionLog({
                options,
                room,
                player,
                problem,
                submission,
                extra: itemAwardNames.length > 0 ? ` ${itemAwardNames.join(", ")} 획득.` : "",
            });
        } else {
            player.consecutiveWrong += 1;
            appendSubmissionLog({ options, room, player, problem, submission });
            if (player.consecutiveWrong >= 3) {
                const penalty = randomWeakDebuff();
                player.effects.push(penalty);
                player.consecutiveWrong = 0;
                options.addLog(
                    room,
                    "penalty",
                    `${player.nickname} 연속 오답 벌칙: ${penalty.label}`,
                );
            }
        }

        options.replyAfterRoomCommit(reply, {
            ok: true,
            data: {
                correct,
                itemAwarded: itemAwards[0]?.itemId ?? null,
                itemAwards,
            },
        });
        options.touchRoom(room);
        options.emitRoom(room);
    });
};

export const registerAnswerSocketHandler = (
    socket: Socket,
    options: SocketAnswerHandlerOptions,
) => {
    socket.on(
        "answer:submit",
        async (
            payload: { problemId: string; answer: string; idempotencyKey?: string },
            reply: AnswerReply,
        ) => {
            await submitAnswer(options, socket, payload, reply);
        },
    );
};
