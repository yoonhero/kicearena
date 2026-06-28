/* eslint-disable complexity */
import type { Socket } from "socket.io";
import {
    ITEM_DEFINITIONS,
    type ActiveEffect,
    type ItemId,
    type ServerResponse,
} from "../shared/game.js";
import { activeEffectForItem, findAdviceNoteProblem, validateItemTarget } from "./items.js";
import { readString } from "./requestUtils.js";
import type { SocketHandlerContext } from "./socketHandlerContext.js";

export const registerItemHandlers = (socket: Socket, context: SocketHandlerContext) => {
    socket.on(
        "item:use",
        async (
            payload: { itemId: ItemId; targetPlayerId: string; message?: string },
            reply: (response: ServerResponse) => void,
        ) => {
            if (context.shouldRateLimit(socket.id, "item:use", context.rateLimitMs.itemUse)) {
                context.replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "아이템 사용 간격이 너무 짧습니다.",
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
                const target = room?.players.get(readString(payload?.targetPlayerId, 32));
                const itemId = readString(payload?.itemId, 32) as ItemId;
                const item = ITEM_DEFINITIONS[itemId];
                if (
                    !room ||
                    !context.isCurrentPlayerSocket(player, ref) ||
                    !target ||
                    room.status !== "playing" ||
                    !item ||
                    !room.itemEnabled
                ) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "아이템을 사용할 수 없습니다.",
                    });
                    return;
                }
                const index = player.inventory.indexOf(itemId);
                if (index === -1) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "보유하지 않은 아이템입니다.",
                    });
                    return;
                }
                const readyAt = player.itemCooldowns?.[itemId] ?? 0;
                const now = Date.now();
                if (readyAt > now) {
                    context.replyAfterRoomCommit(reply, {
                        ok: false,
                        error: `아이템 재사용 대기 ${Math.ceil((readyAt - now) / 1000)}초 남았습니다.`,
                    });
                    return;
                }
                const targetCheck = validateItemTarget(room, itemId, player, target);
                if (!targetCheck.ok) {
                    context.replyAfterRoomCommit(reply, { ok: false, error: targetCheck.error });
                    return;
                }
                const existingEffect = activeEffectForItem(target, itemId);
                const effect: ActiveEffect = existingEffect ?? {
                    id: item.id,
                    label: item.name,
                    sourceName: player.nickname,
                    expiresAt: now + item.lifecycle.durationMs,
                };
                if (existingEffect) {
                    existingEffect.label = item.name;
                    existingEffect.sourceName = player.nickname;
                    existingEffect.expiresAt = now + item.lifecycle.durationMs;
                    delete existingEffect.message;
                    delete existingEffect.problemNumber;
                }
                if (item.effectKind === "adviceNote") {
                    const problem = findAdviceNoteProblem(room, player, target);
                    if (!problem) {
                        context.replyAfterRoomCommit(reply, {
                            ok: false,
                            error: "내가 맞혔고 대상이 아직 못 맞힌 문제가 필요합니다.",
                        });
                        return;
                    }
                    effect.problemNumber = problem.number;
                    const messageMeta = item.payload?.message;
                    effect.message =
                        readString(payload?.message, messageMeta?.maxLength ?? 72) ||
                        `${problem.number}번은 생각보다 쉽던데?`;
                }
                player.inventory.splice(index, 1);
                if (item.lifecycle.cooldownMs > 0) {
                    player.itemCooldowns = {
                        ...(player.itemCooldowns ?? {}),
                        [itemId]: now + item.lifecycle.cooldownMs,
                    };
                }
                target.expiredEffects = (target.expiredEffects ?? []).filter(
                    (expiredEffect) => expiredEffect.id !== itemId,
                );
                if (!existingEffect) target.effects.push(effect);
                context.addLog(
                    room,
                    "item",
                    `${player.nickname} -> ${target.nickname}: ${item.name}`,
                );
                context.replyAfterRoomCommit(reply, { ok: true });
                context.touchRoom(room);
                context.emitRoom(room);
            });
        },
    );
};
