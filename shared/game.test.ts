import { describe, expect, it } from "vitest";
import { isProblemBody, isProblemBodyBlock } from "./game";

describe("problem body validation", () => {
    it("accepts supported problem body block shapes", () => {
        expect(
            isProblemBody([
                { kind: "paragraph", text: "{}의 값은?", inlineMath: ["x^2"] },
                { kind: "displayMath", latex: "x=1" },
                { kind: "choices", choices: ["1", "2"] },
                { kind: "diagram", src: "diagrams/a.svg", alt: "도표", caption: "참고" },
                { kind: "note", text: "자연수로 입력" },
            ]),
        ).toBe(true);
    });

    it("rejects blocks that would break problem rendering", () => {
        expect(isProblemBodyBlock({ kind: "paragraph" })).toBe(false);
        expect(isProblemBodyBlock({ kind: "displayMath", latex: 1 })).toBe(false);
        expect(isProblemBodyBlock({ kind: "choices", choices: ["1", 2] })).toBe(false);
        expect(isProblemBodyBlock({ kind: "diagram", src: "diagrams/a.svg" })).toBe(false);
        expect(isProblemBodyBlock({ kind: "note", text: null })).toBe(false);
        expect(
            isProblemBody([
                { kind: "paragraph", text: "ok" },
                { kind: "unknown", text: "bad" },
            ]),
        ).toBe(false);
    });
});
