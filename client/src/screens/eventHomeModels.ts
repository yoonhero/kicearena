import type { GymEventSummary } from "../../../shared/game";

export type EventDisplay = GymEventSummary & {
    startLabel: string;
    statusLabel: string;
    durationLabel: string;
};

export type IndexDisplay = {
    title: string;
    detail: string;
};

export const makeEventDisplays = (events: GymEventSummary[]): EventDisplay[] =>
    events.map((event) => ({
        ...event,
        startLabel: formatEventStart(event.startsAt),
        statusLabel:
            event.status === "upcoming" ? "예정" : event.status === "ended" ? "종료" : "공개",
        durationLabel: `${Math.round(event.timeLimitSec / 60)}분`,
    }));

export const getEntrantStatus = (hasReferralVerification: boolean, hasOpenEvent: boolean) => {
    if (hasReferralVerification) return "수험표 저장 완료";
    return hasOpenEvent ? "공개 관전 가능" : "인증 전";
};

export const makeIndexEvents = (
    displayEvents: EventDisplay[],
    eventsUnavailable: boolean,
): IndexDisplay[] => {
    if (displayEvents.length > 0) {
        return displayEvents.slice(0, 3).map((event) => ({
            title: event.title,
            detail: `${event.statusLabel} · ${event.startLabel}`,
        }));
    }

    return [
        {
            title: eventsUnavailable ? "공개 예정 시험 확인 중" : "공개 예정 시험 없음",
            detail: eventsUnavailable ? "연결 대기" : "운영자 공개 대기",
        },
    ];
};

export const getAdmissionSkeletonNote = (displayEvents: EventDisplay[]) =>
    displayEvents.some(
        (event) =>
            (event.status === "open" || event.status === "ended") && event.registration === "open",
    )
        ? "수험표 없이 바로 풀 수 있습니다."
        : undefined;

const formatEventStart = (startsAt: string | null) => {
    if (!startsAt) return "상시 공개";
    return new Date(startsAt).toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
};
