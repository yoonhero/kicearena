import { describe, expect, it } from "vitest";
import type { GymEventSummary } from "../../../shared/game";
import { getAdmissionSkeletonNote, makeEventDisplays, makeIndexEvents } from "./eventHomeModels";

const event = (status: GymEventSummary["status"]): GymEventSummary => ({
    id: `event-${status}`,
    title: "하프모의고사",
    subtitle: "종료 상태 확인",
    timeLimitSec: 2400,
    freezeBeforeSec: 600,
    problemCount: 2,
    startsAt: "2026-06-18T01:00:00.000Z",
    status,
    registration: "open",
    spectatorAllowed: true,
});

describe("event home models", () => {
    it("labels ended events as finished while keeping practice copy available", () => {
        const displays = makeEventDisplays([event("ended")]);

        expect(displays[0]).toMatchObject({ status: "ended", statusLabel: "종료" });
        expect(makeIndexEvents(displays, false)[0]?.detail).toContain("종료");
        expect(getAdmissionSkeletonNote(displays)).toBe("수험표 없이 바로 풀 수 있습니다.");
    });

    it("uses quiet public labels when admin event copy is too weak for the competition list", () => {
        const weakEvent = {
            ...event("ended"),
            title: "아",
            subtitle: "안녕하세요! 반갑습니다.",
        };
        const displays = makeEventDisplays([weakEvent]);

        expect(displays[0]).toMatchObject({
            displayTitle: "종료된 모의고사",
            displaySubtitle: "최종 순위와 개인 풀이를 확인합니다.",
        });
        expect(makeIndexEvents(displays, false)[0]?.title).toBe("종료된 모의고사");
    });
});
