import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { isProblemBody, type ProblemManifest, type ProblemPublic } from "../../../../shared/game";
import {
    adminAssetSrc,
    appendDefaultChoiceMarkup,
    bodyForAdminPreview,
    insertMarkupAtRange,
    makeDefaultChoices,
    parseProblemMarkup,
    removeChoiceMarkup,
} from "../adminProblemMarkup";
import {
    ADMIN_TOKEN_KEY,
    dateTimeLocalToIso,
    examSettingsCheck,
    isSvgFile,
    makeEmptyNewExamForm,
    makeExamSettingsForm,
    makeForm,
    newExamCheck,
    normalizedBody,
    pointValueCheck,
    uploadHeaderFileName,
} from "./adminFormUtils";
import type {
    AdminAssetUpload,
    AdminExam,
    ExamSettingsForm,
    NewExamForm,
    ProblemForm,
} from "./adminTypes";

const sortExams = (exams: AdminExam[]) =>
    exams.sort(
        (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
    );

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
    const [assetDragging, setAssetDragging] = useState(false);
    const [uploadingAsset, setUploadingAsset] = useState(false);
    const bodyEditorRef = useRef<HTMLTextAreaElement | null>(null);

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
    const filteredProblems = useMemo(() => {
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
    }, [problemQuery, selectedExam]);
    const parsedBody = useMemo(
        () => (form ? normalizedBody(form) : []),
        [form?.answerKind, form?.bodyMarkup],
    );

    const bodyCheck = useMemo(() => {
        if (!form) return { ok: false as const, body: null, error: "" };
        if (!isProblemBody(parsedBody))
            return { ok: false as const, body: null, error: "본문 구조를 확인하세요." };
        const choices = parsedBody.find((block) => block.kind === "choices")?.choices;
        if (form.answerKind === "choice" && !choices)
            return { ok: false as const, body: null, error: "객관식 선택지를 추가하세요." };
        if (form.answerKind === "choice" && choices?.some((choice) => !choice.trim()))
            return { ok: false as const, body: null, error: "빈 선택지를 채우거나 지우세요." };
        const answerIndex = Number(form.answer);
        if (
            form.answerKind === "choice" &&
            choices &&
            (!Number.isInteger(answerIndex) || answerIndex < 1 || answerIndex > choices.length)
        ) {
            return {
                ok: false as const,
                body: null,
                error: "정답 번호가 선택지 범위를 벗어났습니다.",
            };
        }
        return { ok: true as const, body: parsedBody.length ? parsedBody : null, error: "" };
    }, [form?.answer, form?.answerKind, parsedBody]);

    const pointCheck = useMemo(() => pointValueCheck(form), [form?.pointValue]);
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
    const canSave = Boolean(
        form &&
        selectedProblem &&
        bodyCheck.ok &&
        pointCheck.ok &&
        form.title.trim() &&
        form.answer.trim() &&
        Number.isInteger(form.difficulty) &&
        form.difficulty >= 1 &&
        form.difficulty <= 5,
    );
    const previewProblem = useMemo<ProblemPublic | null>(() => {
        if (!selectedExam || !selectedProblem || !form || !bodyCheck.ok) return null;
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
            sourceNumber: selectedProblem.sourceNumber,
            sourcePage: selectedProblem.sourcePage,
            bbox: selectedProblem.bbox,
            section: selectedProblem.section,
            captureQuality: selectedProblem.captureQuality,
        };
    }, [bodyCheck, form, pointCheck.value, selectedExam, selectedProblem]);
    const choicesForAnswer =
        form?.answerKind === "choice"
            ? (parsedBody.find((block) => block.kind === "choices")?.choices ??
              makeDefaultChoices())
            : [];

    const authHeaders = (): Record<string, string> => (token ? { "X-Admin-Token": token } : {});
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
            const response = await fetch("/api/admin/exams", { headers: authHeaders() });
            if (!response.ok)
                throw new Error(
                    response.status === 401 || response.status === 403
                        ? "관리자 권한을 확인하세요."
                        : "문제지 목록을 불러오지 못했습니다.",
                );
            const data = (await response.json()) as AdminExam[];
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

    const insertBodyMarkup = (markup: string, textarea = bodyEditorRef.current) => {
        let nextCaret = -1;
        setForm((current) => {
            if (!current) return current;
            const inserted = insertMarkupAtRange(
                current.bodyMarkup,
                markup,
                textarea?.selectionStart ?? current.bodyMarkup.length,
                textarea?.selectionEnd ?? textarea?.selectionStart ?? current.bodyMarkup.length,
            );
            nextCaret = inserted.caret;
            return { ...current, bodyMarkup: inserted.value };
        });
        window.requestAnimationFrame(() => {
            if (!bodyEditorRef.current || nextCaret < 0) return;
            bodyEditorRef.current.focus();
            bodyEditorRef.current.setSelectionRange(nextCaret, nextCaret);
        });
    };

    const uploadSvgAsset = async (file: File) => {
        if (!selectedExam) throw new Error("문제지를 먼저 선택하세요.");
        const response = await fetch(
            `/api/admin/exams/${encodeURIComponent(selectedExam.id)}/assets`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "image/svg+xml",
                    "X-File-Name": uploadHeaderFileName(file.name),
                    ...authHeaders(),
                },
                body: file,
            },
        );
        if (!response.ok)
            throw new Error(
                response.status === 401 || response.status === 403
                    ? "관리자 권한을 확인하세요."
                    : "SVG 업로드 실패",
            );
        return (await response.json()) as AdminAssetUpload;
    };

    const handleBodyDrop = async (event: DragEvent<HTMLTextAreaElement>) => {
        const files = [...event.dataTransfer.files];
        const file = files.find(isSvgFile);
        if (!file) {
            if (files.length > 0) {
                event.preventDefault();
                setAssetDragging(false);
                setError("SVG 파일만 업로드할 수 있습니다.");
            }
            return;
        }
        event.preventDefault();
        setAssetDragging(false);
        setUploadingAsset(true);
        setError("");
        setStatus("");
        try {
            const uploaded = await uploadSvgAsset(file);
            const label =
                file.name
                    .replace(/\.svg$/i, "")
                    .replace(/[-_]+/g, " ")
                    .trim() || "도표";
            insertBodyMarkup(`::svg ${uploaded.path} | ${label}`, event.currentTarget);
            setStatus(`${file.name} 업로드됨`);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "SVG 업로드 실패");
        } finally {
            setUploadingAsset(false);
        }
    };

    const handleBodyDragOver = (event: DragEvent<HTMLTextAreaElement>) => {
        if (![...event.dataTransfer.items].some((item) => item.kind === "file")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setAssetDragging(true);
    };

    const resetForm = () => {
        if (!selectedProblem) return;
        setForm(makeForm(selectedProblem));
        setError("");
        setStatus("");
    };

    const createExam = async () => {
        setError("");
        setStatus("");
        if (!createExamCheck.ok) {
            setError(createExamCheck.error);
            return;
        }
        const response = await fetch("/api/admin/exams", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
                id: newExam.id.trim(),
                title: newExam.title.trim(),
                subtitle: newExam.subtitle.trim(),
                timeLimitSec: createExamCheck.timeLimitSec,
                freezeBeforeSec: createExamCheck.freezeBeforeSec,
                active: newExam.active,
                releaseAt: dateTimeLocalToIso(newExam.releaseAt),
            }),
        });
        if (!response.ok) {
            setError(
                response.status === 409
                    ? "이미 존재하는 문제지 id입니다."
                    : response.status === 401 || response.status === 403
                      ? "관리자 권한을 확인하세요."
                      : "문제지 생성 실패",
            );
            return;
        }
        const created = (await response.json()) as AdminExam;
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
        const response = await fetch(`/api/admin/exams/${encodeURIComponent(selectedExam.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
                title: nextSettings.title.trim(),
                subtitle: nextSettings.subtitle.trim(),
                timeLimitSec: nextSettingsCheck.timeLimitSec,
                freezeBeforeSec: nextSettingsCheck.freezeBeforeSec,
                active: nextSettings.active,
                releaseAt: dateTimeLocalToIso(nextSettings.releaseAt),
            }),
        });
        if (!response.ok) {
            setError(
                response.status === 401 || response.status === 403
                    ? "관리자 권한을 확인하세요."
                    : "문제지 설정 저장 실패",
            );
            return;
        }
        const updated = (await response.json()) as AdminExam;
        setExams((current) =>
            sortExams(current.map((exam) => (exam.id === updated.id ? updated : exam))),
        );
        setSelectedExamId(updated.id);
        setExamSettings(makeExamSettingsForm(updated));
        setStatus(`${updated.title} 설정 저장됨`);
    };

    const createProblem = async () => {
        if (!selectedExam) return;
        setError("");
        setStatus("");
        const response = await fetch(
            `/api/admin/exams/${encodeURIComponent(selectedExam.id)}/problems`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    title: "새 문항",
                    answerKind: "short",
                    answer: "1",
                    difficulty: 1,
                    pointValue: null,
                    body: [{ kind: "paragraph", text: "" }],
                }),
            },
        );
        if (!response.ok) {
            setError(
                response.status === 401 || response.status === 403
                    ? "관리자 권한을 확인하세요."
                    : "문항 추가 실패",
            );
            return;
        }
        const created = (await response.json()) as ProblemManifest;
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
        if (
            !form.title.trim() ||
            !form.answer.trim() ||
            !Number.isInteger(form.difficulty) ||
            form.difficulty < 1 ||
            form.difficulty > 5
        )
            return setError("제목, 정답, 난도를 확인하세요.");
        const response = await fetch(
            `/api/admin/exams/${encodeURIComponent(selectedExam.id)}/problems/${encodeURIComponent(selectedProblem.id)}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({
                    title: form.title,
                    answerKind: form.answerKind,
                    answer: form.answer,
                    difficulty: form.difficulty,
                    pointValue: pointCheck.value,
                    body: bodyCheck.body,
                }),
            },
        );
        if (!response.ok) {
            setError(
                response.status === 401 || response.status === 403
                    ? "관리자 권한을 확인하세요."
                    : "문제 저장 실패",
            );
            return;
        }
        const updated = (await response.json()) as ProblemManifest;
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
            settingsCheck,
            createExamCheck,
            isExamSettingsDirty,
            isDirty,
            canSave,
            previewProblem,
            choicesForAnswer,
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
            toggleSelectedExamActive,
            createProblem,
            selectProblemOffset,
            saveProblem,
        },
    };
}

export type AdminEditorModel = ReturnType<typeof useAdminEditor>;
