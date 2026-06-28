import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { makeScoreboardRevealState } from "../../../shared/reveal";
import { isEditableShortcutTarget } from "../lib/keyboard";
import { emitWithEmptyPayloadAck } from "../lib/socket";
import { makePlayerStandingRows } from "../lib/report";
import { FinalReportView } from "./FinalReportView";
import { ResultsRevealBoard } from "./ResultsRevealBoard";
import {
    findNearestRevealProblemHeader,
    getRevealProblemScrollLeft,
    getRevealRectAdjustedScrollLeft,
    getRevealVisibleScrollLeft,
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
            <ResultsRevealBoard
                room={room}
                revealBoardRef={revealBoardRef}
                revealRowRefs={revealRowRefs}
                revealCellRefs={revealCellRefs}
                revealRows={revealRows}
                revealCount={revealCount}
                revealTotal={revealTotal}
                allRevealed={allRevealed}
                isHost={isHost}
                revealPending={revealPending}
                revealError={revealError}
                nextRevealRow={nextRevealRow}
                currentRevealEvent={currentRevealEvent}
                focusedProblem={focusedProblem}
                spinStyle={spinStyle}
                onRevealAdvance={requestRevealAdvance}
                onOpenReport={() => setReportOpen(true)}
                onFocusProblemColumn={focusRevealProblemColumn}
            />
        );
    }

    return (
        <FinalReportView room={room} ownPlayer={ownPlayer} players={players} onLeave={onLeave} />
    );
}
