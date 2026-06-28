import type { ProblemBodyBlock, ProblemManifest, ProblemPublic } from "../../../../shared/game";
import { isProblemBody } from "../../../../shared/game";
import { adminAssetSrc, bodyForAdminPreview, makeDefaultChoices } from "../adminProblemMarkup";
import type { pointValueCheck, problemSourceMetaCheck } from "./adminFormUtils";
import type { AdminExam, ProblemForm } from "./adminTypes";

export type BodyCheck =
    | { ok: true; body: ProblemBodyBlock[] | null; error: "" }
    | { ok: false; body: null; error: string };

export const sortExams = (exams: AdminExam[]) =>
    exams.sort(
        (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
    );

export const filterProblems = (selectedExam: AdminExam | undefined, problemQuery: string) => {
    if (!selectedExam) return [];
    const query = problemQuery.trim().toLowerCase();
    if (!query) return selectedExam.problems;
    return selectedExam.problems.filter((problem) =>
        [
            String(problem.number),
            problem.id,
            problem.title,
            problem.answer,
            problem.answerKind,
            String(problem.difficulty),
            String(problem.pointValue ?? ""),
        ].some((value) => value.toLowerCase().includes(query)),
    );
};

export const makeBodyCheck = (
    form: ProblemForm | null,
    parsedBody: ProblemBodyBlock[],
): BodyCheck => {
    if (!form) return { ok: false, body: null, error: "" };
    if (!isProblemBody(parsedBody))
        return { ok: false, body: null, error: "본문 구조를 확인하세요." };
    const choices = parsedBody.find((block) => block.kind === "choices")?.choices;
    if (form.answerKind === "choice" && !choices)
        return { ok: false, body: null, error: "객관식 선택지를 추가하세요." };
    if (form.answerKind === "choice" && choices?.some((choice) => !choice.trim()))
        return { ok: false, body: null, error: "빈 선택지를 채우거나 지우세요." };
    const answerIndex = Number(form.answer);
    if (
        form.answerKind === "choice" &&
        choices &&
        (!Number.isInteger(answerIndex) || answerIndex < 1 || answerIndex > choices.length)
    ) {
        return {
            ok: false,
            body: null,
            error: "정답 번호가 선택지 범위를 벗어났습니다.",
        };
    }
    return { ok: true, body: parsedBody.length ? parsedBody : null, error: "" };
};

export const canSaveProblem = ({
    form,
    selectedProblem,
    bodyCheck,
    pointCheck,
    sourceMetaCheck,
}: {
    form: ProblemForm | null;
    selectedProblem: ProblemManifest | undefined;
    bodyCheck: BodyCheck;
    pointCheck: ReturnType<typeof pointValueCheck>;
    sourceMetaCheck: ReturnType<typeof problemSourceMetaCheck>;
}) =>
    Boolean(
        form &&
        selectedProblem &&
        bodyCheck.ok &&
        pointCheck.ok &&
        sourceMetaCheck.ok &&
        form.title.trim() &&
        form.answer.trim() &&
        Number.isInteger(form.difficulty) &&
        form.difficulty >= 1 &&
        form.difficulty <= 5,
    );

export const makePreviewProblem = ({
    selectedExam,
    selectedProblem,
    form,
    bodyCheck,
    pointCheck,
    sourceMetaCheck,
}: {
    selectedExam: AdminExam | undefined;
    selectedProblem: ProblemManifest | undefined;
    form: ProblemForm | null;
    bodyCheck: BodyCheck;
    pointCheck: ReturnType<typeof pointValueCheck>;
    sourceMetaCheck: ReturnType<typeof problemSourceMetaCheck>;
}): ProblemPublic | null => {
    if (!selectedExam || !selectedProblem || !form || !bodyCheck.ok || !sourceMetaCheck.ok)
        return null;
    return {
        id: selectedProblem.id,
        number: selectedProblem.number,
        title: form.title,
        answerKind: form.answerKind,
        difficulty: form.difficulty as ProblemManifest["difficulty"],
        pointValue: pointCheck.value ?? selectedProblem.pointValue ?? 0,
        imageUrl: selectedProblem.image
            ? adminAssetSrc(selectedExam.id, `problems/${selectedProblem.image}`)
            : undefined,
        body: bodyCheck.body ? bodyForAdminPreview(selectedExam.id, bodyCheck.body) : undefined,
        text: selectedProblem.text,
        sourceNumber: sourceMetaCheck.sourceNumber ?? undefined,
        sourcePage: sourceMetaCheck.sourcePage ?? undefined,
        bbox: sourceMetaCheck.bbox ?? undefined,
        section: sourceMetaCheck.section || undefined,
        captureQuality: selectedProblem.captureQuality,
    };
};

export const choicesForAnswer = (form: ProblemForm | null, parsedBody: ProblemBodyBlock[]) =>
    form?.answerKind === "choice"
        ? (parsedBody.find((block) => block.kind === "choices")?.choices ?? makeDefaultChoices())
        : [];
