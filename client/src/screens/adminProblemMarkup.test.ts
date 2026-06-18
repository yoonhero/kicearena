import { describe, expect, it } from "vitest";
import {
    adminAssetSrc,
    appendDefaultChoiceMarkup,
    bodyForAdminPreview,
    bodyToMarkup,
    insertMarkupAtRange,
    normalizedBodyForSave,
    parseProblemMarkup,
    removeChoiceMarkup,
} from "./adminProblemMarkup";

describe("admin problem body markup", () => {
    it("parses markdown-like body lines into supported problem blocks", () => {
        expect(
            parseProblemMarkup(
                [
                    "두 실수 $x$와 $y$에 대하여",
                    "다음 조건을 만족한다.",
                    "",
                    "::math x^2 + y^2 = 1",
                    "",
                    "::svg diagrams/unit-circle.svg | 단위원 | 참고",
                    "::note 자연수로 입력",
                    "::choice 1",
                    "::choice 2",
                ].join("\n"),
            ),
        ).toEqual([
            {
                kind: "paragraph",
                text: "두 실수 {}와 {}에 대하여\n다음 조건을 만족한다.",
                inlineMath: ["x", "y"],
            },
            { kind: "displayMath", latex: "x^2 + y^2 = 1" },
            { kind: "diagram", src: "diagrams/unit-circle.svg", alt: "단위원", caption: "참고" },
            { kind: "note", text: "자연수로 입력" },
            { kind: "choices", choices: ["1", "2"] },
        ]);
    });

    it("serializes supported blocks back to compact body markup", () => {
        expect(
            bodyToMarkup([
                { kind: "paragraph", text: "{}의 값", inlineMath: ["x"] },
                { kind: "diagram", src: "diagrams/a.svg", alt: "그래프" },
                { kind: "choices", choices: ["1", "2"] },
            ]),
        ).toBe("$x$의 값\n\n::svg diagrams/a.svg | 그래프\n\n::choice 1\n::choice 2");
    });

    it("removes choices from short-answer saves and creates default choices for choice saves", () => {
        expect(
            normalizedBodyForSave({
                answerKind: "short",
                bodyMarkup: "값을 구하시오.\n\n::choice 1\n::choice 2",
            }),
        ).toEqual([{ kind: "paragraph", text: "값을 구하시오." }]);

        expect(
            normalizedBodyForSave({
                answerKind: "choice",
                bodyMarkup: "값을 고르시오.",
            }),
        ).toEqual([
            { kind: "paragraph", text: "값을 고르시오." },
            { kind: "choices", choices: ["1", "2", "3", "4", "5"] },
        ]);
    });

    it("updates choice markup only when the answer type actually needs it", () => {
        expect(removeChoiceMarkup("본문\n\n::choice 1\n::choice 2\n\n::note 끝")).toBe(
            "본문\n\n::note 끝",
        );
        expect(appendDefaultChoiceMarkup("본문")).toBe(
            "본문\n\n::choice 1\n::choice 2\n::choice 3\n::choice 4\n::choice 5",
        );
    });

    it("replaces the selected body range with uploaded asset markup", () => {
        const source = "첫 문단\n\n교체 대상\n\n마지막 문단";
        const start = source.indexOf("교체 대상");
        const result = insertMarkupAtRange(
            source,
            "::svg diagrams/uploaded.svg | 그래프",
            start,
            start + "교체 대상".length,
        );

        expect(result.value).toBe("첫 문단\n\n::svg diagrams/uploaded.svg | 그래프\n\n마지막 문단");
        expect(result.caret).toBe("첫 문단\n\n::svg diagrams/uploaded.svg | 그래프".length);
    });

    it("maps relative diagram assets to admin URLs for preview without rewriting absolute sources", () => {
        expect(adminAssetSrc("mock exam", "diagrams/a b.svg")).toBe(
            "/api/admin/exams/mock%20exam/assets/diagrams/a%20b.svg",
        );
        expect(adminAssetSrc("mock-exam", "/api/exams/mock-exam/assets/diagrams/a.svg")).toBe(
            "/api/exams/mock-exam/assets/diagrams/a.svg",
        );
        expect(
            bodyForAdminPreview("mock-exam", [
                { kind: "diagram", src: "diagrams/a.svg", alt: "도표" },
            ]),
        ).toEqual([
            {
                kind: "diagram",
                src: "/api/admin/exams/mock-exam/assets/diagrams/a.svg",
                alt: "도표",
            },
        ]);
    });
});
