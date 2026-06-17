import { EyeOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { useCountdown } from "../hooks/useCountdown";
import { formatElapsed, formatPenalty, formatTime } from "../lib/format";
import { makePlayerStandingRows } from "../lib/report";

const PROBLEM_RANGE_SIZE = 10;

export function RankingsScreen({
    room,
    ownPlayer,
    onBack,
}: {
    room: RoomPublic;
    ownPlayer: PlayerPublic | null;
    onBack: () => void;
}) {
    const timeLeft = useCountdown(room);
    const boardRef = useRef<HTMLDivElement | null>(null);
    const scrollSnapTimerRef = useRef<number | null>(null);
    const [problemRange, setProblemRange] = useState(() =>
        room.exam.problemCount > PROBLEM_RANGE_SIZE ? `1-${PROBLEM_RANGE_SIZE}` : "all",
    );
    const [focusedProblemId, setFocusedProblemId] = useState("");
    const liveRows = useMemo(() => makePlayerStandingRows(room), [room]);
    const rows =
        room.scoreboardFrozen && room.frozenStandings.length > 0 ? room.frozenStandings : liveRows;
    const playerById = useMemo(
        () => new Map(room.players.map((player) => [player.id, player])),
        [room.players],
    );
    const visibleUntil = room.scoreboardFrozen ? room.scoreboardFrozenAt : null;
    const problemRanges = useMemo(
        () => makeProblemRanges(room.exam.problemCount),
        [room.exam.problemCount],
    );
    const visibleProblems = useMemo(() => {
        const selectedRange = problemRanges.find((range) => range.id === problemRange);
        if (!selectedRange || selectedRange.id === "all") return room.exam.problems;
        return room.exam.problems.filter(
            (problem) => problem.number >= selectedRange.from && problem.number <= selectedRange.to,
        );
    }, [problemRange, problemRanges, room.exam.problems]);
    const visibleProblemIds = useMemo(
        () => visibleProblems.map((problem) => problem.id).join("|"),
        [visibleProblems],
    );
    const firstVisibleProblemId = visibleProblems[0]?.id ?? "";
    const focusedProblem =
        visibleProblems.find((problem) => problem.id === focusedProblemId) ?? visibleProblems[0];

    useEffect(() => {
        setFocusedProblemId(firstVisibleProblemId);
        if (boardRef.current) boardRef.current.scrollLeft = 0;
    }, [firstVisibleProblemId, problemRange, visibleProblemIds]);

    useEffect(() => {
        const board = boardRef.current;
        if (!board) return undefined;

        const snapToNearestProblem = () => {
            const nearestHeader = findNearestProblemHeader(board);
            if (!nearestHeader?.dataset.scoreProblemId) return;
            const targetLeft = Math.max(0, nearestHeader.offsetLeft - readStickyWidth(board));
            setFocusedProblemId(nearestHeader.dataset.scoreProblemId);
            if (Math.abs(board.scrollLeft - targetLeft) <= 1) return;
            board.scrollTo({
                left: targetLeft,
                behavior: "smooth",
            });
        };
        const scheduleSnap = () => {
            if (scrollSnapTimerRef.current !== null)
                window.clearTimeout(scrollSnapTimerRef.current);
            scrollSnapTimerRef.current = window.setTimeout(() => {
                scrollSnapTimerRef.current = null;
                snapToNearestProblem();
            }, 110);
        };

        setFocusedProblemId(
            findNearestProblemHeader(board)?.dataset.scoreProblemId ?? firstVisibleProblemId,
        );
        board.addEventListener("scroll", scheduleSnap, { passive: true });
        return () => {
            board.removeEventListener("scroll", scheduleSnap);
            if (scrollSnapTimerRef.current !== null) {
                window.clearTimeout(scrollSnapTimerRef.current);
                scrollSnapTimerRef.current = null;
            }
        };
    }, [firstVisibleProblemId, visibleProblemIds]);

    const focusProblemColumn = (problemId: string) => {
        const board = boardRef.current;
        if (!board) return;
        const header = Array.from(
            board.querySelectorAll<HTMLElement>(".domjudge-header [data-score-problem-id]"),
        ).find((element) => element.dataset.scoreProblemId === problemId);
        if (!header) return;
        setFocusedProblemId(problemId);
        board.scrollTo({
            left: Math.max(0, header.offsetLeft - readStickyWidth(board)),
            behavior: "smooth",
        });
    };

    return (
        <main className="rankings-layout">
            <section className="exam-sheet rankings-sheet">
                <div className="rankings-head">
                    <button className="back-link" onClick={onBack}>
                        {ownPlayer ? "문제로 돌아가기" : "나가기"}
                    </button>
                    <div>
                        <span>{room.scoreboardFrozen ? "순위 비공개" : "실시간 채점"}</span>
                        <h1>순위표</h1>
                    </div>
                    <strong>{formatTime(timeLeft)}</strong>
                </div>
                {room.scoreboardFrozen && (
                    <div className="freeze-slip">
                        <EyeOff size={18} />
                        공개 순위는 고정되었습니다. 내 실제 점수는 계속 반영됩니다.
                    </div>
                )}
                <div className="scoreboard-state-strip" aria-label="순위표 상태">
                    <span className={room.scoreboardFrozen ? "frozen" : "live"}>
                        {room.scoreboardFrozen ? "FROZEN" : "LIVE"}
                    </span>
                    <span>
                        <b>AC</b> 정답 점수와 누적 페널티
                    </span>
                    <span>
                        <b>WA</b> 오답 시도 수
                    </span>
                    {room.scoreboardFrozen && (
                        <span>
                            <b>HOLD</b> 프리즈 이후 제출
                        </span>
                    )}
                </div>
                <div className="rankings-toolbar">
                    <div
                        className="problem-range-tabs"
                        role="tablist"
                        aria-label="순위표 문항 범위"
                    >
                        {problemRanges.map((range) => (
                            <button
                                key={range.id}
                                type="button"
                                role="tab"
                                aria-selected={problemRange === range.id}
                                className={problemRange === range.id ? "selected" : ""}
                                onClick={() => setProblemRange(range.id)}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>
                    <span>
                        {visibleProblems.length}/{room.exam.problemCount}문항 표시
                    </span>
                </div>
                <div
                    ref={boardRef}
                    className="domjudge-board"
                    style={
                        { "--problem-count": String(visibleProblems.length) } as CSSProperties &
                            Record<string, string>
                    }
                >
                    <div className="domjudge-row domjudge-header">
                        <span>순위</span>
                        <strong>참가자</strong>
                        <em>제출</em>
                        <em>점수</em>
                        <em>페널티</em>
                        <em>정답</em>
                        {visibleProblems.map((problem) => (
                            <span key={problem.id} data-score-problem-id={problem.id}>
                                P{problem.number}
                            </span>
                        ))}
                    </div>
                    {rows.map((standing, index) => {
                        const player = playerById.get(standing.playerId);
                        const ownRow = standing.playerId === ownPlayer?.id;
                        const displayStanding = ownRow
                            ? {
                                  ...standing,
                                  score: ownPlayer.score,
                                  penaltyMs: ownPlayer.penaltyMs,
                                  solved: ownPlayer.scoreBreakdown.solved,
                              }
                            : standing;
                        return (
                            <div
                                key={standing.playerId}
                                className={`domjudge-row ${ownRow ? "me" : ""}`}
                            >
                                <span>{index + 1}</span>
                                <strong>{standing.nickname}</strong>
                                <em>{player ? formatSubmissionCount(player) : "-"}</em>
                                <em>{displayStanding.score}</em>
                                <span>{formatPenalty(displayStanding.penaltyMs)}</span>
                                <span>
                                    {displayStanding.solved}/{room.exam.problemCount}
                                </span>
                                {visibleProblems.map((problem) => {
                                    const cell = player
                                        ? makeProblemScoreCell(
                                              player,
                                              problem.id,
                                              room.startedAt,
                                              ownRow ? null : visibleUntil,
                                          )
                                        : null;
                                    return (
                                        <span
                                            key={problem.id}
                                            className={cell?.className ?? ""}
                                            title={cell?.title ?? `P${problem.number}`}
                                        >
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
                <div className="scoreboard-scroll-dots" aria-label="순위표 문항 포커스">
                    {visibleProblems.map((problem) => (
                        <button
                            key={problem.id}
                            type="button"
                            className={focusedProblem?.id === problem.id ? "active" : ""}
                            aria-label={`P${problem.number} 열 보기`}
                            aria-pressed={focusedProblem?.id === problem.id}
                            onClick={() => focusProblemColumn(problem.id)}
                        >
                            <span />
                        </button>
                    ))}
                </div>
                {room.scoreboardFrozen && ownPlayer && (
                    <div className="private-score rankings-private-score">
                        <span>내 실제 채점</span>
                        <strong>
                            {ownPlayer.score}점 · 페널티 {formatPenalty(ownPlayer.penaltyMs)} ·{" "}
                            {ownPlayer.scoreBreakdown.solved}/{room.exam.problemCount} AC
                        </strong>
                    </div>
                )}
            </section>
        </main>
    );
}

function findNearestProblemHeader(board: HTMLElement) {
    const stickyWidth = readStickyWidth(board);
    const headers = Array.from(
        board.querySelectorAll<HTMLElement>(".domjudge-header [data-score-problem-id]"),
    );
    if (headers.length === 0) return null;
    return headers.reduce((nearest, header) => {
        const nearestDistance = Math.abs(nearest.offsetLeft - stickyWidth - board.scrollLeft);
        const headerDistance = Math.abs(header.offsetLeft - stickyWidth - board.scrollLeft);
        return headerDistance < nearestDistance ? header : nearest;
    }, headers[0]);
}

function readStickyWidth(board: HTMLElement) {
    const header = board.querySelector<HTMLElement>(".domjudge-header");
    if (!header) return 0;
    return Array.from(header.children)
        .slice(0, 6)
        .reduce((sum, child) => sum + (child as HTMLElement).offsetWidth, 0);
}

function makeProblemRanges(problemCount: number) {
    const ranges = [{ id: "all", label: "전체", from: 1, to: problemCount }];
    for (let from = 1; from <= problemCount; from += PROBLEM_RANGE_SIZE) {
        const to = Math.min(problemCount, from + PROBLEM_RANGE_SIZE - 1);
        ranges.push({
            id: `${from}-${to}`,
            label: `${from}-${to}`,
            from,
            to,
        });
    }
    return ranges;
}

function formatSubmissionCount(player: PlayerPublic) {
    const count = (player.submissionHistory ?? player.submissions).length;
    return `${count}회`;
}

function makeProblemScoreCell(
    player: PlayerPublic,
    problemId: string,
    startedAt: number | null,
    visibleUntil: number | null,
) {
    const history = (player.submissionHistory ?? player.submissions)
        .filter((item) => item.problemId === problemId)
        .sort((a, b) => a.submittedAt - b.submittedAt);
    const hiddenAttempts =
        visibleUntil === null
            ? 0
            : history.filter((item) => item.submittedAt > visibleUntil).length;
    const visibleHistory = history.filter(
        (item) => visibleUntil === null || item.submittedAt <= visibleUntil,
    );
    const submission = visibleHistory.at(-1);
    const visiblePenaltyMs = visibleHistory.reduce((sum, item) => sum + item.penaltyMs, 0);

    if (hiddenAttempts > 0 && !submission) {
        return {
            className: "frozen-attempt",
            primary: `${hiddenAttempts}회`,
            secondary: "HOLD",
            title: `프리즈 이후 제출 ${hiddenAttempts}회`,
        };
    }

    if (!submission) return null;

    if (submission.correct) {
        return {
            className: "accepted",
            primary: `+${submission.scoreAwarded}`,
            secondary: `AC ${submission.attempts}회 · ${formatPenalty(visiblePenaltyMs)}`,
            title: `정답 +${submission.scoreAwarded}, 페널티 ${formatPenalty(visiblePenaltyMs)}, ${submission.attempts}회 시도`,
        };
    }

    return {
        className: hiddenAttempts > 0 ? "tried frozen-with-attempts" : "tried",
        primary: `${submission.attempts}회`,
        secondary:
            hiddenAttempts > 0
                ? `WA · HOLD ${hiddenAttempts}회`
                : `WA · ${formatElapsed(startedAt, submission.submittedAt)}`,
        title:
            hiddenAttempts > 0
                ? `오답 ${submission.attempts}회, 프리즈 이후 제출 ${hiddenAttempts}회`
                : `오답 ${submission.attempts}회, ${formatElapsed(startedAt, submission.submittedAt)} 제출`,
    };
}
