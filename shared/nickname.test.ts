import { describe, expect, it } from "vitest";
import { composeHangulSyllable, composeNickname, sanitizeNickname } from "./nickname";

describe("nickname helpers", () => {
  it("composes a compact two-syllable nickname", () => {
    expect(composeNickname("민", "재")).toBe("민재");
  });

  it("composes nickname syllables from initial, medial, and final jamo", () => {
    expect(composeHangulSyllable({ initial: "ㅁ", vowel: "ㅣ", final: "ㄴ" })).toBe("민");
    expect(composeNickname({ initial: "ㅈ", vowel: "ㅐ", final: "" }, { initial: "ㅎ", vowel: "ㅗ", final: "" })).toBe("재호");
  });

  it("truncates manual nicknames by visible characters", () => {
    expect(sanitizeNickname(" 가나다라마바사 ")).toBe("가나다라마바");
  });

  it("keeps blank manual names blank so callers can reject them", () => {
    expect(sanitizeNickname("   ")).toBe("");
  });
});
