import type { Socket } from "socket.io";
import { ROOM_GUARDRAILS, examFreezeBeforeSec } from "../shared/game.js";
import { sanitizeNickname } from "../shared/nickname.js";
import { maxPlayersForRoomMode } from "../shared/roomConfig.js";
import { verifyCampaignAuthToken } from "./campaignAuth.js";
import { readCampaignUserByUsername } from "./campaignDatabase.js";
import { isOpenRegistrationExam } from "./exams.js";
import { isEventExamWindowClosed } from "./eventSpectatorRooms.js";
import { createPlayerState } from "./playerFactory.js";
import { readCookie, readString } from "./requestUtils.js";
import type { RoomPublicReply, SocketHandlerContext } from "./socketHandlerContext.js";
import type { RoomState } from "./types.js";

const registerClosedEventAttempt = async (
    socket: Socket,
    context: SocketHandlerContext,
    examId: string,
    nickname: string,
    reply: RoomPublicReply,
) => {
    if ((await context.activeRoomCount()) >= ROOM_GUARDRAILS.maxActiveRooms) {
        context.replyAfterRoomCommit(reply, {
            ok: false,
            error: "현재 풀이 가능한 방 수를 초과했습니다. 잠시 후 다시 시도하세요.",
        });
        return;
    }

    const exam = context.getExamById().get(examId);
    if (!exam) return;
    const code = await context.makeAvailableCode();
    const playerId = context.makeId();
    const socketToken = context.makeSocketToken();
    const startedAt = Date.now();
    const player = createPlayerState({
        id: playerId,
        socketId: socket.id,
        socketToken,
        nickname,
        exam,
        ready: true,
    });
    const room: RoomState = {
        code,
        hostId: playerId,
        exam,
        mode: "casual",
        maxPlayers: 1,
        version: 0,
        status: "playing",
        timeLimitSec: exam.timeLimitSec,
        freezeBeforeSec: examFreezeBeforeSec(exam),
        itemEnabled: false,
        startedAt,
        endsAt: startedAt + exam.timeLimitSec * 1000,
        scoreboardFrozenAt: null,
        frozenStandings: [],
        scoreboardRevealCount: 0,
        players: new Map([[playerId, player]]),
        logs: [],
        createdAt: startedAt,
        lastActivityAt: startedAt,
    };

    context.rooms.set(code, room);
    context.serverMetrics.roomsCreatedCounter.inc();
    socket.join(code);
    context.setSocketPlayer(socket, { roomCode: code, playerId, socketToken });
    socket.emit("player:you", playerId);
    context.addLog(room, "system", `${nickname} 종료된 시험을 개인 풀이로 시작했습니다.`);
    const snapshot = context.emitRoom(room);
    context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
};

const verifyEventAccount = async (socket: Socket, context: SocketHandlerContext) => {
    const authToken = readCookie(socket.handshake.headers.cookie, context.campaignAuthCookieName);
    const claims = verifyCampaignAuthToken(authToken, context.campaignAuthSecret);
    const db = context.getExamCatalogPool();
    const record = claims && db ? await readCampaignUserByUsername(db, claims.username) : null;
    return Boolean(record && record.user.id === claims?.sub && record.user.emailVerified);
};

const joinExistingEventRoom = (
    socket: Socket,
    context: SocketHandlerContext,
    room: RoomState,
    nickname: string,
    reply: RoomPublicReply,
) => {
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
    socket.join(room.code);
    context.setSocketPlayer(socket, { roomCode: room.code, playerId, socketToken });
    socket.emit("player:you", playerId);
    context.touchRoom(room);
    context.addLog(room, "system", `${nickname} 등록 완료. 대기실에 합류했습니다.`);
    const snapshot = context.emitRoom(room);
    context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
};

