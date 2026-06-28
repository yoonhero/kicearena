import type { Socket } from "socket.io";
import { ROOM_GUARDRAILS, examFreezeBeforeSec } from "../shared/game.js";
import { sanitizeNickname } from "../shared/nickname.js";
import {
    itemEnabledForRoomMode,
    maxPlayersForRoomMode,
    normalizeRoomMode,
} from "../shared/roomConfig.js";
import { validateRoomJoin } from "../shared/roomLifecycle.js";
import { isExamReleased } from "./exams.js";
import { createPlayerState } from "./playerFactory.js";
import { readString } from "./requestUtils.js";
import type { RoomPublicReply, SocketHandlerContext } from "./socketHandlerContext.js";
import type { RoomState } from "./types.js";

const registerRoomRejoinHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:rejoin",
        async (payload: { code: string; playerId: string }, reply: RoomPublicReply) => {
            const code = readString(payload?.code, 8).toUpperCase();
            await context.withRoomMutation(code, async () => {
                const room = await context.getPersistedRoom(code);
                const player = room?.players.get(readString(payload?.playerId, 32));
                if (!room || !player) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "이전에 입실했던 방을 찾을 수 없습니다.",
                    });
                    return;
                }
                if (room.eventId) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "대회는 다시 입실해 새 참가 정보로 등록하세요.",
                    });
                    return;
                }

                const previousSocketId = player.socketId;
                const socketToken = context.makeSocketToken();
                player.socketId = socket.id;
                player.socketToken = socketToken;
                player.connected = true;
                context.io.sockets.sockets.get(previousSocketId)?.leave(code);
                socket.join(code);
                context.cleanupRoomSocketsAcrossCluster({
                    roomCode: code,
                    playerIds: [player.id],
                    socketIds: previousSocketId ? [previousSocketId] : [],
                    excludeSocketIds: [socket.id],
                });
                context.setSocketPlayer(socket, {
                    roomCode: code,
                    playerId: player.id,
                    socketToken,
                });
                context.touchRoom(room);
                socket.emit("player:you", player.id);
                context.addLog(
                    room,
                    "system",
                    `${player.nickname} 재입실. 기존 수험번호를 복구했습니다.`,
                );
                const snapshot = context.emitRoom(room);
                context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );
};

const registerRoomCreateHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:create",
        async (
            payload: {
                examId: string;
                nickname: string;
                timeLimitSec?: number;
                freezeBeforeSec?: number;
                itemEnabled: boolean;
                mode?: unknown;
            },
            reply: RoomPublicReply,
        ) => {
            await context.withRoomMutation("__room_create__", async () => {
                if ((await context.activeRoomCount()) >= ROOM_GUARDRAILS.maxActiveRooms) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "현재 생성 가능한 방 수를 초과했습니다. 잠시 후 다시 시도하세요.",
                    });
                    return;
                }

                const exam = context.getExamById().get(readString(payload?.examId, 80));
                if (!exam) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "등록된 시험을 찾을 수 없습니다.",
                    });
                    return;
                }
                if (!isExamReleased(exam)) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "아직 공개 전인 시험입니다.",
                    });
                    return;
                }

                const nickname = sanitizeNickname(
                    readString(payload?.nickname, ROOM_GUARDRAILS.maxNicknameLength),
                );
                if (!nickname) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "닉네임을 입력하세요.",
                    });
                    return;
                }
                if (payload?.mode === "contest") {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "콘테스트는 초대받은 계정만 이벤트 등록으로 입장할 수 있습니다.",
                    });
                    return;
                }

                const mode = normalizeRoomMode(payload?.mode);
                const timeLimitSec = context.readPositiveSeconds(
                    payload?.timeLimitSec,
                    exam.timeLimitSec,
                    ROOM_GUARDRAILS.minTimeLimitSec,
                    ROOM_GUARDRAILS.maxTimeLimitSec,
                );
                const playerId = context.makeId();
                const socketToken = context.makeSocketToken();
                const host = createPlayerState({
                    id: playerId,
                    socketId: socket.id,
                    socketToken,
                    nickname,
                    exam,
                    ready: true,
                });
                const room: RoomState = {
                    code: await context.makeAvailableCode(),
                    hostId: playerId,
                    exam,
                    mode,
                    maxPlayers: maxPlayersForRoomMode(mode),
                    version: 0,
                    status: "lobby",
                    timeLimitSec,
                    freezeBeforeSec: context.readPositiveSeconds(
                        payload?.freezeBeforeSec,
                        examFreezeBeforeSec(exam),
                        0,
                        timeLimitSec,
                    ),
                    itemEnabled: itemEnabledForRoomMode(mode, payload?.itemEnabled === true),
                    startedAt: null,
                    endsAt: null,
                    scoreboardFrozenAt: null,
                    frozenStandings: [],
                    scoreboardRevealCount: 0,
                    players: new Map([[playerId, host]]),
                    logs: [],
                    createdAt: Date.now(),
                    lastActivityAt: Date.now(),
                };

                context.rooms.set(room.code, room);
                context.serverMetrics.roomsCreatedCounter.inc();
                socket.join(room.code);
                context.setSocketPlayer(socket, { roomCode: room.code, playerId, socketToken });
                socket.emit("player:you", playerId);
                context.addLog(room, "system", `${nickname} 출제위원장이 방을 열었습니다.`);
                const snapshot = context.emitRoom(room);
                context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );
};

const registerRoomJoinHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:join",
        async (payload: { code: string; nickname: string }, reply: RoomPublicReply) => {
            const code = readString(payload?.code, 8).toUpperCase();
            await context.withRoomMutation(code, async () => {
                const room = await context.getPersistedRoom(code);
                const nickname = sanitizeNickname(
                    readString(payload?.nickname, ROOM_GUARDRAILS.maxNicknameLength),
                );
                if (!room) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "방을 찾을 수 없습니다.",
                    });
                    return;
                }
                const joinValidation = validateRoomJoin(room);
                if (!joinValidation.ok) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error:
                            joinValidation.error === "contest-invite-only"
                                ? "콘테스트는 초대받은 계정만 등록할 수 있습니다."
                                : "이미 종료된 방입니다.",
                    });
                    return;
                }
                if (!nickname) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "닉네임을 입력하세요.",
                    });
                    return;
                }
                if (room.players.size >= room.maxPlayers) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: `입실 정원 ${room.maxPlayers}명을 초과했습니다.`,
                    });
                    return;
                }

                const playerId = context.makeId();
                const socketToken = context.makeSocketToken();
                const player = createPlayerState({
                    id: playerId,
                    socketId: socket.id,
                    socketToken,
                    nickname,
                    exam: room.exam,
                    ready: room.status === "playing",
                });
                room.players.set(playerId, player);
                context.serverMetrics.playersJoinedCounter.inc();
                socket.join(code);
                context.setSocketPlayer(socket, { roomCode: code, playerId, socketToken });
                socket.emit("player:you", playerId);
                context.touchRoom(room);
                context.addLog(
                    room,
                    "system",
                    room.status === "playing"
                        ? `${nickname} 지각 입실. 시험지와 답안지를 받았습니다.`
                        : `${nickname} 입실. 컴싸 확인 완료.`,
                );
                const snapshot = context.emitRoom(room);
                context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );
};

export const registerRoomEntryHandlers = (socket: Socket, context: SocketHandlerContext) => {
    registerRoomRejoinHandler(socket, context);
    registerRoomCreateHandler(socket, context);
    registerRoomJoinHandler(socket, context);
};
