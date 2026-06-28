import type { ProblemBodyBlock, ProblemManifest } from "../shared/game.js";
import {
    createProblemInDatabase,
    updateProblemInDatabase,
    type ExamCatalogDatabase,
} from "./examDatabase.js";
import {
    readOptionalBbox,
    readOptionalBodyBlocks,
    readOptionalPositiveInteger,
    readString,
} from "./requestUtils.js";

type ProblemRequestResult = ProblemManifest | null | "bad-payload" | "bad-point";

// eslint-disable-next-line complexity
const readProblemPayload = (body: { [key: string]: unknown }, isCreate: boolean) => {
    const title = readString(body?.title, 120) || (isCreate ? "새 문항" : "");
    const answerKind =
        body?.answerKind === "short" ? "short" : body?.answerKind === "choice" ? "choice" : "";
    const answer = readString(body?.answer, 40) || (isCreate ? "1" : "");
    const difficulty = Number(body?.difficulty ?? (isCreate ? 1 : undefined));
    const pointValueRaw = body?.pointValue;
    const pointValue =
        pointValueRaw === null || pointValueRaw === "" || pointValueRaw === undefined
            ? null
            : Number(pointValueRaw);
    const problemBody =
        isCreate && body?.body === undefined
            ? ([{ kind: "paragraph", text: "" }] as ProblemBodyBlock[])
            : readOptionalBodyBlocks(body?.body);
    const sourceNumber = readOptionalPositiveInteger(body?.sourceNumber);
    const sourcePage = readOptionalPositiveInteger(body?.sourcePage);
    const bbox = readOptionalBbox(body?.bbox);
    const section = readString(body?.section, 80) || null;

    if (
        !title ||
        !answerKind ||
        !answer ||
        !Number.isInteger(difficulty) ||
        difficulty < 1 ||
        difficulty > 5 ||
        problemBody === undefined ||
        sourceNumber === undefined ||
        sourcePage === undefined ||
        bbox === undefined
    )
        return "bad-payload" as const;
    if (
        pointValue !== null &&
        (!Number.isInteger(pointValue) || pointValue < 1 || pointValue > 100)
    )
        return "bad-point" as const;

    return {
        title,
        answerKind: answerKind as ProblemManifest["answerKind"],
        answer,
        difficulty: difficulty as ProblemManifest["difficulty"],
        pointValue,
        body: problemBody,
        sourceNumber,
        sourcePage,
        bbox,
        section,
    };
};

export const createProblemFromRequest = async (
    db: ExamCatalogDatabase,
    examId: string,
    body: { [key: string]: unknown },
): Promise<ProblemRequestResult> => {
    const payload = readProblemPayload(body, true);
    if (payload === "bad-payload" || payload === "bad-point") return payload;
    return createProblemInDatabase(db, examId, payload);
};

export const updateProblemFromRequest = async (
    db: ExamCatalogDatabase,
    examId: string,
    problemId: string,
    body: { [key: string]: unknown },
): Promise<ProblemRequestResult> => {
    const payload = readProblemPayload(body, false);
    if (payload === "bad-payload" || payload === "bad-point") return payload;
    return updateProblemInDatabase(db, examId, problemId, payload);
};
