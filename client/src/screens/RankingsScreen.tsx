import { EyeOff } from "lucide-react";
import { useMemo } from "react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { useCountdown } from "../hooks/useCountdown";
import { formatElapsed, formatPenalty, formatTime } from "../lib/format";
import { makePlayerStandingRows } from "../lib/report";

export function RankingsScreen({ room, ownPlayer, onBack }: { room: RoomPublic; ownPlayer: PlayerPublic; onBack: () => void }) {
  const timeLeft = useCountdown(room);
  const liveRows = useMemo(() => makePlayerStandingRows(room), [room]);
  const rows = room.scoreboardFrozen && room.frozenStandings.length > 0 ? room.frozenStandings : liveRows;
  const playerById = useMemo(() => new Map(room.players.map((player) => [player.id, player])), [room.players]);
  const visibleUntil = room.scoreboardFrozen ? room.scoreboardFrozenAt : null;

  return (
    <main className="rankings-layout">
      <section className="exam-sheet rankings-sheet">
        <div className="rankings-head">
          <button className="back-link" onClick={onBack}>문제로</button>
          <div>
            <span>{room.scoreboardFrozen ? "순위 비공개" : "실시간 채점"}</span>
            <h1>순위표</h1>
          </div>
          <strong>{formatTime(timeLeft)}</strong>
        </div>
        {room.scoreboardFrozen && (
          <div className="freeze-slip">
            <EyeOff size={18} />
            순위 비공개: 현재 표는 설정된 비공개 시작 시점의 임시 성적입니다. 실제 성적은 시험 종료 후 공개됩니다.
          </div>
        )}
        <div className="domjudge-board" style={{ "--problem-count": String(room.exam.problemCount) } as React.CSSProperties & Record<string, string>}>
          <div className="domjudge-row domjudge-header">
            <span>순위</span>
            <strong>참가자</strong>
            <em>제출</em>
            <em>점수</em>
            <em>페널티</em>
            <em>AC</em>
            {room.exam.problems.map((problem) => (
              <span key={problem.id}>P{problem.number}</span>
            ))}
          </div>
          {rows.map((standing, index) => {
            const player = playerById.get(standing.playerId);
            const ownRow = standing.playerId === ownPlayer.id;
            const displayStanding = ownRow
              ? {
                  ...standing,
                  score: ownPlayer.score,
                  penaltyMs: ownPlayer.penaltyMs,
                  solved: ownPlayer.scoreBreakdown.solved
                }
              : standing;
            return (
              <div key={standing.playerId} className={`domjudge-row ${ownRow ? "me" : ""}`}>
                <span>{index + 1}</span>
                <strong>{standing.nickname}</strong>
                <em>{player ? formatSubmissionCount(player) : "-"}</em>
                <em>{displayStanding.score}</em>
                <span>{formatPenalty(displayStanding.penaltyMs)}</span>
                <span>{displayStanding.solved}/{room.exam.problemCount}</span>
                {room.exam.problems.map((problem) => {
                  const cell = player ? makeProblemScoreCell(player, problem.id, room.startedAt, ownRow ? null : visibleUntil) : null;
                  return (
                    <span key={problem.id} className={cell?.className ?? ""}>
                      {cell ? (
                        <>
                          <b>{cell.primary}</b>
                          <small>{cell.secondary}</small>
                        </>
                      ) : (
                        <small>-</small>
                      )}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
        {room.scoreboardFrozen && (
          <div className="private-score rankings-private-score">
            <span>내 실제 채점</span>
            <strong>{ownPlayer.score}점 · 페널티 {formatPenalty(ownPlayer.penaltyMs)} · {ownPlayer.scoreBreakdown.solved}/{room.exam.problemCount} AC</strong>
          </div>
        )}
      </section>
    </main>
  );
}

function formatSubmissionCount(player: PlayerPublic) {
  const count = (player.submissionHistory ?? player.submissions).length;
  return `${count}회`;
}

function makeProblemScoreCell(player: PlayerPublic, problemId: string, startedAt: number | null, visibleUntil: number | null) {
  const history = (player.submissionHistory ?? player.submissions)
    .filter((item) => item.problemId === problemId)
    .sort((a, b) => a.submittedAt - b.submittedAt);
  const hiddenAttempts = visibleUntil === null ? 0 : history.filter((item) => item.submittedAt > visibleUntil).length;
  const visibleHistory = history.filter((item) => visibleUntil === null || item.submittedAt <= visibleUntil);
  const submission = visibleHistory.at(-1);
  const visiblePenaltyMs = visibleHistory.reduce((sum, item) => sum + item.penaltyMs, 0);

  if (hiddenAttempts > 0 && !submission) {
    return {
      className: "frozen-attempt",
      primary: `${hiddenAttempts}회`,
      secondary: "프리즈"
    };
  }

  if (!submission) return null;

  if (submission.correct) {
    return {
      className: "accepted",
      primary: `+${submission.scoreAwarded}`,
      secondary: `${formatPenalty(visiblePenaltyMs)} · ${submission.attempts}회`
    };
  }

  return {
    className: hiddenAttempts > 0 ? "tried frozen-with-attempts" : "tried",
    primary: `${submission.attempts}회`,
    secondary: hiddenAttempts > 0 ? `${hiddenAttempts}회 프리즈` : `오답 · ${formatElapsed(startedAt, submission.submittedAt)}`
  };
}