const createEventRoom = async ({
    socket,
    context,
    examId,
    nickname,
    openRegistration,
    reply,
}: {
    socket: Socket;
    context: SocketHandlerContext;
    examId: string;
    nickname: string;
    openRegistration: boolean;
    reply: RoomPublicReply;
}) => {
    const exam = context.getExamById().get(examId);
    if (!exam) return;
    const playerId = context.makeId();
    const socketToken = context.makeSocketToken();
    const player = createPlayerState({
        id: playerId,
        socketId: socket.id,
        socketToken,
        nickname,
        exam,
        ready: false,
    });
    const room: RoomState = {
        code: await context.makeAvailableCode(),
        hostId: playerId,
        exam,
        eventId: exam.id,
        mode: openRegistration ? "casual" : "contest",
        maxPlayers: openRegistration ? 1 : maxPlayersForRoomMode("contest"),
        version: 0,
        status: "lobby",
        timeLimitSec: exam.timeLimitSec,
        freezeBeforeSec: examFreezeBeforeSec(exam),
        itemEnabled: false,
        startedAt: null,
        endsAt: null,
        scoreboardFrozenAt: null,
        frozenStandings: [],
        scoreboardRevealCount: 0,
        players: new Map([[playerId, player]]),
        logs: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
    };

    context.rooms.set(room.code, room);
    context.serverMetrics.roomsCreatedCounter.inc();
    socket.join(room.code);
    context.setSocketPlayer(socket, { roomCode: room.code, playerId, socketToken });
    socket.emit("player:you", playerId);
    context.addLog(
        room,
        "system",
        openRegistration
            ? `${nickname} 예비소집일 대기실을 열었습니다.`
            : `${nickname} 등록 완료. virtual gym 대기실을 열었습니다.`,
    );
    const snapshot = context.emitRoom(room);
    context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
};

const registerEventRegisterHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "event:register",
        async (payload: { eventId: string; nickname: string }, reply: RoomPublicReply) => {
            await context.withRoomMutation("__event_register__", async () => {
                const eventId = readString(payload?.eventId, 80);
                const exam = context.getExamById().get(eventId);
                if (!exam) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "이벤트를 찾을 수 없습니다.",
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
                if (isEventExamWindowClosed(exam)) {
                    await registerClosedEventAttempt(socket, context, eventId, nickname, reply);
                    return;
                }

                const openRegistration = isOpenRegistrationExam(exam);
                if (!openRegistration && !(await verifyEventAccount(socket, context))) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "이메일 인증을 완료한 계정만 응시할 수 있습니다.",
                    });
                    return;
                }

                const existingRoom = openRegistration
                    ? null
                    : await context.findReusableEventRoom(exam.id);
                if (existingRoom) {
                    joinExistingEventRoom(socket, context, existingRoom, nickname, reply);
                    return;
                }
                if ((await context.activeRoomCount()) >= ROOM_GUARDRAILS.maxActiveRooms) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "현재 등록 가능한 이벤트 방 수를 초과했습니다. 잠시 후 다시 시도하세요.",
                    });
                    return;
                }
                await createEventRoom({
                    socket,
                    context,
                    examId: eventId,
                    nickname,
                    openRegistration,
                    reply,
                });
            });
        },
    );
};

const registerEventSpectateHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on("event:spectate", async (payload: { eventId: string }, reply: RoomPublicReply) => {
        await context.withRoomMutation("__event_register__", async () => {
            const eventId = readString(payload?.eventId, 80);
            const exam = context.getExamById().get(eventId);
            if (!exam) {
                context.replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "이벤트를 찾을 수 없습니다.",
                });
                return;
            }

            const eventWindowClosed = isEventExamWindowClosed(exam);
            const room = eventWindowClosed
                ? ((await context.findLatestEventRoom(exam.id, ["finished"])) ??
                  (await context.findLatestEventRoom(exam.id, ["playing"])))
                : await context.findLatestEventRoom(exam.id, ["lobby", "playing"]);
            if (!room) {
                context.replyAfterRoomCommit(reply, {
                    ok: false,
                    error: eventWindowClosed
                        ? "종료된 대회 결과 방을 찾을 수 없습니다."
                        : "아직 관전 가능한 대회방이 없습니다.",
                });
                return;
            }

            socket.join(room.code);
            context.setSocketSpectator(socket, { roomCode: room.code });
            const snapshot = context.publicRoom(room);
            context.replyAfterRoomCommit(reply, { ok: true, data: snapshot });
        });
    });
};

export const registerEventEntryHandlers = (socket: Socket, context: SocketHandlerContext) => {
    registerEventRegisterHandler(socket, context);
    registerEventSpectateHandler(socket, context);
};
