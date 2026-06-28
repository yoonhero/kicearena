import type { Server } from "socket.io";
import type { ExamManifest, RoomPublic } from "../shared/game.js";
import { examFreezeBeforeSec } from "../shared/game.js";
import { isExamReleased, toExamPublic, toExamSummary } from "./exams.js";
import { derivePlayerScoreState, makeStandings, normalizeSubmissionPenalty } from "./scoring.js";
import type { RoomState } from "./types.js";

export const createRoomRuntime = ({
    io,
    pendingRoomBroadcasts,
    expiredEffectNoticeMs,
    spectatorCount,
    addLog,
    touchRoom,
    persistRoom,
    afterRoomCommit,
    readEventRooms,
    withRoomMutation,
    getPersistedRoom,
}: {
    io: Server;
    pendingRoomBroadcasts: Map<string, ReturnType<typeof setTimeout>>;
    expiredEffectNoticeMs: number;
    spectatorCount: (roomCode: string) => number;
    addLog: (room: RoomState, kind: "system" | "submit" | "item", message: string) => void;
    touchRoom: (room: RoomState) => void;
    persistRoom: (room: RoomState) => void;
    afterRoomCommit: (action: () => void) => void;
    readEventRooms: (examId: string, statuses: RoomPublic["status"][]) => Promise<RoomState[]>;
    withRoomMutation: <T>(code: string, callback: () => Promise<T>) => Promise<T>;
    getPersistedRoom: (code: string) => Promise<RoomState | null>;
}) => {
    const isScoreboardFrozen = (room: RoomState) =>
        room.status === "playing" &&
        room.scoreboardFrozenAt !== null &&
        Date.now() >= room.scoreboardFrozenAt;

    const maybeFreezeScoreboard = (room: RoomState) => {
        if (!isScoreboardFrozen(room) || room.frozenStandings.length > 0) return false;
        room.frozenStandings = makeStandings(room);
        addLog(
            room,
            "system",
            `종료 ${Math.round(room.freezeBeforeSec / 60)}분 전. 순위표가 비공개 처리되었습니다.`,
        );
        touchRoom(room);
        return true;
    };

    const maybeStartReleasedEventRoom = (room: RoomState) => {
        if (!room.eventId || room.status !== "lobby" || !isExamReleased(room.exam)) return false;
        const startedAt = Math.max(Date.now(), Date.parse(room.exam.releaseAt ?? "") || Date.now());
        room.status = "playing";
        room.startedAt = startedAt;
        room.endsAt = startedAt + room.timeLimitSec * 1000;
        room.scoreboardFrozenAt =
            room.freezeBeforeSec === 0
                ? null
                : Math.max(startedAt, room.endsAt - room.freezeBeforeSec * 1000);
        room.frozenStandings = [];
        room.scoreboardRevealCount = 0;
        for (const player of room.players.values()) player.ready = true;
        touchRoom(room);
        addLog(room, "system", "공개 시각 도달. 문제지를 배부하고 시험을 시작합니다.");
        return true;
    };

    const publicRoom = (room: RoomState): RoomPublic => ({
        code: room.code,
        hostId: room.hostId,
        exam: isExamReleased(room.exam)
            ? toExamPublic(room.exam)
            : { ...toExamSummary(room.exam), problems: [] },
        startsAt: room.exam.releaseAt ?? null,
        eventRoom: Boolean(room.eventId),
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        version: room.version,
        status: room.status,
        timeLimitSec: room.timeLimitSec,
        freezeBeforeSec: room.freezeBeforeSec,
        itemEnabled: room.itemEnabled,
        startedAt: room.startedAt,
        endsAt: room.endsAt,
        scoreboardFrozen: isScoreboardFrozen(room),
        scoreboardFrozenAt: room.scoreboardFrozenAt,
        frozenStandings: room.frozenStandings,
        scoreboardRevealCount: room.scoreboardRevealCount,
        spectatorCount: spectatorCount(room.code),
        players: [...room.players.values()].map(
            ({ socketId: _socketId, socketToken: _socketToken, ...player }) => {
                const derived = derivePlayerScoreState(room, player);
                return {
                    ...player,
                    score: derived.score,
                    penaltyMs: derived.penaltyMs,
                    scoreBreakdown: {
                        ...player.scoreBreakdown,
                        solved: derived.solved,
                    },
                    submissions: derived.normalizedSubmissions,
                    submissionHistory: (player.submissionHistory ?? player.submissions).map(
                        (submission) => normalizeSubmissionPenalty(room, submission),
                    ),
                    itemCooldowns: player.itemCooldowns ?? {},
                    effects: player.effects.filter((effect) => effect.expiresAt > Date.now()),
                    expiredEffects: (player.expiredEffects ?? []).filter(
                        (effect) => Date.now() - effect.clearedAt <= expiredEffectNoticeMs,
                    ),
                };
            },
        ),
        logs: room.logs,
    });

    const bumpRoomVersion = (room: RoomState) => {
        room.version += 1;
    };

    const isFinished = (room: RoomState) =>
        room.status === "playing" && room.endsAt !== null && Date.now() >= room.endsAt;

    const emitRoom = (room: RoomState): RoomPublic => {
        maybeStartReleasedEventRoom(room);
        if (isFinished(room)) markRoomFinished(room);
        maybeFreezeScoreboard(room);
        bumpRoomVersion(room);
        persistRoom(room);
        const snapshot = publicRoom(room);
        io.to(room.code).emit("room:update", snapshot);
        return snapshot;
    };

    const scheduleRoomBroadcast = (room: RoomState, delayMs = 50) => {
        if (pendingRoomBroadcasts.has(room.code)) return;
        pendingRoomBroadcasts.set(
            room.code,
            setTimeout(() => {
                pendingRoomBroadcasts.delete(room.code);
                const snapshot = publicRoom(room);
                io.to(room.code).emit("room:update", snapshot);
                persistRoom(room);
            }, delayMs),
        );
    };

    const emitRoomAfterCommit = (room: RoomState) => {
        maybeStartReleasedEventRoom(room);
        maybeFreezeScoreboard(room);
        bumpRoomVersion(room);
        afterRoomCommit(() => scheduleRoomBroadcast(room));
    };

    const markRoomFinished = (room: RoomState, reason = "시험 종료. 답안지를 걷습니다.") => {
        if (room.status !== "playing") return null;
        maybeFreezeScoreboard(room);
        if (room.frozenStandings.length === 0) room.frozenStandings = makeStandings(room);
        room.scoreboardRevealCount = 0;
        room.status = "finished";
        touchRoom(room);
        addLog(room, "system", "채점 완료. 프리즈 이후 비공개 시도 공개를 시작합니다.");
        addLog(room, "system", reason);
        return room;
    };

    const finishRoom = (room: RoomState, reason = "시험 종료. 답안지를 걷습니다.") => {
        if (!markRoomFinished(room, reason)) return null;
        return emitRoom(room);
    };

    const endRoom = (room: RoomState, reason: string) => {
        if (room.status === "finished") return publicRoom(room);
        if (room.status === "playing") return finishRoom(room, reason) ?? publicRoom(room);

        const endedAt = Date.now();
        room.startedAt = room.startedAt ?? endedAt;
        room.endsAt = room.endsAt ?? endedAt;
        room.scoreboardFrozenAt = null;
        room.frozenStandings = makeStandings(room);
        room.scoreboardRevealCount = 0;
        room.status = "finished";
        touchRoom(room);
        addLog(room, "system", "운영자가 대기 중인 시험을 종료했습니다.");
        addLog(room, "system", reason);
        return emitRoom(room);
    };

    const syncEventRoomExamSettings = (room: RoomState, exam: ExamManifest) => {
        if (room.eventId !== exam.id || room.status === "finished") return false;
        room.exam = exam;
        room.timeLimitSec = exam.timeLimitSec;
        room.freezeBeforeSec = examFreezeBeforeSec(exam);

        if (room.status === "lobby") {
            room.startedAt = null;
            room.endsAt = null;
            room.scoreboardFrozenAt = null;
            room.frozenStandings = [];
            room.scoreboardRevealCount = 0;
            touchRoom(room);
            return true;
        }

        if (room.startedAt !== null) {
            room.endsAt = room.startedAt + room.timeLimitSec * 1000;
            room.scoreboardFrozenAt =
                room.freezeBeforeSec === 0
                    ? null
                    : Math.max(room.startedAt, room.endsAt - room.freezeBeforeSec * 1000);
        }
        if (!isScoreboardFrozen(room)) room.frozenStandings = [];
        touchRoom(room);
        return true;
    };

    const syncEventRoomsForExam = async (exam: ExamManifest) => {
        const roomsToSync = await readEventRooms(exam.id, ["lobby", "playing"]);
        const snapshots: RoomPublic[] = [];
        for (const roomToSync of roomsToSync) {
            await withRoomMutation(roomToSync.code, async () => {
                const room = await getPersistedRoom(roomToSync.code);
                if (!room || !syncEventRoomExamSettings(room, exam)) return;
                addLog(room, "system", "운영자가 대회 시간 설정을 변경했습니다.");
                const snapshot = isFinished(room)
                    ? endRoom(room, "운영자가 변경한 대회 시간이 종료 시각을 지났습니다.")
                    : emitRoom(room);
                snapshots.push(snapshot);
            });
        }
        return snapshots;
    };

    return {
        emitRoom,
        emitRoomAfterCommit,
        endRoom,
        finishRoom,
        isFinished,
        maybeFreezeScoreboard,
        maybeStartReleasedEventRoom,
        publicRoom,
        syncEventRoomsForExam,
    };
};
