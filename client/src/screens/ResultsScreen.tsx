import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import { FileText, RotateCw } from "lucide-react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { makeScoreboardRevealState } from "../../../shared/reveal";
import { formatPenalty, formatReportDate } from "../lib/format";
import { isEditableShortcutTarget } from "../lib/keyboard";
import { emitWithEmptyPayloadAck } from "../lib/socket";
import { makePlayerStandingRows } from "../lib/report";
import { FinalReportView } from "./FinalReportView";
import {
    findNearestRevealProblemHeader,
    getRevealProblemScrollLeft,
    getRevealRectAdjustedScrollLeft,
    getRevealVisibleScrollLeft,
    makeNextRevealLabel,
    makeRevealCellKey,
    scrollElementVerticallyIntoView,
} from "./resultsRevealHelpers";

const REVEAL_QUEUE_INTERVAL_MS = 270;

export function ResultsScreen({
    room,
    ownPlayer,
    onLeave,
}: {
    room: RoomPublic;
    ownPlayer: PlayerPublic | null;
    onLeave: () => Promise<void>;
}) {
    const [reportOpen, setReportOpen] = useState(false);
    const [revealError, setRevealError] = useState("");
    const [revealPending, setRevealPending] = useState(false);
    const [focusedProblemId, setFocusedProblemId] = useState(() => room.exam.problems[0]?.id ?? "");
    const revealBoardRef = useRef<HTMLDivElement | null>(null);
    const revealFocusTimerRef = useRef<number | null>(null);
    const revealRowRefs = useRef(new Map<string, HTMLDivElement>());
    const revealCellRefs = useRef(new Map<string, HTMLSpanElement>());
    const previousRevealRowRects = useRef(new Map<string, DOMRect>());
    const revealCountRef = useRef(0);
    const revealTotalRef = useRef(0);
    const allRevealedRef = useRef(false);
    const isHostRef = useRef(false);
    const reportOpenRef = useRef(false);
    const queuedRevealRequestsRef = useRef(0);
    const revealInFlightRef = useRef(false);
    const revealQueueTimerRef = useRef<number | null>(null);
    const revealLastSentAtRef = useRef(0);
    const openReportWhenQueueSettlesRef = useRef(false);
    const finalRows = useMemo(() => makePlayerStandingRows(room), [room]);
    const playerById = useMemo(
        () => new Map(room.players.map((player) => [player.id, player])),
        [room.players],
    );
    const players = finalRows
        .map((row) => playerById.get(row.playerId))
        .filter((player): player is PlayerPublic => Boolean(player));
    const frozenRows = room.frozenStandings.length > 0 ? room.frozenStandings : finalRows;
    const revealState = useMemo(
        () => makeScoreboardRevealState(room, frozenRows),
        [room, frozenRows],
    );
    const revealTotal = revealState.total;
    const revealCount = Math.min(room.scoreboardRevealCount, revealTotal);
    const allRevealed = revealTotal === 0 || revealCount >= revealTotal;
    const isHost = ownPlayer?.id === room.hostId;

    const revealRows = useMemo(
        () =>
            makeScoreboardRevealState(room, frozenRows, revealCount, {
                viewerPlayerId: ownPlayer?.id,
            }).rows,
        [room, frozenRows, revealCount, ownPlayer?.id],
    );
    const nextRevealRow = revealState.events[revealCount];
    const currentRevealEvent = revealCount > 0 ? revealState.events[revealCount - 1] : undefined;
    const focusedProblem =
        room.exam.problems.find((problem) => problem.id === focusedProblemId) ??
        room.exam.problems[0];
    const spinStyle = { "--reveal-turns": `${Math.max(1, revealCount + 1)}turn` } as CSSProperties;

    const processRevealQueue = useCallback(() => {
        if (
            revealQueueTimerRef.current !== null ||
            revealInFlightRef.current ||
            reportOpenRef.current
        )
            return;

        if (!isHostRef.current) {
            queuedRevealRequestsRef.current = 0;
            setRevealPending(false);
            return;
        }

        if (allRevealedRef.current) {
            queuedRevealRequestsRef.current = 0;
            setRevealPending(false);
            if (openReportWhenQueueSettlesRef.current) {
                openReportWhenQueueSettlesRef.current = false;
                setReportOpen(true);
            }
            return;
        }

        if (queuedRevealRequestsRef.current <= 0) {
            setRevealPending(false);
            return;
        }

        const elapsedMs = Date.now() - revealLastSentAtRef.current;
        const delayMs = Math.max(0, REVEAL_QUEUE_INTERVAL_MS - elapsedMs);
        if (delayMs > 0) {
            revealQueueTimerRef.current = window.setTimeout(() => {
                revealQueueTimerRef.current = null;
                processRevealQueue();
            }, delayMs);
            return;
        }

        queuedRevealRequestsRef.current -= 1;
        revealInFlightRef.current = true;
        revealLastSentAtRef.current = Date.now();
        setRevealPending(true);
        setRevealError("");

        void emitWithEmptyPayloadAck<RoomPublic>("room:reveal-next")
            .then((response) => {
                if (response.ok) return;
                if ((response.error ?? "").includes("너무 빠르게")) {
                    queuedRevealRequestsRef.current += 1;
                    return;
                }
                if ((response.error ?? "").includes("더 없습니다")) {
                    queuedRevealRequestsRef.current = 0;
                    openReportWhenQueueSettlesRef.current = false;
                    setReportOpen(true);
                    return;
                }
                queuedRevealRequestsRef.current = 0;
                openReportWhenQueueSettlesRef.current = false;
                setRevealError(response.error ?? "순위표 공개 실패");
            })
            .finally(() => {
                revealInFlightRef.current = false;
                processRevealQueue();
            });
    }, []);

    const requestRevealAdvance = useCallback(() => {
        if (!isHostRef.current || reportOpenRef.current) return;
        if (allRevealedRef.current) {
            setReportOpen(true);
            return;
        }

        const alreadyRequested =
            queuedRevealRequestsRef.current + (revealInFlightRef.current ? 1 : 0);
        const remaining = Math.max(
            0,
            revealTotalRef.current - revealCountRef.current - alreadyRequested,
        );
        if (remaining <= 0) {
            openReportWhenQueueSettlesRef.current = true;
            processRevealQueue();
            return;
        }

        queuedRevealRequestsRef.current += 1;
        setRevealPending(true);
        processRevealQueue();
    }, [processRevealQueue]);

    useEffect(() => {
        if (room.exam.problems.some((problem) => problem.id === focusedProblemId)) return;
        setFocusedProblemId(room.exam.problems[0]?.id ?? "");
    }, [focusedProblemId, room.exam.problems]);

    useEffect(() => {
        revealCountRef.current = revealCount;
        revealTotalRef.current = revealTotal;
        allRevealedRef.current = allRevealed;
        isHostRef.current = isHost;
        reportOpenRef.current = reportOpen;

        if (
            allRevealed &&
            openReportWhenQueueSettlesRef.current &&
            queuedRevealRequestsRef.current === 0 &&
            !revealInFlightRef.current
        ) {
            openReportWhenQueueSettlesRef.current = false;
            setReportOpen(true);
            return;
        }

        processRevealQueue();
    }, [allRevealed, isHost, processRevealQueue, reportOpen, revealCount, revealTotal]);

    useEffect(() => {
        return () => {
            if (revealQueueTimerRef.current !== null)
                window.clearTimeout(revealQueueTimerRef.current);
        };
    }, []);

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
        const row = revealRowRefs.current.get(currentRevealEvent.playerId);
        const cell = revealCellRefs.current.get(
            makeRevealCellKey(currentRevealEvent.playerId, currentRevealEvent.submission.problemId),
        );
        scrollElementVerticallyIntoView(row);
        focusRevealProblemCell(currentRevealEvent.submission.problemId, cell);
    }, [currentRevealEvent?.playerId, currentRevealEvent?.submission.problemId, revealCount]);

    useEffect(() => {
        if (!currentRevealEvent) return undefined;
        const frame = window.requestAnimationFrame(() => {
            const cell = revealCellRefs.current.get(
                makeRevealCellKey(
                    currentRevealEvent.playerId,
                    currentRevealEvent.submission.problemId,
                ),
            );
            focusRevealProblemCell(currentRevealEvent.submission.problemId, cell);
        });
        const timer = window.setTimeout(() => {
            const cell = revealCellRefs.current.get(
                makeRevealCellKey(
                    currentRevealEvent.playerId,
                    currentRevealEvent.submission.problemId,
                ),
            );
            focusRevealProblemCell(currentRevealEvent.submission.problemId, cell);
        }, 80);
        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, [currentRevealEvent?.playerId, currentRevealEvent?.submission.problemId, revealCount]);

    useEffect(() => {
        const board = revealBoardRef.current;
        if (!board) return undefined;

        const syncFocusedProblem = () => {
            const nearestHeader = findNearestRevealProblemHeader(board);
            if (!nearestHeader?.dataset.scoreProblemId) return;
            setFocusedProblemId(nearestHeader.dataset.scoreProblemId);
        };
        const scheduleSync = () => {
            if (revealFocusTimerRef.current !== null)
                window.clearTimeout(revealFocusTimerRef.current);
            revealFocusTimerRef.current = window.setTimeout(() => {
                revealFocusTimerRef.current = null;
                syncFocusedProblem();
            }, 80);
        };

        syncFocusedProblem();
        board.addEventListener("scroll", scheduleSync, { passive: true });
        return () => {
            board.removeEventListener("scroll", scheduleSync);
            if (revealFocusTimerRef.current !== null) {
                window.clearTimeout(revealFocusTimerRef.current);
                revealFocusTimerRef.current = null;
            }
        };
    }, [room.exam.problems]);

    const focusRevealProblemColumn = (problemId: string, behavior: ScrollBehavior = "smooth") => {
        const board = revealBoardRef.current;
        if (!board) return;
        const header = Array.from(
            board.querySelectorAll<HTMLElement>(".domjudge-header [data-score-problem-id]"),
        ).find((element) => element.dataset.scoreProblemId === problemId);
        if (!header) return;
        setFocusedProblemId(problemId);
        board.scrollTo({
            left: getRevealProblemScrollLeft(board, header),
            behavior,
        });
    };

    const focusRevealProblemCell = (problemId: string, cell: HTMLElement | undefined) => {
        const board = revealBoardRef.current;
        if (!board) return;
        setFocusedProblemId(problemId);
        if (cell) {
            board.scrollLeft = getRevealVisibleScrollLeft(board, cell);
            board.scrollLeft = getRevealRectAdjustedScrollLeft(board, cell);
            return;
        }
        focusRevealProblemColumn(problemId, "auto");
    };

    useEffect(() => {
        if (reportOpen) return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.key !== "Enter" ||
                event.repeat ||
                event.defaultPrevented ||
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                event.isComposing ||
                isEditableShortcutTarget(event.target)
            )
                return;
            if (!isHost) return;
            event.preventDefault();
            requestRevealAdvance();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isHost, reportOpen, requestRevealAdvance]);

    if (!reportOpen) {
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
                                onClick={requestRevealAdvance}
                            >
                                <RotateCw size={18} />
                                다음 시도 공개
                            </button>
                        )}
                        {!allRevealed && !isHost && <em>방장 공개 대기</em>}
                        {allRevealed && (
                            <button
                                className="reveal-next-btn"
                                type="button"
                                onClick={() => setReportOpen(true)}
                            >
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
                                    currentRevealEvent?.playerId === row.playerId
                                        ? "active-reveal"
                                        : ""
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
                                                if (element)
                                                    revealCellRefs.current.set(key, element);
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
                                onClick={() => focusRevealProblemColumn(problem.id)}
                            >
                                <span />
                            </button>
                        ))}
                    </div>
                </section>
            </main>
        );
    }

    return (
        <FinalReportView room={room} ownPlayer={ownPlayer} players={players} onLeave={onLeave} />
    );
}
