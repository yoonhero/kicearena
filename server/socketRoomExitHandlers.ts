/* eslint-disable complexity */
import type { Socket } from "socket.io";
import type { RoomPublic, ServerResponse } from "../shared/game.js";
import { getRoomLeaveAction, validateLobbyKick } from "../shared/roomLifecycle.js";
import { readString } from "./requestUtils.js";
import type { SocketHandlerContext } from "./socketHandlerContext.js";

const registerLeaveHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:leave",
        async (_payload: unknown, reply?: (response: ServerResponse) => void) => {
            const ref = context.socketToPlayer.get(socket.id);
            const spectatorRef = context.socketToSpectator.get(socket.id);
            if (!ref) {
                if (spectatorRef) {
                    socket.leave(spectatorRef.roomCode);
                    context.clearLocalSocketSpectator(socket.id);
                }
                context.replyAfterRoomCommit(reply, { ok: true });
                return;
            }
            await context.withRoomMutation(ref.roomCode, async () => {
                const room = await context.getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (room && player && !context.isCurrentPlayerSocket(player, ref)) {
                    context.clearLocalSocketPlayer(socket.id);
                    context.replyAfterRoomCommit(reply, { ok: true });
                    return;
                }
                const action =
                    room?.eventId && room.status === "lobby"
                        ? "remove-player"
                        : getRoomLeaveAction(room ?? undefined, player?.id);

                if (room && player && action === "close-room") {
                    context.addLog(
                        room,
                        "system",
                        `${player.nickname} 방장이 퇴실하여 방이 닫혔습니다.`,
                    );
                    context.closeLobbyRoom(room);
                } else if (room && player && action === "remove-player") {
                    context.removePlayerFromRoom(room, player);
                    if (room.hostId === player.id) {
                        room.hostId = room.players.values().next().value?.id ?? "";
                    }
                    context.addLog(room, "system", `${player.nickname} 퇴실.`);
                    context.touchRoom(room);
                    context.emitRoom(room);
                } else if (room && player && action === "detach-player") {
                    player.connected = false;
                    context.addLog(room, "system", `${player.nickname} 퇴실.`);
                    socket.leave(room.code);
                    context.touchRoom(room);
                    if (context.closeRoomIfNoConnectedPlayers(room)) {
                        context.clearLocalSocketPlayer(socket.id);
                        context.replyAfterRoomCommit(reply, { ok: true });
                        return;
                    }
                    context.emitRoom(room);
                }
                context.clearLocalSocketPlayer(socket.id);
                context.replyAfterRoomCommit(reply, { ok: true });
            });
        },
    );
};

const registerKickHandler = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "room:kick",
        async (
            payload: { targetPlayerId: string },
            reply?: (response: ServerResponse<RoomPublic>) => void,
        ) => {
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
                if (room && !context.isCurrentPlayerSocket(player, ref)) {
                    context.clearLocalSocketPlayer(socket.id);
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "참가자 정보를 찾을 수 없습니다.",
                    });
                    return;
                }
                const validation = validateLobbyKick(
                    room ?? undefined,
                    ref.playerId,
                    readString(payload?.targetPlayerId, 32),
                );

                if (!validation.ok) {
                    const error =
                        validation.error === "not-host"
                            ? "방장만 추방할 수 있습니다."
                            : validation.error === "not-lobby"
                              ? "로비에서만 추방할 수 있습니다."
                              : validation.error === "self-target"
                                ? "방장은 자기 자신을 추방할 수 없습니다."
                                : "추방할 참가자를 찾을 수 없습니다.";
                    context.replyAfterRoomCommit(reply, { ok: false, error });
                    return;
                }

                const target = room?.players.get(validation.targetPlayerId);
                if (!room || !target) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "추방할 참가자를 찾을 수 없습니다.",
                    });
                    return;
                }

                context.removePlayerFromRoom(room, target);
                context.io.to(target.socketId).emit("room:kicked", { code: room.code });
                context.cleanupRoomSocketsAcrossCluster({
                    roomCode: room.code,
                    playerIds: [target.id],
                    socketIds: [target.socketId],
                });
                context.addLog(room, "system", `${target.nickname} 추방.`);
                context.touchRoom(room);
                context.emitRoom(room);
                context.replyAfterRoomCommit(reply, { ok: true, data: context.publicRoom(room) });
            });
        },
    );
};

const registerDisconnectHandler = (
    socket: Socket,
    context: SocketHandlerContext,
    socketEventTimestamps: Map<string, Map<string, number>>,
) => {
    socket.on("disconnect", async () => {
        socketEventTimestamps.delete(socket.id);
        const ref = context.socketToPlayer.get(socket.id);
        if (!ref) {
            const spectatorRef = context.socketToSpectator.get(socket.id);
            if (!spectatorRef) return;
            context.clearLocalSocketSpectator(socket.id);
            return;
        }
        await context.withRoomMutation(ref.roomCode, async () => {
            const room = await context.getPersistedRoom(ref.roomCode);
            const player = room?.players.get(ref.playerId);
            if (!room || !player) {
                context.clearLocalSocketPlayer(socket.id);
                return;
            }
            if (!context.isCurrentPlayerSocket(player, ref)) {
                context.clearLocalSocketPlayer(socket.id);
                return;
            }
            player.connected = false;
            context.clearLocalSocketPlayer(socket.id);
            context.addLog(room, "system", `${player.nickname} 연결 끊김.`);
            context.touchRoom(room);
            if (context.closeRoomIfNoConnectedPlayers(room)) return;
            context.emitRoom(room);
        });
    });
};

export const registerRoomExitHandlers = (
    socket: Socket,
    context: SocketHandlerContext,
    socketEventTimestamps: Map<string, Map<string, number>>,
) => {
    registerLeaveHandler(socket, context);
    registerKickHandler(socket, context);
    registerDisconnectHandler(socket, context, socketEventTimestamps);
};
