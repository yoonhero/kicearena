export type ProblemBodyBlock =
    | { kind: "paragraph"; text: string; inlineMath?: string[] }
    | { kind: "displayMath"; latex: string }
    | { kind: "choices"; choices: string[] }
    | { kind: "diagram"; src: string; alt: string; caption?: string }
    | { kind: "note"; text: string };

const isStringArray = (value: unknown) =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

export const isProblemBodyBlock = (value: unknown): value is ProblemBodyBlock => {
    if (!value || typeof value !== "object") return false;
    const block = value as Record<string, unknown>;

    if (block.kind === "paragraph") {
        return (
            typeof block.text === "string" &&
            (block.inlineMath === undefined || isStringArray(block.inlineMath))
        );
    }
    if (block.kind === "displayMath") {
        return typeof block.latex === "string";
    }
    if (block.kind === "choices") {
        return isStringArray(block.choices);
    }
    if (block.kind === "diagram") {
        return (
            typeof block.src === "string" &&
            typeof block.alt === "string" &&
            (block.caption === undefined || typeof block.caption === "string")
        );
    }
    if (block.kind === "note") {
        return typeof block.text === "string";
    }
    return false;
};

export const isProblemBody = (value: unknown): value is ProblemBodyBlock[] =>
    Array.isArray(value) && value.every(isProblemBodyBlock);
