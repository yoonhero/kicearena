import { type CSSProperties, type RefObject } from "react";
import { FileText, RotateCw } from "lucide-react";
import type { ProblemPublic, RoomPublic } from "../../../shared/game";
import type { makeScoreboardRevealState, RevealEvent } from "../../../shared/reveal";
import { formatPenalty, formatReportDate } from "../lib/format";
import { makeNextRevealLabel, makeRevealCellKey } from "./resultsRevealHelpers";

type RevealRows = ReturnType<typeof makeScoreboardRevealState>["rows"];

export function ResultsRevealBoard({
    room,
    revealBoardRef,
    revealRowRefs,
    revealCellRefs,
    revealRows,
    revealCount,
    revealTotal,
    allRevealed,
    isHost,
    revealPending,
    revealError,
    nextRevealRow,
    currentRevealEvent,
    focusedProblem,
    spinStyle,
    onRevealAdvance,
    onOpenReport,
    onFocusProblemColumn,
}: {
    room: RoomPublic;
    revealBoardRef: RefObject<HTMLDivElement | null>;
    revealRowRefs: RefObject<Map<string, HTMLDivElement>>;
    revealCellRefs: RefObject<Map<string, HTMLSpanElement>>;
    revealRows: RevealRows;
    revealCount: number;
    revealTotal: number;
    allRevealed: boolean;
    isHost: boolean;
    revealPending: boolean;
    revealError: string;
    nextRevealRow: RevealEvent | undefined;
    currentRevealEvent: RevealEvent | undefined;
    focusedProblem: ProblemPublic | undefined;
    spinStyle: CSSProperties;
    onRevealAdvance: () => void;
    onOpenReport: () => void;
    onFocusProblemColumn: (problemId: string) => void;
}) {
    return (
        <main className="results-layout">
            <section className="exam-sheet result-sheet final-report-sheet reveal-sheet">
                <div className="exam-head final-report-head">
                    <span>{allRevealed ? "전체 공개 완료" : "비공개 시도 공개 중"}</span>
                    <strong>프리즈 해제</strong>
                </div>
                <div
                    className={`reveal-dial ${allRevealed ? "complete" : ""}`}
                    style={spinStyle}
                    aria-hidden="true"
                >
                    <RotateCw size={42} />
                    <strong>
                        {revealCount}/{revealTotal}
                    </strong>
                </div>
                <div className="score-report-title">
                    <strong>{formatReportDate()} 시행 최종 순위표</strong>
                    <em>{room.exam.title}</em>
                </div>
                <div className="reveal-control-strip">
                    <div>
                        <span>{allRevealed ? "다음 행동" : "다음 공개"}</span>
                        <strong>
                            {allRevealed
                                ? "비공개 시도가 모두 공개되었습니다."
                                : makeNextRevealLabel(nextRevealRow, room)}
                        </strong>
                    </div>
                    {!allRevealed && isHost && (
                        <button
                            className="reveal-next-btn"
                            type="button"
                            aria-busy={revealPending}
                            onClick={onRevealAdvance}
                        >
                            <RotateCw size={18} />
                            다음 시도 공개
                        </button>
                    )}
                    {!allRevealed && !isHost && <em>방장 공개 대기</em>}
                    {allRevealed && (
                        <button className="reveal-next-btn" type="button" onClick={onOpenReport}>
                            <FileText size={18} />
                            최종 성적표 보기
                        </button>
                    )}
                </div>
                {revealError && <p className="reveal-error">{revealError}</p>}
                <div
                    ref={revealBoardRef}
                    className="domjudge-board reveal-domjudge-board"
                    style={
                        { "--problem-count": String(room.exam.problemCount) } as CSSProperties &
                            Record<string, string>
                    }
                >
                    <div className="domjudge-row reveal-row domjudge-header">
                        <span>현재</span>
                        <span>수험자</span>
                        <em>공개</em>
                        <span>점수</span>
                        <span>페널티</span>
                        <span>AC</span>
                        {room.exam.problems.map((problem) => (
                            <span
                                key={problem.id}
                                data-score-problem-id={problem.id}
                                className={
                                    focusedProblem?.id === problem.id ? "focused-problem" : ""
                                }
                            >
                                P{problem.number}
                            </span>
                        ))}
                    </div>
                    {revealRows.map((row) => (
                        <div
                            key={row.playerId}
                            ref={(element) => {
                                if (element) revealRowRefs.current.set(row.playerId, element);
                                else revealRowRefs.current.delete(row.playerId);
                            }}
                            className={`domjudge-row reveal-row ${row.revealedCount > 0 ? "revealed" : "locked"} ${row.movedToTop ? "moved-up" : ""} ${
                                currentRevealEvent?.playerId === row.playerId ? "active-reveal" : ""
                            }`}
                        >
                            <span>{row.rankLabel}</span>
                            <strong>{row.nickname}</strong>
                            <em>{row.attemptLabel}</em>
                            <em>{row.score}</em>
                            <span>{formatPenalty(row.penaltyMs)}</span>
                            <span>
                                {row.solved}/{room.exam.problemCount}
                            </span>
                            {row.cells.map((cell) => {
                                const isActiveCell =
                                    currentRevealEvent?.playerId === row.playerId &&
                                    currentRevealEvent.submission.problemId === cell.problemId;
                                return (
                                    <span
                                        key={`${cell.problemId}:${isActiveCell ? revealCount : "idle"}`}
                                        ref={(element) => {
                                            const key = makeRevealCellKey(
                                                row.playerId,
                                                cell.problemId,
                                            );
                                            if (element) revealCellRefs.current.set(key, element);
                                            else revealCellRefs.current.delete(key);
                                        }}
                                        className={`reveal-problem-cell ${cell.status} ${focusedProblem?.id === cell.problemId ? "focused-column" : ""} ${isActiveCell ? "active-cell" : ""}`}
                                    >
                                        <b>{cell.primary}</b>
                                        {cell.secondary && <small>{cell.secondary}</small>}
                                    </span>
                                );
                            })}
                        </div>
                    ))}
                </div>
                <div
                    className="scoreboard-scroll-dots reveal-scroll-dots"
                    aria-label="성적 공개 문항 포커스"
                >
                    {room.exam.problems.map((problem) => (
                        <button
                            key={problem.id}
                            type="button"
                            className={focusedProblem?.id === problem.id ? "active" : ""}
                            aria-label={`P${problem.number} 열 보기`}
                            aria-pressed={focusedProblem?.id === problem.id}
                            onClick={() => onFocusProblemColumn(problem.id)}
                        >
                            <span />
                        </button>
                    ))}
                </div>
            </section>
        </main>
    );
}
