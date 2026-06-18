import { describe, expect, it } from "vitest";
import type { PlayerPublic } from "../shared/game.js";
import { WRONG_ANSWER_PENALTY_MS } from "../shared/game.js";
import {
    derivePlayerScoreState,
    effectiveSubmissionPenaltyMs,
    makeStandings,
    normalizeSubmissionPenalty,
} from "./scoring.js";

const startedAt = 10_000;

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
    ...overrides,
});

describe("server scoring", () => {
    it("adds elapsed minutes and wrong-answer attempts to accepted penalties", () => {
        const penalty = effectiveSubmissionPenaltyMs(
            { startedAt },
            {
                problemId: "p1",
                answer: "4",
                correct: true,
                submittedAt: startedAt + 61_000,
                scoreAwarded: 4,
                penaltyMs: 0,
                attempts: 3,
            },
        );

        expect(penalty).toBe(2 * 60_000 + 2 * WRONG_ANSWER_PENALTY_MS);
    });

    it("normalizes player score state from submissions", () => {
        const submission = normalizeSubmissionPenalty(
            { startedAt },
            {
                problemId: "p1",
                answer: "4",
                correct: true,
                submittedAt: startedAt + 1,
                scoreAwarded: 4,
                penaltyMs: 0,
                attempts: 1,
            },
        );

        expect(
            derivePlayerScoreState({ startedAt }, player({ submissions: [submission] })),
        ).toMatchObject({
            score: 4,
            solved: 1,
        });
    });

    it("orders standings by score, penalty, solved count, then latest accepted time", () => {
        const players = [
            player({
                id: "slow",
                nickname: "Slow",
                submissions: [
                    {
                        problemId: "p1",
                        answer: "1",
                        correct: true,
                        submittedAt: startedAt + 120_000,
                        scoreAwarded: 4,
                        penaltyMs: 0,
                        attempts: 1,
                    },
                ],
            }),
            player({
                id: "fast",
                nickname: "Fast",
                submissions: [
                    {
                        problemId: "p1",
                        answer: "1",
                        correct: true,
                        submittedAt: startedAt + 60_000,
                        scoreAwarded: 4,
                        penaltyMs: 0,
                        attempts: 1,
                    },
                ],
            }),
            player({
                id: "higher",
                nickname: "Higher",
                submissions: [
                    {
                        problemId: "p2",
                        answer: "1",
                        correct: true,
                        submittedAt: startedAt + 180_000,
                        scoreAwarded: 5,
                        penaltyMs: 0,
                        attempts: 1,
                    },
                ],
            }),
        ];

        expect(
            makeStandings({
                startedAt,
                players: new Map(players.map((entry) => [entry.id, entry])),
            }).map((row) => row.playerId),
        ).toEqual(["higher", "fast", "slow"]);
    });
});
