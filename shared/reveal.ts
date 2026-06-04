import type { PlayerPublic, RoomPublic, StandingPublic, SubmissionPublic } from "./game";

export type RevealEvent = {
  playerId: string;
  nickname: string;
  submission: SubmissionPublic;
  movedToTop: boolean;
};

export type RevealBoardRow = StandingPublic & {
  rankLabel: string;
  revealedCount: number;
  movedToTop: boolean;
  attemptLabel: string;
  cells: RevealProblemCell[];
};

export type RevealState = {
  rows: RevealBoardRow[];
  events: RevealEvent[];
  total: number;
};

export type RevealStateOptions = {
  viewerPlayerId?: string | null;
};

export type RevealProblemCell = {
  problemId: string;
  status: "empty" | "accepted" | "tried" | "frozen" | "revealed-correct" | "revealed-wrong";
  primary: string;
  secondary: string;
};

export function makeScoreboardRevealState(room: RoomPublic, frozenRows = room.frozenStandings, appliedCount = 0, options: RevealStateOptions = {}): RevealState {
  const frozenAt = room.scoreboardFrozenAt;
  const problemById = new Map(room.exam.problems.map((problem) => [problem.id, problem]));
  const playerById = new Map(room.players.map((player) => [player.id, player]));
  const orderedFrozenRows = frozenRows.length > 0 ? [...frozenRows].sort(compareStandings) : makePlayerStandingRows(room);
  const hiddenByPlayer = new Map(
    orderedFrozenRows.map((row) => [
      row.playerId,
      getSubmissionHistory(playerById.get(row.playerId))
        .filter((submission) => frozenAt !== null && submission.submittedAt > frozenAt)
        .sort((a, b) => a.submittedAt - b.submittedAt)
    ])
  );
  const revealedCounts = new Map(orderedFrozenRows.map((row) => [row.playerId, 0]));
  let boardIds = orderedFrozenRows.map((row) => row.playerId);
  const events: RevealEvent[] = [];

  while (hasHiddenSubmission(boardIds, hiddenByPlayer, revealedCounts)) {
    const playerId = findBottomRevealPlayer(boardIds, hiddenByPlayer, revealedCounts);
    if (!playerId) break;
    const player = playerById.get(playerId);
    const hidden = hiddenByPlayer.get(playerId) ?? [];
    const submission = hidden[revealedCounts.get(playerId) ?? 0];
    if (!player || !submission) break;

    const beforeIndex = boardIds.indexOf(playerId);
    revealedCounts.set(playerId, (revealedCounts.get(playerId) ?? 0) + 1);

    const rankedIds = [...boardIds].sort((a, b) =>
      compareStandings(makePartialStanding(a, orderedFrozenRows, hiddenByPlayer, revealedCounts), makePartialStanding(b, orderedFrozenRows, hiddenByPlayer, revealedCounts))
    );
    const movedUp = rankedIds.indexOf(playerId) < beforeIndex;
    boardIds = rankedIds;

    events.push({ playerId, nickname: player.nickname, submission, movedToTop: movedUp });
  }

  const replayCounts = new Map(orderedFrozenRows.map((row) => [row.playerId, 0]));
  const replayMovedIds = new Set<string>();
  let replayBoardIds = orderedFrozenRows.map((row) => row.playerId);
  for (const event of events.slice(0, appliedCount)) {
    replayCounts.set(event.playerId, (replayCounts.get(event.playerId) ?? 0) + 1);
    if (event.movedToTop) {
      replayMovedIds.add(event.playerId);
    }
    replayBoardIds = [...replayBoardIds].sort((a, b) =>
      compareStandings(makePartialStanding(a, orderedFrozenRows, hiddenByPlayer, replayCounts), makePartialStanding(b, orderedFrozenRows, hiddenByPlayer, replayCounts))
    );
  }

  const rows: RevealBoardRow[] = replayBoardIds.map((playerId, index) => {
    const hidden = hiddenByPlayer.get(playerId) ?? [];
    const revealedCount = playerId === options.viewerPlayerId ? hidden.length : replayCounts.get(playerId) ?? 0;
    const rowCounts = new Map(replayCounts);
    if (playerId === options.viewerPlayerId) rowCounts.set(playerId, hidden.length);
    const standing = makePartialStanding(playerId, orderedFrozenRows, hiddenByPlayer, rowCounts);
    return {
      ...standing,
      rankLabel: `${index + 1}`,
      revealedCount,
      movedToTop: replayMovedIds.has(playerId),
      attemptLabel: makeAttemptLabel(hidden, revealedCount, problemById),
      cells: makeRevealProblemCells(playerById.get(playerId), frozenAt, hidden, revealedCount, problemById)
    };
  });

  return { rows, events, total: events.length };
}

export function compareStandings(a: StandingPublic, b: StandingPublic) {
  return (
    b.score - a.score ||
    a.penaltyMs - b.penaltyMs ||
    b.solved - a.solved ||
    (a.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER) - (b.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER)
  );
}

function makePlayerStandingRows(room: RoomPublic): StandingPublic[] {
  return [...room.players]
    .map((player) => ({
      playerId: player.id,
      nickname: player.nickname,
      score: player.score,
      penaltyMs: player.penaltyMs,
      solved: player.scoreBreakdown.solved,
      lastAcceptedAt: lastAcceptedAt(player)
    }))
    .sort(compareStandings);
}

