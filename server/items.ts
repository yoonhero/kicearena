import type { ActiveEffect, ItemAward, ItemId, ProblemManifest } from "../shared/game.js";
import { ITEM_DEFINITIONS, ITEM_IDS } from "../shared/game.js";
import type { PlayerState, RoomState } from "./types.js";

export const isItemId = (id: ActiveEffect["id"]): id is ItemId => id in ITEM_DEFINITIONS;

export const cleanupEffects = (
    room: Pick<RoomState, "players">,
    now = Date.now(),
    expiredEffectNoticeMs = 3000,
) => {
    let changed = false;
    for (const player of room.players.values()) {
        const activeEffects: ActiveEffect[] = [];
        const expiredEffects = player.expiredEffects ?? [];
        for (const effect of player.effects) {
            if (effect.expiresAt > now) {
                activeEffects.push(effect);
            } else if (isItemId(effect.id)) {
                expiredEffects.push({ ...effect, clearedAt: now });
                changed = true;
            } else {
                changed = true;
            }
        }
        const visibleExpiredEffects = expiredEffects.filter(
            (effect) => now - effect.clearedAt <= expiredEffectNoticeMs,
        );
        if (visibleExpiredEffects.length !== expiredEffects.length) changed = true;
        player.effects = activeEffects;
        player.expiredEffects = visibleExpiredEffects;
        const cooldowns = player.itemCooldowns ?? {};
        for (const [itemId, readyAt] of Object.entries(cooldowns) as Array<[ItemId, number]>) {
            if (readyAt <= now) {
                delete cooldowns[itemId];
                changed = true;
            }
        }
        player.itemCooldowns = cooldowns;
    }
    return changed;
};

export const findAdviceNoteProblem = (
    room: Pick<RoomState, "exam">,
    sender: Pick<PlayerState, "submissionHistory">,
    target: Pick<PlayerState, "submissionHistory">,
) => {
    const targetSolved = new Set(
        target.submissionHistory
            .filter((submission) => submission.correct)
            .map((submission) => submission.problemId),
    );
    const senderSolved = sender.submissionHistory.filter(
        (submission) => submission.correct && !targetSolved.has(submission.problemId),
    );
    const newest = senderSolved.sort((a, b) => b.submittedAt - a.submittedAt)[0];
    return newest
        ? (room.exam.problems.find((problem) => problem.id === newest.problemId) ?? null)
        : null;
};

export const activeEffectForItem = (
    target: Pick<PlayerState, "effects">,
    itemId: ItemId,
    now = Date.now(),
) => target.effects.find((effect) => effect.id === itemId && effect.expiresAt > now);

export const validateItemTarget = (
    room: Pick<RoomState, "exam">,
    itemId: ItemId,
    sender: PlayerState,
    target: PlayerState,
    now = Date.now(),
) => {
    const item = ITEM_DEFINITIONS[itemId];
    if (item.lifecycle.target === "opponent" && sender.id === target.id) {
        return { ok: false, error: "상대에게만 사용할 수 있는 아이템입니다." } as const;
    }
    if (item.lifecycle.target === "eligibleUnsolved") {
        if (sender.id === target.id) {
            return { ok: false, error: "다른 참가자에게만 사용할 수 있는 아이템입니다." } as const;
        }
        if (!findAdviceNoteProblem(room, sender, target)) {
            return {
                ok: false,
                error: "내가 맞혔고 대상이 아직 못 맞힌 문제가 필요합니다.",
            } as const;
        }
    }
    if (
        item.lifecycle.duplicate === "blockWhileActive" &&
        activeEffectForItem(target, itemId, now)
    ) {
        return { ok: false, error: "대상에게 같은 아이템 효과가 이미 적용 중입니다." } as const;
    }
    return { ok: true } as const;
};

export const leadingScore = (room: Pick<RoomState, "players">) =>
    Math.max(0, ...[...room.players.values()].map((player) => player.score));

export const randomItem = (random = Math.random): ItemId =>
    ITEM_IDS[Math.floor(random() * ITEM_IDS.length)];

export const maybeAwardItems = (
    room: Pick<RoomState, "itemEnabled" | "players">,
    player: PlayerState,
    problem: ProblemManifest,
    attempts: number,
    random = Math.random,
): ItemAward[] => {
    if (!room.itemEnabled) return [];

    const firstTry = attempts === 1;
    const scoreGap = Math.max(0, leadingScore(room) - player.score);
    const comebackBoost = scoreGap >= 240 ? 0.14 : scoreGap >= 120 ? 0.08 : 0;
    const difficultyBoost = problem.difficulty * 0.055;
    const firstTryBoost = firstTry ? 0.1 : 0;
    const chance = Math.min(0.82, 0.2 + difficultyBoost + firstTryBoost + comebackBoost);
    const awards: ItemAward[] = [];

    if (random() < chance) {
        awards.push({
            itemId: randomItem(random),
            reason:
                comebackBoost > 0.1 ? "comeback" : problem.difficulty >= 4 ? "difficulty" : "lucky",
        });
    }
    if (firstTry && problem.difficulty >= 5 && random() < 0.35) {
        awards.push({ itemId: randomItem(random), reason: "firstTry" });
    }

    return awards;
};

export const randomWeakDebuff = (now = Date.now(), random = Math.random): ActiveEffect => {
    const pool: ActiveEffect[] = [
        { id: "hideAssist", label: "멘탈 흔들림", sourceName: "연속 오답", expiresAt: now + 8000 },
        { id: "blur", label: "시야 흐림", sourceName: "연속 오답", expiresAt: now + 6000 },
        { id: "slowInput", label: "손 굳음", sourceName: "연속 오답", expiresAt: now + 5000 },
    ];
    return pool[Math.floor(random() * pool.length)];
};
