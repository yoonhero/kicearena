import { describe, expect, it } from "vitest";
import { normalizeStudentStatus, schoolRepresentativeBadge } from "./campaign";

describe("campaign shared helpers", () => {
    it("normalizes student statuses to known registration values", () => {
        expect(normalizeStudentStatus("g3")).toBe("g3");
        expect(normalizeStudentStatus("repeat")).toBe("repeat");
        expect(normalizeStudentStatus("unknown")).toBe("other");
    });

    it("formats school representative badge labels consistently", () => {
        expect(schoolRepresentativeBadge("  경기고등학교  ")).toBe("경기고등학교 대표");
        expect(schoolRepresentativeBadge("서울  과학고등학교")).toBe("서울 과학고등학교 대표");
    });
});
