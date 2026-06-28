import { useEffect, useMemo, useState } from "react";
import type { ProblemManifest } from "../../../../shared/game";
import {
    appendDefaultChoiceMarkup,
    parseProblemMarkup,
    removeChoiceMarkup,
} from "../adminProblemMarkup";
import {
    ADMIN_TOKEN_KEY,
    dateTimeLocalToIso,
    examSettingsCheck,
    makeEmptyNewExamForm,
    makeExamSettingsForm,
    makeForm,
    newExamCheck,
    normalizedBody,
    pointValueCheck,
    problemSourceMetaCheck,
} from "./adminFormUtils";
import {
    createAdminExam,
    endAdminEvent,
    fetchAdminExams,
    saveAdminExamSettings,
} from "./adminEditorApi";
import type { AdminExam, ExamSettingsForm, NewExamForm, ProblemForm } from "./adminTypes";
import {
    canSaveProblem,
    choicesForAnswer,
    filterProblems,
    makeBodyCheck,
    makePreviewProblem,
    sortExams,
} from "./adminEditorDerived";
import { useAdminBodyMarkup } from "./useAdminBodyMarkup";
import { useAdminProblemActions } from "./useAdminProblemActions";

export function useAdminEditor() {
    const [token, setToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
    const [exams, setExams] = useState<AdminExam[]>([]);
    const [selectedExamId, setSelectedExamId] = useState("");
    const [selectedProblemId, setSelectedProblemId] = useState("");
    const [form, setForm] = useState<ProblemForm | null>(null);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [problemQuery, setProblemQuery] = useState("");
    const [examSettings, setExamSettings] = useState<ExamSettingsForm | null>(null);
    const [newExam, setNewExam] = useState<NewExamForm>(() => makeEmptyNewExamForm());
    const [newExamOpen, setNewExamOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const {
        assetDragging,
        uploadingAsset,
        bodyEditorRef,
        setAssetDragging,
        insertBodyMarkup,
        handleBodyDrop,
        handleBodyDragOver,
    } = useAdminBodyMarkup({
        token,
        selectedExamId,
        setForm,
        setError,
        setStatus,
    });

    const selectedExam = useMemo(
        () => exams.find((exam) => exam.id === selectedExamId) ?? exams[0],
        [exams, selectedExamId],
    );
    const selectedProblem = useMemo(
        () =>
            selectedExam?.problems.find((problem) => problem.id === selectedProblemId) ??
            selectedExam?.problems[0],
        [selectedExam, selectedProblemId],
    );
    const selectedProblemIndex = useMemo(
        () =>
            selectedExam?.problems.findIndex((problem) => problem.id === selectedProblem?.id) ?? -1,
        [selectedExam, selectedProblem],
    );
    const filteredProblems = useMemo(
        () => filterProblems(selectedExam, problemQuery),
        [problemQuery, selectedExam],
    );
    const parsedBody = useMemo(
        () => (form ? normalizedBody(form) : []),
        [form?.answerKind, form?.bodyMarkup],
    );

    const bodyCheck = useMemo(() => makeBodyCheck(form, parsedBody), [form, parsedBody]);

    const pointCheck = useMemo(() => pointValueCheck(form), [form?.pointValue]);
    const sourceMetaCheck = useMemo(() => problemSourceMetaCheck(form), [form?.bodyMarkup]);
    const settingsCheck = useMemo(
        () => examSettingsCheck(selectedExam, examSettings),
        [examSettings, selectedExam],
    );
    const createExamCheck = useMemo(() => newExamCheck(newExam), [newExam]);
    const isExamSettingsDirty = Boolean(
        selectedExam &&
        examSettings &&
        JSON.stringify(makeExamSettingsForm(selectedExam)) !== JSON.stringify(examSettings),
    );
    const isDirty = Boolean(
        selectedProblem &&
        form &&
        JSON.stringify(makeForm(selectedProblem)) !== JSON.stringify(form),
    );
    const canSave = canSaveProblem({
        form,
        selectedProblem,
        bodyCheck,
        pointCheck,
        sourceMetaCheck,
    });
    const previewProblem = useMemo(
        () =>
            makePreviewProblem({
                selectedExam,
                selectedProblem,
                form,
                bodyCheck,
                pointCheck,
                sourceMetaCheck,
            }),
        [bodyCheck, form, pointCheck, selectedExam, selectedProblem, sourceMetaCheck],
    );
    const answerChoices = choicesForAnswer(form, parsedBody);
    const { resetForm, createProblem, selectProblemOffset, saveProblem } = useAdminProblemActions({
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
    });

    const updateForm = <TKey extends keyof ProblemForm>(key: TKey, value: ProblemForm[TKey]) =>
        setForm((current) => (current ? { ...current, [key]: value } : current));
    const updateExamSettings = <TKey extends keyof ExamSettingsForm>(
        key: TKey,
        value: ExamSettingsForm[TKey],
    ) => setExamSettings((current) => (current ? { ...current, [key]: value } : current));
    const updateNewExam = <TKey extends keyof NewExamForm>(key: TKey, value: NewExamForm[TKey]) =>
        setNewExam((current) => ({ ...current, [key]: value }));

    const loadExams = async () => {
        setLoading(true);
        setError("");
        setStatus("");
        try {
            const data = await fetchAdminExams(token);
            setExams(data);
            setSelectedExamId((current) =>
                data.some((exam) => exam.id === current) ? current : (data[0]?.id ?? ""),
            );
        } catch (nextError) {
            setError(
                nextError instanceof Error
                    ? nextError.message
                    : "문제지 목록을 불러오지 못했습니다.",
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadExams();
    }, []);
    useEffect(() => {
        if (!selectedExam) return;
        setSelectedProblemId((current) =>
            selectedExam.problems.some((problem) => problem.id === current)
                ? current
                : (selectedExam.problems[0]?.id ?? ""),
        );
        setSettingsOpen(false);
    }, [selectedExam?.id]);
    useEffect(() => {
        setForm(selectedProblem ? makeForm(selectedProblem) : null);
    }, [selectedProblem?.id]);
    useEffect(() => {
        if (selectedExam) setExamSettings(makeExamSettingsForm(selectedExam));
    }, [
        selectedExam?.id,
        selectedExam?.active,
        selectedExam?.title,
        selectedExam?.subtitle,
        selectedExam?.timeLimitSec,
        selectedExam?.freezeBeforeSec,
        selectedExam?.releaseAt,
    ]);

    const saveToken = () => {
        window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
        setStatus("관리자 토큰 저장됨");
    };

    const updateAnswerKind = (answerKind: ProblemManifest["answerKind"]) => {
        setForm((current) => {
            if (!current) return current;
            if (answerKind === "short")
                return {
                    ...current,
                    answerKind,
                    bodyMarkup: removeChoiceMarkup(current.bodyMarkup),
                };
            if (!parseProblemMarkup(current.bodyMarkup).some((block) => block.kind === "choices"))
                return {
                    ...current,
                    answerKind,
                    answer: "1",
                    bodyMarkup: appendDefaultChoiceMarkup(current.bodyMarkup),
                };
            return {
                ...current,
                answerKind,
                answer: answerKind === "choice" && !current.answer.trim() ? "1" : current.answer,
            };
        });
    };

    const createExam = async () => {
        setError("");
        setStatus("");
        if (!createExamCheck.ok) {
            setError(createExamCheck.error);
            return;
        }
        let created: AdminExam;
        try {
            created = await createAdminExam(token, {
                id: newExam.id.trim(),
                title: newExam.title.trim(),
                subtitle: newExam.subtitle.trim(),
                timeLimitSec: createExamCheck.timeLimitSec,
                freezeBeforeSec: createExamCheck.freezeBeforeSec,
                active: newExam.active,
                releaseAt: dateTimeLocalToIso(newExam.releaseAt),
            });
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "문제지 생성 실패");
            return;
        }
        setExams((current) =>
            sortExams([...current.filter((exam) => exam.id !== created.id), created]),
        );
        setSelectedExamId(created.id);
        setSelectedProblemId("");
        setProblemQuery("");
        setNewExam(makeEmptyNewExamForm());
        setNewExamOpen(false);
        setStatus(`${created.title} 생성됨`);
    };

    const saveExamSettings = async (nextSettings = examSettings) => {
        if (!selectedExam || !nextSettings) return;
        setError("");
        setStatus("");
        const nextSettingsCheck = examSettingsCheck(selectedExam, nextSettings);
        if (!nextSettingsCheck.ok) {
            setError(nextSettingsCheck.error);
            return;
        }
        if (
            nextSettings.releaseAt.trim() &&
            Number.isNaN(Date.parse(nextSettings.releaseAt.trim()))
        ) {
            setError("공개 시작 시각 형식을 확인하세요.");
            return;
        }
        let updated: AdminExam;
        try {
            updated = await saveAdminExamSettings(token, selectedExam.id, {
                title: nextSettings.title.trim(),
                subtitle: nextSettings.subtitle.trim(),
                timeLimitSec: nextSettingsCheck.timeLimitSec,
                freezeBeforeSec: nextSettingsCheck.freezeBeforeSec,
                active: nextSettings.active,
                releaseAt: dateTimeLocalToIso(nextSettings.releaseAt),
            });
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "문제지 설정 저장 실패");
            return;
        }
        setExams((current) =>
            sortExams(current.map((exam) => (exam.id === updated.id ? updated : exam))),
        );
        setSelectedExamId(updated.id);
        setExamSettings(makeExamSettingsForm(updated));
        setStatus(`${updated.title} 설정 저장됨`);
    };

    const endSelectedEvent = async () => {
        if (!selectedExam) return;
        if (!window.confirm(`${selectedExam.title} 대회를 종료할까요?`)) return;
        setError("");
        setStatus("");
        let result: { endedRooms: number };
        try {
            result = await endAdminEvent(token, selectedExam.id);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "대회 종료 실패");
            return;
        }
        setStatus(`${selectedExam.title} 종료 처리됨 · ${result.endedRooms}개 방`);
    };

    const toggleSelectedExamActive = () => {
        if (!examSettings) return;
        const nextSettings = { ...examSettings, active: !examSettings.active };
        setExamSettings(nextSettings);
        void saveExamSettings(nextSettings);
    };

    return {
        state: {
            token,
            exams,
            selectedExam,
            selectedProblem,
            selectedProblemIndex,
            filteredProblems,
            form,
            status,
            error,
            loading,
            problemQuery,
            examSettings,
            newExam,
            newExamOpen,
            settingsOpen,
            assetDragging,
            uploadingAsset,
            bodyCheck,
            pointCheck,
            sourceMetaCheck,
            settingsCheck,
            createExamCheck,
            isExamSettingsDirty,
            isDirty,
            canSave,
            previewProblem,
            choicesForAnswer: answerChoices,
            bodyEditorRef,
        },
        setters: {
            setToken,
            setSelectedExamId,
            setSelectedProblemId,
            setProblemQuery,
            setNewExam,
            setNewExamOpen,
            setSettingsOpen,
            setAssetDragging,
        },
        actions: {
            loadExams,
            saveToken,
            updateForm,
            updateExamSettings,
            updateNewExam,
            updateAnswerKind,
            insertBodyMarkup,
            handleBodyDrop,
            handleBodyDragOver,
            resetForm,
            createExam,
            saveExamSettings,
            endSelectedEvent,
            toggleSelectedExamActive,
            createProblem,
            selectProblemOffset,
            saveProblem,
        },
    };
}

export type AdminEditorModel = ReturnType<typeof useAdminEditor>;
