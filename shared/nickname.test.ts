import { describe, expect, it } from "vitest";
import {
    composeHangulSyllable,
    composeNickname,
    createRandomNickname,
    createRandomNicknameParts,
    sanitizeNickname,
} from "./nickname";

describe("nickname helpers", () => {
    it("composes a compact two-syllable nickname", () => {
        expect(composeNickname("민", "재")).toBe("민재");
    });

    it("composes a three-syllable referral nickname", () => {
        expect(composeNickname("김", "수", "학")).toBe("김수학");
    });

    it("composes nickname syllables from initial, medial, and final jamo", () => {
        expect(composeHangulSyllable({ initial: "ㅁ", vowel: "ㅣ", final: "ㄴ" })).toBe("민");
        expect(
            composeNickname(
                { initial: "ㅈ", vowel: "ㅐ", final: "" },
                { initial: "ㅎ", vowel: "ㅗ", final: "" },
            ),
        ).toBe("재호");
    });

    it("truncates manual nicknames by visible characters", () => {
        expect(sanitizeNickname(" 가나다라마바사 ")).toBe("가나다라마바");
    });

    it("keeps blank manual names blank so callers can reject them", () => {
        expect(sanitizeNickname("   ")).toBe("");
    });

    it("creates random nickname parts from the allowed OMR jamo sets", () => {
        const values = [0, 0.99, 0.5, 0.25, 0.75, 0.2];
        const random = () => values.shift() ?? 0;

        expect(createRandomNicknameParts(random)).toEqual([
            { initial: "ㄱ", vowel: "ㅔ", final: "ㄹ" },
            { initial: "ㄷ", vowel: "ㅐ", final: "ㄴ" },
        ]);
    });

    it("creates three random nickname parts for referral OMR names", () => {
        const values = [0, 0.99, 0.5, 0.25, 0.75, 0.2, 0.9, 0.1, 0.4];
        const random = () => values.shift() ?? 0;

        expect(createRandomNicknameParts(random, 3)).toEqual([
            { initial: "ㄱ", vowel: "ㅔ", final: "ㄹ" },
            { initial: "ㄷ", vowel: "ㅐ", final: "ㄴ" },
            { initial: "ㅎ", vowel: "ㅏ", final: "ㄹ" },
        ]);
    });

    it("creates a compact random nickname", () => {
        const values = [0, 0.99, 0.5, 0.25, 0.75, 0.2];
        const random = () => values.shift() ?? 0;

        expect(createRandomNickname(random)).toBe("겔댄");
    });
});
