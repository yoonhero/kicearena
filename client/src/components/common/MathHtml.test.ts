import { describe, expect, it } from "vitest";
import { renderMathHtml } from "./MathHtml";

describe("renderMathHtml", () => {
    it("renders inline and display math through KaTeX", () => {
        expect(renderMathHtml("x^2+1")).toContain("katex");
        expect(renderMathHtml("\\sum_{k=1}^{n} k", true)).toContain("katex-display");
    });

    it("keeps malformed latex renderable", () => {
        expect(() => renderMathHtml("\\not-a-command{")).not.toThrow();
        expect(renderMathHtml("\\not-a-command{")).toContain("katex-error");
    });
});
