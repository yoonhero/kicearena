import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FileText, LogOut, RotateCw } from "lucide-react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { makeScoreboardRevealState, type RevealEvent } from "../../../shared/reveal";
import { formatPenalty, formatReportDate } from "../lib/format";
import { emitWithEmptyPayloadAck } from "../lib/socket";
import { makePlayerStandingRows, makeReportMetric } from "../lib/report";

export function ResultsScreen({ room, ownPlayer, onLeave }: { room: RoomPublic; ownPlayer: PlayerPublic | null; onLeave: () => Promise<void> }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [revealError, setRevealError] = useState("");
  const revealRowRefs = useRef(new Map<string, HTMLDivElement>());
  const revealCellRefs = useRef(new Map<string, HTMLSpanElement>());
  const previousRevealRowRects = useRef(new Map<string, DOMRect>());
  const finalRows = useMemo(() => makePlayerStandingRows(room), [room]);
  const playerById = useMemo(() => new Map(room.players.map((player) => [player.id, player])), [room.players]);
  const players = finalRows.map((row) => playerById.get(row.playerId)).filter((player): player is PlayerPublic => Boolean(player));
  const frozenRows = room.frozenStandings.length > 0 ? room.frozenStandings : finalRows;
  const revealState = useMemo(() => makeScoreboardRevealState(room, frozenRows), [room, frozenRows]);
  const revealTotal = revealState.total;
  const revealCount = Math.min(room.scoreboardRevealCount, revealTotal);
  const allRevealed = revealTotal === 0 || revealCount >= revealTotal;
  const isHost = ownPlayer?.id === room.hostId;

  const revealRows = useMemo(() => makeScoreboardRevealState(room, frozenRows, revealCount, { viewerPlayerId: ownPlayer?.id }).rows, [room, frozenRows, revealCount, ownPlayer?.id]);
  const nextRevealRow = revealState.events[revealCount];
  const currentRevealEvent = revealCount > 0 ? revealState.events[revealCount - 1] : undefined;
  const spinStyle = { "--reveal-turns": `${Math.max(1, revealCount + 1)}turn` } as CSSProperties;

  useLayoutEffect(() => {
    const previousRects = previousRevealRowRects.current;
    const nextRects = new Map<string, DOMRect>();

    for (const row of revealRows) {
      const element = revealRowRefs.current.get(row.playerId);
      if (!element) continue;
      const nextRect = element.getBoundingClientRect();
      nextRects.set(row.playerId, nextRect);

      const previousRect = previousRects.get(row.playerId);
      if (!previousRect) continue;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaY) < 1) continue;

      element.style.transition = "none";
      element.style.transform = `translate3d(0, ${deltaY}px, 0)`;
      element.getBoundingClientRect();
      element.style.transition = "";
      element.style.transform = "";
    }

    previousRevealRowRects.current = nextRects;
  }, [revealRows]);

  useLayoutEffect(() => {
    if (!currentRevealEvent) return;
    const cell = revealCellRefs.current.get(makeRevealCellKey(currentRevealEvent.playerId, currentRevealEvent.submission.problemId));
    cell?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [currentRevealEvent?.playerId, currentRevealEvent?.submission.problemId, revealCount]);

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
            <span>{allRevealed ? "전체 공개 완료" : "비공개 시도 공개 중"}</span>
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
              <strong>{allRevealed ? "비공개 시도가 모두 공개되었습니다." : makeNextRevealLabel(nextRevealRow, room)}</strong>
            </div>
            {!allRevealed && isHost && (
              <button className="reveal-next-btn" type="button" onClick={() => void revealNext()}>
                <RotateCw size={18} />
                시도 공개
              </button>
            )}
            {!allRevealed && !isHost && <em>방장이 다음 비공개 시도를 공개할 때까지 대기</em>}
            {allRevealed && (
              <button className="reveal-next-btn" type="button" onClick={() => setReportOpen(true)}>
                <FileText size={18} />
                성적표 보기
              </button>
            )}
          </div>
          {revealError && <p className="reveal-error">{revealError}</p>}
          <div className="final-report-table reveal-table" style={{ "--problem-count": String(room.exam.problemCount) } as CSSProperties & Record<string, string>}>
            <div className="final-report-row reveal-row reveal-row-head">
              <span>현재</span>
              <span>수험자</span>
              <span>점수</span>
              <span>정답</span>
              <span>페널티</span>
              {room.exam.problems.map((problem) => (
                <span key={problem.id}>P{problem.number}</span>
              ))}
            </div>
            {revealRows.map((row) => (
              <div
                key={row.playerId}
                ref={(element) => {
                  if (element) revealRowRefs.current.set(row.playerId, element);
                  else revealRowRefs.current.delete(row.playerId);
                }}
                className={`final-report-row reveal-row ${row.revealedCount > 0 ? "revealed" : "locked"} ${row.movedToTop ? "moved-up" : ""} ${
                  currentRevealEvent?.playerId === row.playerId ? "active-reveal" : ""
                }`}
              >
                <span>{row.rankLabel}</span>
                <strong>{row.nickname}</strong>
                <em>{row.score}</em>
                <em>{row.solved}/{room.exam.problemCount}</em>
                <em>{formatPenalty(row.penaltyMs)}</em>
                {row.cells.map((cell) => {
                  const isActiveCell = currentRevealEvent?.playerId === row.playerId && currentRevealEvent.submission.problemId === cell.problemId;
                  return (
                    <span
                      key={cell.problemId}
                      ref={(element) => {
                        const key = makeRevealCellKey(row.playerId, cell.problemId);
                        if (element) revealCellRefs.current.set(key, element);
                        else revealCellRefs.current.delete(key);
                      }}
                      className={`reveal-problem-cell ${cell.status} ${isActiveCell ? "active-cell" : ""}`}
                    >
                      <b>{cell.primary}</b>
                      {cell.secondary && <small>{cell.secondary}</small>}
                    </span>
                  );
                })}
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

function makeNextRevealLabel(event: RevealEvent | undefined, room: RoomPublic) {
  if (!event) return "다음 비공개 시도 공개 대기";
  const problemNumber = room.exam.problems.find((problem) => problem.id === event.submission.problemId)?.number ?? "?";
  return `${event.nickname}의 ${problemNumber}번 시도 공개 대기`;
}

function makeRevealCellKey(playerId: string, problemId: string) {
  return `${playerId}:${problemId}`;
}
