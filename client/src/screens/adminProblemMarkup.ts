import type { ProblemBodyBlock, ProblemManifest } from "../../../shared/game";

export type ProblemFormDraft = {
    answerKind: ProblemManifest["answerKind"];
    bodyMarkup: string;
};

const DEFAULT_CHOICE_COUNT = 5;
const isMetaCommand = (command: string) =>
    command.startsWith("::source ") ||
    command.startsWith("::source-number ") ||
    command.startsWith("::source-page ") ||
    command.startsWith("::bbox ") ||
    command.startsWith("::section ");

const cloneBody = (body: ProblemBodyBlock[] | undefined): ProblemBodyBlock[] =>
    JSON.parse(JSON.stringify(body ?? [])) as ProblemBodyBlock[];

export const makeDefaultChoices = () =>
    Array.from({ length: DEFAULT_CHOICE_COUNT }, (_, index) => String(index + 1));

const paragraphToMarkup = (block: Extract<ProblemBodyBlock, { kind: "paragraph" }>) => {
    if (!block.inlineMath?.length) return block.text;
    const parts = block.text.split("{}");
    return parts
        .map(
            (part, index) =>
                `${part}${block.inlineMath?.[index] ? `$${block.inlineMath[index]}$` : ""}`,
        )
        .join("");
};

const parseParagraphMarkup = (text: string): Extract<ProblemBodyBlock, { kind: "paragraph" }> => {
    const inlineMath: string[] = [];
    const normalizedText = text.replace(/\$([^$]+)\$/g, (_match, latex: string) => {
        inlineMath.push(latex.trim());
        return "{}";
    });
    return inlineMath.length
        ? { kind: "paragraph", text: normalizedText, inlineMath }
        : { kind: "paragraph", text };
};

export const bodyToMarkup = (body: ProblemBodyBlock[] | undefined) =>
    cloneBody(body)
        .map((block) => {
            if (block.kind === "paragraph") return paragraphToMarkup(block);
            if (block.kind === "displayMath") return `::math ${block.latex}`;
            if (block.kind === "diagram")
                return `::svg ${[block.src, block.alt, block.caption].filter((part) => part !== undefined && part !== "").join(" | ")}`;
            if (block.kind === "note") return `::note ${block.text}`;
            return block.choices.map((choice) => `::choice ${choice}`).join("\n");
        })
        .join("\n\n");

export const parseProblemMarkup = (markup: string): ProblemBodyBlock[] => {
    const blocks: ProblemBodyBlock[] = [];
    let paragraphLines: string[] = [];

    const flushParagraph = () => {
        const text = paragraphLines.join("\n").trim();
        if (text) blocks.push(parseParagraphMarkup(text));
        paragraphLines = [];
    };

    const pushChoice = (choice: string) => {
        const lastBlock = blocks.at(-1);
        if (lastBlock?.kind === "choices") {
            lastBlock.choices.push(choice);
        } else {
            blocks.push({ kind: "choices", choices: [choice] });
        }
    };

    markup.split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trimEnd();
        const command = line.trimStart();
        if (!command) {
            flushParagraph();
            return;
        }
        if (isMetaCommand(command)) {
            flushParagraph();
            return;
        }
        if (command.startsWith("::math ")) {
            flushParagraph();
            blocks.push({ kind: "displayMath", latex: command.slice("::math ".length).trim() });
            return;
        }
        if (command.startsWith("::svg ")) {
            flushParagraph();
            const [src = "", alt = "도표", caption = ""] = command
                .slice("::svg ".length)
                .split("|")
                .map((part) => part.trim());
            if (src)
                blocks.push({
                    kind: "diagram",
                    src,
                    alt: alt || "도표",
                    caption: caption || undefined,
                });
            return;
        }
        if (command.startsWith("::note ")) {
            flushParagraph();
            blocks.push({ kind: "note", text: command.slice("::note ".length).trim() });
            return;
        }
        if (command.startsWith("::choice ")) {
            flushParagraph();
            pushChoice(command.slice("::choice ".length).trim());
            return;
        }
        paragraphLines.push(line);
    });

    flushParagraph();
    return blocks;
};

export const normalizedBodyForSave = (form: ProblemFormDraft): ProblemBodyBlock[] => {
    const parsed = parseProblemMarkup(form.bodyMarkup);
    const body =
        form.answerKind === "choice" ? parsed : parsed.filter((block) => block.kind !== "choices");
    if (form.answerKind !== "choice" || body.some((block) => block.kind === "choices")) return body;
    return [...body, { kind: "choices", choices: makeDefaultChoices() }];
};

export const removeChoiceMarkup = (markup: string) =>
    markup
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith("::choice "))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

export const appendDefaultChoiceMarkup = (markup: string) => {
    const choices = makeDefaultChoices()
        .map((choice) => `::choice ${choice}`)
        .join("\n");
    return `${markup.trim() ? `${markup.trim()}\n\n` : ""}${choices}`;
};

export const assetPathForUrl = (assetPath: string) =>
    assetPath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");

export const adminAssetSrc = (examId: string, src: string) => {
    if (/^(?:https?:|data:|\/)/.test(src)) return src;
    return `/api/admin/exams/${encodeURIComponent(examId)}/assets/${assetPathForUrl(src)}`;
};

export const bodyForAdminPreview = (examId: string, body: ProblemBodyBlock[]) =>
    body.map((block) =>
        block.kind === "diagram" ? { ...block, src: adminAssetSrc(examId, block.src) } : block,
    );

export const insertMarkupAtRange = (
    source: string,
    markup: string,
    start = source.length,
    end = start,
) => {
    const normalizedStart = Math.max(0, Math.min(source.length, start));
    const normalizedEnd = Math.max(normalizedStart, Math.min(source.length, end));
    const before = source.slice(0, normalizedStart).replace(/\s+$/g, "");
    const after = source.slice(normalizedEnd).replace(/^\s+/g, "");
    const prefix = before ? `${before}\n\n` : "";
    const suffix = after ? `\n\n${after}` : "";
    const value = `${prefix}${markup}${suffix}`;
    return { value, caret: prefix.length + markup.length };
};
