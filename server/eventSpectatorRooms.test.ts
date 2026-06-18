import { describe, expect, it } from "vitest";
import type { ExamManifest } from "../shared/game.js";
import { eventEndAt, isEventExamWindowClosed, latestEventRoom } from "./eventSpectatorRooms.js";

const exam: Pick<ExamManifest, "releaseAt" | "timeLimitSec"> = {
    releaseAt: "2026-06-18T10:00:00.000Z",
    timeLimitSec: 60 * 90,
};

describe("event spectator room policy", () => {
    it("treats the event as closed after release time plus exam duration", () => {
        expect(eventEndAt(exam)).toBe(Date.parse("2026-06-18T11:30:00.000Z"));
        expect(isEventExamWindowClosed(exam, Date.parse("2026-06-18T11:29:59.000Z"))).toBe(false);
        expect(isEventExamWindowClosed(exam, Date.parse("2026-06-18T11:30:00.000Z"))).toBe(true);
    });

    it("does not close always-open exams without a release time", () => {
        expect(
            isEventExamWindowClosed({ releaseAt: undefined, timeLimitSec: 60 }, Date.now()),
        ).toBe(false);
    });

    it("selects the latest finished event room for post-exam spectators", () => {
        expect(
            latestEventRoom(
                [
                    {
                        code: "OLD",
                        eventId: "contest",
                        status: "finished",
                        createdAt: 1,
                        lastActivityAt: 10,
                    },
                    {
                        code: "LIVE",
                        eventId: "contest",
                        status: "playing",
                        createdAt: 3,
                        lastActivityAt: 30,
                    },
                    {
                        code: "NEW",
                        eventId: "contest",
                        status: "finished",
                        createdAt: 2,
                        lastActivityAt: 20,
                    },
                ],
                "contest",
                ["finished"],
            )?.code,
        ).toBe("NEW");
    });
});
