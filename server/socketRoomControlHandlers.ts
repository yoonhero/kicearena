import type { Socket } from "socket.io";
import type { RoomPublic, ServerResponse } from "../shared/game.js";
import { makeScoreboardRevealState } from "../shared/reveal.js";
import { isExamReleased } from "./exams.js";
import { readString } from "./requestUtils.js";
import type { SocketHandlerContext } from "./socketHandlerContext.js";

const registerReadyHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on("player:ready", async (payload: { ready: boolean }) => {
        if (context.shouldRateLimit(socket.id, "player:ready", context.rateLimitMs.ready)) return;
        const ref = context.socketToPlayer.get(socket.id);
        if (!ref) return;
        await context.withRoomMutation(ref.roomCode, async () => {
            const room = await context.getPersistedRoom(ref.roomCode);
            const player = room?.players.get(ref.playerId);
            if (!room || !context.isCurrentPlayerSocket(player, ref) || room.status !== "lobby")
                return;
            player.ready = payload.ready;
            context.touchRoom(room);
            context.addLog(
                room,
                "system",
                `${player.nickname}${payload.ready ? " 준비 완료" : " 준비 취소"}`,
            );
            context.emitRoom(room);
        });
    });
};

const registerStartHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:start",
        async (_payload?: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
            const ref = context.socketToPlayer.get(socket.id);
            if (!ref) {
                context.replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await context.withRoomMutation(ref.roomCode, async () => {
                const room = await context.getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (
                    !room ||
                    !context.isCurrentPlayerSocket(player, ref) ||
                    room.hostId !== ref.playerId ||
                    room.status !== "lobby"
                ) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "방장만 로비에서 시험을 시작할 수 있습니다.",
                    });
                    return;
                }
                if (room.eventId && !isExamReleased(room.exam)) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "공개 시간이 되어야 시험을 시작할 수 있습니다.",
                    });
                    return;
                }
                room.status = "playing";
                room.startedAt = Date.now();
                room.endsAt = room.startedAt + room.timeLimitSec * 1000;
                room.scoreboardFrozenAt =
                    room.freezeBeforeSec === 0
                        ? null
                        : Math.max(room.startedAt, room.endsAt - room.freezeBeforeSec * 1000);
                room.frozenStandings = [];
                room.scoreboardRevealCount = 0;
                for (const player of room.players.values()) player.ready = true;
                context.touchRoom(room);
                context.addLog(room, "system", "타종. 1교시 수학 영역을 시작합니다.");
                const snapshot = context.emitRoom(room);
                context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );
};

const registerStartIfReleasedHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:start-if-released",
        async (_payload?: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
            const playerRef = context.socketToPlayer.get(socket.id);
            const spectatorRef = context.socketToSpectator.get(socket.id);
            const roomCode = playerRef?.roomCode ?? spectatorRef?.roomCode;
            if (!roomCode) {
                context.replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "대기실 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await context.withRoomMutation(roomCode, async () => {
                const room = await context.getPersistedRoom(roomCode);
                if (!room || !room.eventId) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "이벤트 대기실을 찾을 수 없습니다.",
                    });
                    return;
                }
                if (!isExamReleased(room.exam)) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "아직 공개 시간이 되지 않았습니다.",
                    });
                    return;
                }
                const snapshot = context.emitRoom(room);
                context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );
};

const registerEndHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:end",
        async (_payload: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
            const ref = context.socketToPlayer.get(socket.id);
            if (!ref) {
                context.replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await context.withRoomMutation(ref.roomCode, async () => {
                const room = await context.getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (
                    !room ||
                    !context.isCurrentPlayerSocket(player, ref) ||
                    room.hostId !== ref.playerId
                ) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "방장만 시험을 종료할 수 있습니다.",
                    });
                    return;
                }
                if (room.status !== "playing") {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "진행 중인 시험이 아닙니다.",
                    });
                    return;
                }

                const snapshot =
                    context.finishRoom(
                        room,
                        "방장이 시험을 조기 종료했습니다. 답안지를 걷습니다.",
                    ) ?? context.publicRoom(room);
                context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );
};

const registerRevealHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:reveal-next",
        async (_payload: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
            if (
                context.shouldRateLimit(
                    socket.id,
                    "room:reveal-next",
                    context.rateLimitMs.revealNext,
                )
            ) {
                context.replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "너무 빠르게 공개하고 있습니다.",
                });
                return;
            }
            const ref = context.socketToPlayer.get(socket.id);
            if (!ref) {
                context.replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await context.withRoomMutation(ref.roomCode, async () => {
                const room = await context.getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (
                    !room ||
                    !context.isCurrentPlayerSocket(player, ref) ||
                    room.hostId !== ref.playerId
                ) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "방장만 순위표를 공개할 수 있습니다.",
                    });
                    return;
                }
                if (room.status !== "finished") {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "시험 종료 후 공개할 수 있습니다.",
                    });
                    return;
                }

                const total = makeScoreboardRevealState(context.publicRoom(room)).total;
                if (room.scoreboardRevealCount >= total) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "공개할 비공개 시도가 더 없습니다.",
                    });
                    return;
                }
                room.scoreboardRevealCount = Math.min(total, room.scoreboardRevealCount + 1);
                context.addLog(
                    room,
                    "system",
                    "프리즈 이후 비공개 시도의 정답 여부를 한 건 공개했습니다.",
                );
                context.touchRoom(room);
                const snapshot = context.emitRoom(room);
                context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );
};

const registerProblemSetHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on("problem:set", async (payload: { problemId: string }) => {
        if (context.shouldRateLimit(socket.id, "problem:set", context.rateLimitMs.problemSet))
            return;
        const ref = context.socketToPlayer.get(socket.id);
        if (!ref) return;
        await context.withRoomMutation(ref.roomCode, async () => {
            const room = await context.getPersistedRoom(ref.roomCode);
            const player = room?.players.get(ref.playerId);
            const problemId = readString(payload?.problemId, 80);
            if (
                !room ||
                !context.isCurrentPlayerSocket(player, ref) ||
                !context.getProblem(room, problemId)
            )
                return;
            const hasHardLock = player.effects.some(
                (effect) => effect.id === "hardFirst" && effect.expiresAt > Date.now(),
            );
            const problem = context.getProblem(room, problemId);
            if (hasHardLock && problem && problem.difficulty < 4) return;
            if (player.currentProblemId === problemId) return;
            player.currentProblemId = problemId;
            context.touchRoom(room);
            context.emitRoom(room);
        });
    });
};

export const registerRoomControlHandlers = (socket: Socket, context: SocketHandlerContext) => {
    registerReadyHandler(socket, context);
    registerStartHandler(socket, context);
    registerStartIfReleasedHandler(socket, context);
    registerEndHandler(socket, context);
    registerRevealHandler(socket, context);
    registerProblemSetHandler(socket, context);
};