function lastAcceptedAt(player: PlayerPublic) {
  return player.submissions
    .filter((submission) => submission.correct)
    .reduce<number | null>((latest, submission) => (latest === null || submission.submittedAt > latest ? submission.submittedAt : latest), null);
}

function getSubmissionHistory(player: PlayerPublic | undefined) {
  return player?.submissionHistory ?? player?.submissions ?? [];
}

function hasHiddenSubmission(playerIds: string[], hiddenByPlayer: Map<string, SubmissionPublic[]>, revealedCounts: Map<string, number>) {
  return playerIds.some((playerId) => (revealedCounts.get(playerId) ?? 0) < (hiddenByPlayer.get(playerId)?.length ?? 0));
}

function findBottomRevealPlayer(playerIds: string[], hiddenByPlayer: Map<string, SubmissionPublic[]>, revealedCounts: Map<string, number>) {
  return [...playerIds].reverse().find((playerId) => (revealedCounts.get(playerId) ?? 0) < (hiddenByPlayer.get(playerId)?.length ?? 0)) ?? null;
}

function makePartialStanding(playerId: string, frozenRows: StandingPublic[], hiddenByPlayer: Map<string, SubmissionPublic[]>, revealedCounts: Map<string, number>): StandingPublic {
  const frozen = frozenRows.find((row) => row.playerId === playerId);
  const revealed = (hiddenByPlayer.get(playerId) ?? []).slice(0, revealedCounts.get(playerId) ?? 0);
  const acceptedByProblem = new Map<string, SubmissionPublic>();

  for (const submission of revealed) {
    if (submission.correct) acceptedByProblem.set(submission.problemId, submission);
  }

  const accepted = [...acceptedByProblem.values()];
  const lastAcceptedAt = accepted.reduce<number | null>((latest, submission) => (latest === null || submission.submittedAt > latest ? submission.submittedAt : latest), frozen?.lastAcceptedAt ?? null);

  return {
    playerId,
    nickname: frozen?.nickname ?? "",
    score: (frozen?.score ?? 0) + accepted.reduce((sum, submission) => sum + submission.scoreAwarded, 0),
    penaltyMs: (frozen?.penaltyMs ?? 0) + revealed.reduce((sum, submission) => sum + submission.penaltyMs, 0),
    solved: (frozen?.solved ?? 0) + accepted.length,
    lastAcceptedAt
  };
}

function makeAttemptLabel(hidden: SubmissionPublic[], revealedCount: number, problemById: Map<string, { number: number }>) {
  if (hidden.length === 0) return "비공개 시도 없음";
  const revealed = hidden.slice(0, revealedCount);
  const labels = revealed.map((submission) => {
    const problemNumber = problemById.get(submission.problemId)?.number ?? "?";
    return `${problemNumber}번 ${submission.correct ? "정답" : "오답"}`;
  });
  const remaining = hidden.length - revealedCount;
  if (remaining > 0) labels.push(`${remaining}건 프리즈`);
  return labels.length > 0 ? labels.join(" · ") : `${hidden.length}건 프리즈`;
}

function makeRevealProblemCells(
  player: PlayerPublic | undefined,
  frozenAt: number | null,
  hidden: SubmissionPublic[],
  revealedCount: number,
  problemById: Map<string, { number: number }>
): RevealProblemCell[] {
  const submissions = getSubmissionHistory(player);
  return [...problemById.entries()]
    .sort(([, a], [, b]) => a.number - b.number)
    .map(([problemId]) => {
      const visible = submissions
        .filter((submission) => submission.problemId === problemId && (frozenAt === null || submission.submittedAt <= frozenAt))
        .sort((a, b) => a.submittedAt - b.submittedAt)
        .at(-1);
      const hiddenForProblem = hidden.filter((submission) => submission.problemId === problemId);
      const revealedForProblem = hidden.slice(0, revealedCount).filter((submission) => submission.problemId === problemId);
      const remaining = hiddenForProblem.length - revealedForProblem.length;
      const latestRevealed = revealedForProblem.at(-1);
      const displayedPenaltyMs = [...submissions.filter((submission) => submission.problemId === problemId && (frozenAt === null || submission.submittedAt <= frozenAt)), ...revealedForProblem].reduce(
        (sum, submission) => sum + submission.penaltyMs,
        0
      );

      if (latestRevealed) {
        return {
          problemId,
          status: latestRevealed.correct ? "revealed-correct" : "revealed-wrong",
          primary: latestRevealed.correct ? "정답" : "오답",
          secondary: remaining > 0 ? `${revealedForProblem.length}/${hiddenForProblem.length} 공개` : latestRevealed.correct ? formatPenalty(displayedPenaltyMs) : `${revealedForProblem.length}회 공개`
        };
      }

      if (remaining > 0) {
        return {
          problemId,
          status: "frozen",
          primary: `${remaining}회`,
          secondary: "프리즈"
        };
      }

      if (visible?.correct) {
        return {
          problemId,
          status: "accepted",
          primary: `+${visible.scoreAwarded}`,
          secondary: formatPenalty(displayedPenaltyMs)
        };
      }

      if (visible) {
        return {
          problemId,
          status: "tried",
          primary: `${visible.attempts}회`,
          secondary: "오답"
        };
      }

      return {
        problemId,
        status: "empty",
        primary: "-",
        secondary: ""
      };
    });
}

function formatPenalty(penaltyMs: number) {
  const minutes = Math.max(0, Math.round(penaltyMs / 60000));
  return minutes === 0 ? "0분" : `+${minutes}분`;
}
