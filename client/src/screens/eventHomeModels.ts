import type { GymEventSummary } from "../../../shared/game";

export type EventDisplay = GymEventSummary & {
    displaySubtitle: string;
    displayTitle: string;
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
        displaySubtitle: displayEventSubtitle(event),
        displayTitle: displayEventTitle(event),
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
            title: event.displayTitle,
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

const weakSubtitlePatterns = [/^안녕/i, /^반갑/i, /^hello/i, /^test$/i, /^테스트$/i];

const displayEventTitle = (event: GymEventSummary) => {
    const title = event.title.trim();
    if (title.length >= 2) return title;
    return event.status === "ended" ? "종료된 모의고사" : "공개 모의고사";
};

const displayEventSubtitle = (event: GymEventSummary) => {
    const subtitle = event.subtitle.trim();
    if (subtitle.length >= 6 && !weakSubtitlePatterns.some((pattern) => pattern.test(subtitle))) {
        return subtitle;
    }
    return event.status === "ended"
        ? "최종 순위와 개인 풀이를 확인합니다."
        : "정해진 시간 안에 응시하고 기록을 확인합니다.";
};
