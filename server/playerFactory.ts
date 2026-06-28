import type { ExamManifest } from "../shared/game.js";
import type { PlayerState } from "./types.js";

export const createPlayerState = ({
    id,
    socketId,
    socketToken,
    nickname,
    exam,
    ready,
}: {
    id: string;
    socketId: string;
    socketToken: string;
    nickname: string;
    exam: ExamManifest;
    ready: boolean;
}): PlayerState => ({
    id,
    socketId,
    socketToken,
    nickname,
    score: 0,
    penaltyMs: 0,
    scoreBreakdown: { solved: 0, timeBonus: 0, difficultyBonus: 0 },
    ready,
    currentProblemId: exam.problems[0]?.id ?? "",
    consecutiveWrong: 0,
    inventory: [],
    itemCooldowns: {},
    effects: [],
    expiredEffects: [],
    submissions: [],
    submissionHistory: [],
    connected: true,
});
