import type { PlayerPublic, ProblemManifest, StandingPublic } from "../shared/game.js";
import { getProblemPointValue, WRONG_ANSWER_PENALTY_MS } from "../shared/game.js";
import type { RoomState } from "./types.js";

export const scoreForAccepted = (problem: ProblemManifest) => getProblemPointValue(problem);

export const compareStandings = (a: StandingPublic, b: StandingPublic) =>
    b.score - a.score ||
    a.penaltyMs - b.penaltyMs ||
    b.solved - a.solved ||
    (a.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER) - (b.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER);

export const effectiveSubmissionPenaltyMs = (
    room: Pick<RoomState, "startedAt">,
    submission: PlayerPublic["submissions"][number],
) => {
    if (!submission.correct) return 0;
    const elapsedMs = Math.max(
        0,
        submission.submittedAt - (room.startedAt ?? submission.submittedAt),
    );
    const elapsedPenaltyMs = elapsedMs > 0 ? Math.max(1, Math.ceil(elapsedMs / 60000)) * 60000 : 0;
    return elapsedPenaltyMs + Math.max(0, submission.attempts - 1) * WRONG_ANSWER_PENALTY_MS;
};

export const normalizeSubmissionPenalty = (
    room: Pick<RoomState, "startedAt">,
    submission: PlayerPublic["submissions"][number],
) => ({
    ...submission,
    penaltyMs: effectiveSubmissionPenaltyMs(room, submission),
});

export const formatPenaltyMinutes = (penaltyMs: number) =>
    Math.max(0, Math.round(penaltyMs / 60000));

export const derivePlayerScoreState = (
    room: Pick<RoomState, "startedAt">,
    player: PlayerPublic,
) => {
    const normalizedSubmissions = player.submissions.map((submission) =>
        normalizeSubmissionPenalty(room, submission),
    );
    const accepted = normalizedSubmissions.filter((submission) => submission.correct);
    return {
        score: accepted.reduce((sum, submission) => sum + submission.scoreAwarded, 0),
        penaltyMs: accepted.reduce((sum, submission) => sum + submission.penaltyMs, 0),
        solved: accepted.length,
        normalizedSubmissions,
    };
};

export const makeStandings = (
    room: Pick<RoomState, "startedAt"> & { players: Map<string, PlayerPublic> },
    players: PlayerPublic[] = [...room.players.values()],
    visibleUntil: number | null = null,
): StandingPublic[] =>
    players
        .map((player) => {
            const visibleSubmissions =
                visibleUntil === null
                    ? player.submissions
                    : player.submissions.filter(
                          (submission) => submission.submittedAt <= visibleUntil,
                      );
            const derived = derivePlayerScoreState(room, {
                ...player,
                submissions: visibleSubmissions,
            });
            const lastAcceptedAt = visibleSubmissions
                .filter((submission) => submission.correct)
                .reduce<
                    number | null
                >((latest, submission) => (latest === null || submission.submittedAt > latest ? submission.submittedAt : latest), null);
            return {
                playerId: player.id,
                nickname: player.nickname,
                score: derived.score,
                penaltyMs: derived.penaltyMs,
                solved: derived.solved,
                lastAcceptedAt,
            };
        })
        .sort(compareStandings);
