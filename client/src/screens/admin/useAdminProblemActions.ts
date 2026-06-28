import type { Dispatch, SetStateAction } from "react";
import type { ProblemManifest } from "../../../../shared/game";
import { createAdminProblem, saveAdminProblem } from "./adminEditorApi";
import type { BodyCheck } from "./adminEditorDerived";
import { makeForm } from "./adminFormUtils";
import type { AdminExam, ProblemForm } from "./adminTypes";
import type { pointValueCheck, problemSourceMetaCheck } from "./adminFormUtils";

export function useAdminProblemActions({
    token,
    selectedExam,
    selectedProblem,
    selectedProblemIndex,
    form,
    bodyCheck,
    pointCheck,
    sourceMetaCheck,
    setError,
    setStatus,
    setExams,
    setForm,
    setSelectedProblemId,
}: {
    token: string;
    selectedExam: AdminExam | undefined;
    selectedProblem: ProblemManifest | undefined;
    selectedProblemIndex: number;
    form: ProblemForm | null;
    bodyCheck: BodyCheck;
    pointCheck: ReturnType<typeof pointValueCheck>;
    sourceMetaCheck: ReturnType<typeof problemSourceMetaCheck>;
    setError: Dispatch<SetStateAction<string>>;
    setStatus: Dispatch<SetStateAction<string>>;
    setExams: Dispatch<SetStateAction<AdminExam[]>>;
    setForm: Dispatch<SetStateAction<ProblemForm | null>>;
    setSelectedProblemId: Dispatch<SetStateAction<string>>;
}) {
    const resetForm = () => {
        if (!selectedProblem) return;
        setForm(makeForm(selectedProblem));
        setError("");
        setStatus("");
    };

    const createProblem = async () => {
        if (!selectedExam) return;
        setError("");
        setStatus("");
        let created: ProblemManifest;
        try {
            created = await createAdminProblem(token, selectedExam.id);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "문항 추가 실패");
            return;
        }
        setExams((current) =>
            current.map((exam) =>
                exam.id === selectedExam.id
                    ? {
                          ...exam,
                          problems: [
                              ...exam.problems.filter((problem) => problem.id !== created.id),
                              created,
                          ].sort((left, right) => left.number - right.number),
                      }
                    : exam,
            ),
        );
        setSelectedProblemId(created.id);
        setStatus(`${created.number}번 문항 추가됨`);
    };

    const selectProblemOffset = (offset: number) => {
        if (!selectedExam || selectedProblemIndex < 0) return;
        const nextIndex = Math.max(
            0,
            Math.min(selectedExam.problems.length - 1, selectedProblemIndex + offset),
        );
        setSelectedProblemId(selectedExam.problems[nextIndex]?.id ?? "");
    };

    const saveProblem = async () => {
        if (!selectedExam || !selectedProblem || !form) return;
        setError("");
        setStatus("");
        if (!bodyCheck.ok) return setError(bodyCheck.error);
        if (!pointCheck.ok) return setError(pointCheck.error);
        if (!sourceMetaCheck.ok) return setError(sourceMetaCheck.error);
        if (
            !form.title.trim() ||
            !form.answer.trim() ||
            !Number.isInteger(form.difficulty) ||
            form.difficulty < 1 ||
            form.difficulty > 5
        )
            return setError("제목, 정답, 난도를 확인하세요.");
        let updated: ProblemManifest;
        try {
            updated = await saveAdminProblem(token, selectedExam.id, selectedProblem.id, {
                title: form.title,
                answerKind: form.answerKind,
                answer: form.answer,
                difficulty: form.difficulty,
                pointValue: pointCheck.value,
                sourceNumber: sourceMetaCheck.sourceNumber,
                sourcePage: sourceMetaCheck.sourcePage,
                bbox: sourceMetaCheck.bbox,
                section: sourceMetaCheck.section || null,
                body: bodyCheck.body,
            });
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "문제 저장 실패");
            return;
        }
        setExams((current) =>
            current.map((exam) =>
                exam.id === selectedExam.id
                    ? {
                          ...exam,
                          problems: exam.problems.map((problem) =>
                              problem.id === updated.id ? updated : problem,
                          ),
                      }
                    : exam,
            ),
        );
        setForm(makeForm(updated));
        setStatus(`${updated.number}번 저장됨`);
    };

    return { resetForm, createProblem, selectProblemOffset, saveProblem };
}
