import type { ExamManifest, RoomStatus } from "../shared/game.js";

export type EventSpectatorRoomCandidate = {
    code: string;
    eventId?: string;
    status: RoomStatus;
    createdAt: number;
    lastActivityAt: number;
};

export const eventEndAt = (exam: Pick<ExamManifest, "releaseAt" | "timeLimitSec">) => {
    if (!exam.releaseAt) return null;
    const releaseAt = Date.parse(exam.releaseAt);
    if (!Number.isFinite(releaseAt)) return null;
    return releaseAt + exam.timeLimitSec * 1000;
};

export const isEventExamWindowClosed = (
    exam: Pick<ExamManifest, "releaseAt" | "timeLimitSec">,
    now = Date.now(),
) => {
    const endAt = eventEndAt(exam);
    return endAt !== null && now >= endAt;
};

export const latestEventRoom = (
    candidates: EventSpectatorRoomCandidate[],
    eventId: string,
    statuses: RoomStatus[],
) => {
    const allowedStatuses = new Set(statuses);
    return (
        candidates
            .filter((room) => room.eventId === eventId && allowedStatuses.has(room.status))
            .sort(
                (left, right) =>
                    right.lastActivityAt - left.lastActivityAt || right.createdAt - left.createdAt,
            )[0] ?? null
    );
};
