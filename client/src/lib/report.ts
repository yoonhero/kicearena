import type { PlayerPublic, RoomPublic, StandingPublic } from "../../../shared/game";

export type ReportMetric = {
    standardScore: number;
    percentile: number;
    grade: number;
};

export function makePlayerStandingRows(room: RoomPublic): StandingPublic[] {
    return [...room.players]
        .map((player) => ({
            playerId: player.id,
            nickname: player.nickname,
            score: player.score,
            penaltyMs: player.penaltyMs,
            solved: player.scoreBreakdown.solved,
            lastAcceptedAt: lastAcceptedAt(player),
        }))
        .sort(compareStandings);
}

export function compareStandings(a: StandingPublic, b: StandingPublic) {
    return (
        b.score - a.score ||
        a.penaltyMs - b.penaltyMs ||
        b.solved - a.solved ||
        (a.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER) -
            (b.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER)
    );
}

export function makeReportMetric(
    population: Array<{ score: number }>,
    score: number,
): ReportMetric {
    const scores = population.map((item) => item.score);
    const count = scores.length;
    if (count === 0) return { standardScore: 100, percentile: 100, grade: 1 };

    const mean = scores.reduce((sum, item) => sum + item, 0) / count;
    const variance = scores.reduce((sum, item) => sum + (item - mean) ** 2, 0) / count;
    const standardDeviation = Math.sqrt(variance);
    const standardScore =
        standardDeviation === 0 ? 100 : Math.round(100 + 20 * ((score - mean) / standardDeviation));
    const higherScoreCount = new Set(scores.filter((item) => item > score)).size;
    const percentile = Math.max(1, Math.round(100 - (higherScoreCount / count) * 100));

    return {
        standardScore,
        percentile,
        grade: gradeFromPercentile(percentile),
    };
}

export function lastAcceptedAt(player: PlayerPublic) {
    return player.submissions
        .filter((submission) => submission.correct)
        .reduce<
            number | null
        >((latest, submission) => (latest === null || submission.submittedAt > latest ? submission.submittedAt : latest), null);
}

function gradeFromPercentile(percentile: number) {
    if (percentile >= 96) return 1;
    if (percentile >= 89) return 2;
    if (percentile >= 77) return 3;
    if (percentile >= 60) return 4;
    if (percentile >= 40) return 5;
    if (percentile >= 23) return 6;
    if (percentile >= 11) return 7;
    if (percentile >= 4) return 8;
    return 9;
}
