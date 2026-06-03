import { useMemo, useState, type CSSProperties } from "react";
import { FileText, LogOut, RotateCw } from "lucide-react";
import type { PlayerPublic, ProblemPublic, RoomPublic } from "../../../shared/game";
import { formatPenalty, formatReportDate } from "../lib/format";
import { emitWithEmptyPayloadAck } from "../lib/socket";
import { compareStandings, makePlayerStandingRows, makeReportMetric } from "../lib/report";

export function ResultsScreen({ room, ownPlayer, onLeave }: { room: RoomPublic; ownPlayer: PlayerPublic | null; onLeave: () => Promise<void> }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [revealError, setRevealError] = useState("");
  const finalRows = useMemo(() => makePlayerStandingRows(room), [room]);
  const playerById = useMemo(() => new Map(room.players.map((player) => [player.id, player])), [room.players]);
  const players = finalRows.map((row) => playerById.get(row.playerId)).filter((player): player is PlayerPublic => Boolean(player));
  const frozenRows = room.frozenStandings.length > 0 ? room.frozenStandings : finalRows;
  const focusProblems = useMemo(() => makeRevealFocusProblems(room, frozenRows, finalRows), [room, frozenRows, finalRows]);
  const revealTotal = focusProblems.length;
  const revealCount = Math.min(room.scoreboardRevealCount, revealTotal);
  const allRevealed = revealTotal === 0 || revealCount >= revealTotal;
  const isHost = ownPlayer?.id === room.hostId;

  const revealRows = useMemo(() => focusProblems.map((problem, index) => makeFocusRevealRow(room, problem, index < revealCount)), [room, focusProblems, revealCount]);
  const nextRevealProblem = focusProblems[revealCount];
  const spinStyle = { "--reveal-turns": `${Math.max(1, revealCount + 1)}turn` } as CSSProperties;

  const revealNext = async () => {
    setRevealError("공개 요청 전송 중...");
    const response = await emitWithEmptyPayloadAck<RoomPublic>("room:reveal-next");
    setRevealError(response.ok ? "" : response.error ?? "순위표 공개 실패");
  };

  if (!reportOpen) {
    return (
      <main className="results-layout">
        <section className="exam-sheet result-sheet final-report-sheet reveal-sheet">
          <div className="exam-head final-report-head">
            <span>{allRevealed ? "전체 공개 완료" : "승부 문항 공개 중"}</span>
            <strong>프리즈 해제</strong>
          </div>
          <div className={`reveal-dial ${allRevealed ? "complete" : ""}`} style={spinStyle} aria-hidden="true">
            <RotateCw size={42} />
            <strong>{revealCount}/{revealTotal}</strong>
          </div>
          <div className="score-report-title">
            <strong>{formatReportDate()} 시행 최종 순위표</strong>
            <em>{room.exam.title}</em>
          </div>
          <div className="reveal-control-strip">
            <div>
              <span>방장 공개 순서</span>
              <strong>{allRevealed ? "승부 영향 문항이 모두 공개되었습니다." : `${nextRevealProblem ? `${nextRevealProblem.number}번` : "다음 문항"} 정답 여부 공개 대기`}</strong>
            </div>
            {!allRevealed && isHost && (
              <button className="reveal-next-btn" type="button" onClick={() => void revealNext()}>
                <RotateCw size={18} />
                문항 공개
              </button>
            )}
            {!allRevealed && !isHost && <em>방장이 다음 승부 문항을 공개할 때까지 대기</em>}
            {allRevealed && (
              <button className="reveal-next-btn" type="button" onClick={() => setReportOpen(true)}>
                <FileText size={18} />
                성적표 보기
              </button>
            )}
          </div>
          {revealError && <p className="reveal-error">{revealError}</p>}
          <div className="final-report-table reveal-table">
            <div className="final-report-row reveal-row reveal-row-head">
              <span>현재</span>
              <span>문항</span>
              <span>공개 상태</span>
              <span>배점</span>
              <span>정답자</span>
              <span>오답/미해결</span>
            </div>
            {revealRows.map((row) => (
              <div key={row.problemId} className={`final-report-row reveal-row ${row.revealed ? "revealed" : "locked"} ${row.swing ? "moved-up" : ""}`}>
                <span>{row.order}</span>
                <strong>{row.problemLabel}</strong>
                <span>{row.revealed ? "정답 여부 공개" : "프리즈"}</span>
                <em>{row.pointValue}점</em>
                <em>{row.revealed ? row.correctNames : "-"}</em>
                <span>{row.revealed ? row.incorrectNames : "-"}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="results-layout">
      <section className="exam-sheet result-sheet final-report-sheet">
        <div className="exam-head final-report-head">
          <span>채점 완료</span>
          <strong>성적통지표</strong>
        </div>
        <div className="release-stamp" aria-hidden="true">공개</div>
        <div className="score-report-title">
          <strong>{formatReportDate()} 시행 성적통지표</strong>
          <em>{room.exam.title}</em>
        </div>
        <div className="final-report-table">
          <div className="final-report-row final-report-row-head">
            <span>등급</span>
            <span>성명</span>
            <span>표준점수</span>
            <span>원점수</span>
            <span>페널티</span>
            <span>정답 문항</span>
          </div>
          {players.map((player) => {
            const metric = makeReportMetric(players, player.score);
            return (
              <div key={player.id} className="final-report-row">
                <span>{metric.grade}</span>
                <strong>{player.nickname}</strong>
                <em>{metric.standardScore}</em>
                <em>{player.score}</em>
                <em>{formatPenalty(player.penaltyMs)}</em>
                <span>{player.scoreBreakdown.solved}/{room.exam.problemCount}</span>
              </div>
            );
          })}
        </div>
        <button className="leave-report-btn" type="button" onClick={() => void onLeave()}>
          <LogOut size={18} />
          나가기
        </button>
      </section>
    </main>
  );
}

type FocusProblem = ProblemPublic & {
  changedCount: number;
  contenderChanged: boolean;
  afterFreezeAccepted: number;
};

type FocusRevealRow = {
  problemId: string;
  order: number;
  problemLabel: string;
  pointValue: number;
  correctNames: string;
  incorrectNames: string;
  revealed: boolean;
  swing: boolean;
};

function makeRevealFocusProblems(room: RoomPublic, frozenRows = room.frozenStandings, finalRows = makePlayerStandingRows(room)): FocusProblem[] {
  const frozenAt = room.scoreboardFrozenAt;
  const finalWinnerId = [...finalRows].sort(compareStandings)[0]?.playerId ?? null;
  const frozenWinnerId = [...frozenRows].sort(compareStandings)[0]?.playerId ?? null;
  const contenderIds = new Set([finalWinnerId, frozenWinnerId, finalRows[1]?.playerId, frozenRows[1]?.playerId].filter(Boolean));

  const focusProblems = room.exam.problems
    .map((problem) => {
      const changedPlayers = room.players.filter((player) => wasCorrectAt(player, problem.id, null) !== wasCorrectAt(player, problem.id, frozenAt));
      return {
        ...problem,
        changedCount: changedPlayers.length,
        contenderChanged: changedPlayers.some((player) => contenderIds.has(player.id)),
        afterFreezeAccepted: changedPlayers.filter((player) => wasCorrectAt(player, problem.id, null)).length
      };
    })
    .filter((problem) => problem.changedCount > 0)
    .sort(
      (a, b) =>
        Number(b.contenderChanged) - Number(a.contenderChanged) ||
        b.pointValue - a.pointValue ||
        b.afterFreezeAccepted - a.afterFreezeAccepted ||
        b.changedCount - a.changedCount ||
        a.number - b.number
    );

  return focusProblems.length > 0
    ? focusProblems
    : [...room.exam.problems]
        .sort((a, b) => b.pointValue - a.pointValue || a.number - b.number)
        .map((problem) => ({ ...problem, changedCount: 0, contenderChanged: false, afterFreezeAccepted: 0 }));
}

function makeFocusRevealRow(room: RoomPublic, problem: FocusProblem, revealed: boolean): FocusRevealRow {
  const sortedPlayers = [...room.players].sort((a, b) => {
    const standingA = { playerId: a.id, nickname: a.nickname, score: a.score, penaltyMs: a.penaltyMs, solved: a.scoreBreakdown.solved, lastAcceptedAt: null };
    const standingB = { playerId: b.id, nickname: b.nickname, score: b.score, penaltyMs: b.penaltyMs, solved: b.scoreBreakdown.solved, lastAcceptedAt: null };
    return compareStandings(standingA, standingB);
  });
  const correctNames = sortedPlayers.filter((player) => wasCorrectAt(player, problem.id, null)).map((player) => player.nickname);
  const incorrectNames = sortedPlayers.filter((player) => !wasCorrectAt(player, problem.id, null)).map((player) => player.nickname);

  return {
    problemId: problem.id,
    order: problem.number,
    problemLabel: `${problem.number}번`,
    pointValue: problem.pointValue,
    correctNames: correctNames.length > 0 ? correctNames.join(", ") : "없음",
    incorrectNames: incorrectNames.length > 0 ? incorrectNames.join(", ") : "없음",
    revealed,
    swing: problem.contenderChanged || problem.changedCount > 0
  };
}

function wasCorrectAt(player: PlayerPublic, problemId: string, visibleUntil: number | null) {
  return player.submissions.some((submission) => submission.problemId === problemId && submission.correct && (visibleUntil === null || submission.submittedAt <= visibleUntil));
}
