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
});
