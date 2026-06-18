import { describe, expect, it } from "vitest";
import { makeForm, problemSourceMetaCheck } from "./adminFormUtils";

describe("admin form source metadata", () => {
    it("serializes existing source metadata into intuitive body commands", () => {
        expect(
            makeForm({
                id: "p1",
                number: 1,
                title: "문항",
                answerKind: "short",
                answer: "42",
                difficulty: 3,
                pointValue: 5,
                sourceNumber: 12,
                sourcePage: 4,
                bbox: [10, 20, 110, 180],
                section: "공통",
                body: [{ kind: "paragraph", text: "본문" }],
            }),
        ).toMatchObject({
            bodyMarkup: "::source 12 | 4 | 공통\n::bbox 10, 20, 110, 180\n\n본문",
        });
    });

    it("parses optional source metadata commands for save payloads", () => {
        expect(
            problemSourceMetaCheck({
                title: "문항",
                answerKind: "short",
                answer: "42",
                difficulty: 3,
                pointValue: "",
                bodyMarkup: "::source 12 | 4 | 공통\n::bbox [10, 20, 110, 180]",
            }),
        ).toMatchObject({
            ok: true,
            sourceNumber: 12,
            sourcePage: 4,
            bbox: [10, 20, 110, 180],
            section: "공통",
        });
    });

    it("rejects invalid bbox values before save", () => {
        expect(
            problemSourceMetaCheck({
                title: "문항",
                answerKind: "short",
                answer: "42",
                difficulty: 3,
                pointValue: "",
                bodyMarkup: "::bbox 10, 20, 5, 180",
            }),
        ).toMatchObject({
            ok: false,
            error: "bbox의 오른쪽/아래 좌표가 더 커야 합니다.",
        });
    });
});
