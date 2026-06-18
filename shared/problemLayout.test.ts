import { describe, expect, it } from "vitest";
import { isTallProblemImage } from "./problemLayout";

describe("problem image layout", () => {
    it("uses a scroll viewport for very tall problem images", () => {
        expect(isTallProblemImage(600, 1000)).toBe(true);
    });

    it("keeps normal problem images in fit-to-view mode", () => {
        expect(isTallProblemImage(1000, 900)).toBe(false);
    });
});
