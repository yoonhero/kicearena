import type { ProblemManifest } from "../../../../shared/game";
import { bodyToMarkup, normalizedBodyForSave } from "../adminProblemMarkup";
import type { AdminExam, ExamSettingsForm, NewExamForm, ProblemForm } from "./adminTypes";

export const ADMIN_TOKEN_KEY = "kice-admin-token";

export const toDateTimeLocalValue = (value: string | undefined) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const offsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

export const dateTimeLocalToIso = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
};

export const makeExamSettingsForm = (exam: AdminExam): ExamSettingsForm => ({
    title: exam.title,
    subtitle: exam.subtitle,
    timeLimitMin: String(Math.max(1, Math.round(exam.timeLimitSec / 60))),
    active: exam.active,
    releaseAt: toDateTimeLocalValue(exam.releaseAt),
});

export const makeEmptyNewExamForm = (): NewExamForm => ({
    id: "",
    title: "",
    subtitle: "직접 추가한 문제지",
    timeLimitMin: "100",
    active: false,
    releaseAt: "",
});

export const makeSlug = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 72);

export const isSvgFile = (file: File) =>
    file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

export const uploadHeaderFileName = (fileName: string) =>
    fileName
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 96) || "asset.svg";

export const makeForm = (problem: ProblemManifest): ProblemForm => ({
    title: problem.title,
    answerKind: problem.answerKind,
    answer: problem.answer,
    difficulty: problem.difficulty,
    pointValue: problem.pointValue ? String(problem.pointValue) : "",
    bodyMarkup: bodyToMarkup(
        problem.answerKind === "short"
            ? problem.body?.filter((block) => block.kind !== "choices")
            : problem.body,
    ),
});

export const newExamCheck = (newExam: NewExamForm) => {
    const timeLimitMin = Number(newExam.timeLimitMin);
    if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(newExam.id.trim()))
        return {
            ok: false,
            timeLimitSec: 0,
            error: "id는 영문 소문자, 숫자, 하이픈으로 3~80자여야 합니다.",
        };
    if (!newExam.title.trim() || !newExam.subtitle.trim())
        return { ok: false, timeLimitSec: 0, error: "새 문제지 제목과 설명을 입력하세요." };
    if (!Number.isInteger(timeLimitMin) || timeLimitMin < 1 || timeLimitMin > 1440)
        return {
            ok: false,
            timeLimitSec: 0,
            error: "시간은 1분 이상 1440분 이하의 정수여야 합니다.",
        };
    return { ok: true, timeLimitSec: timeLimitMin * 60, error: "" };
};

export const examSettingsCheck = (
    selectedExam: AdminExam | undefined,
    settings: ExamSettingsForm | null,
) => {
    if (!selectedExam || !settings) return { ok: false, timeLimitSec: 0, error: "" };
    const timeLimitMin = Number(settings.timeLimitMin);
    if (!settings.title.trim() || !settings.subtitle.trim())
        return { ok: false, timeLimitSec: 0, error: "문제지 제목과 설명을 입력하세요." };
    if (!Number.isInteger(timeLimitMin) || timeLimitMin < 1 || timeLimitMin > 1440)
        return {
            ok: false,
            timeLimitSec: 0,
            error: "시간은 1분 이상 1440분 이하의 정수여야 합니다.",
        };
    if (settings.releaseAt.trim() && Number.isNaN(Date.parse(settings.releaseAt.trim())))
        return { ok: false, timeLimitSec: 0, error: "공개 시작 시각 형식을 확인하세요." };
    return { ok: true, timeLimitSec: timeLimitMin * 60, error: "" };
};

export const pointValueCheck = (form: ProblemForm | null) => {
    if (!form || !form.pointValue.trim())
        return { ok: true, value: null as number | null, error: "" };
    const value = Number(form.pointValue);
    if (!Number.isInteger(value) || value < 1 || value > 100)
        return { ok: false, value: null, error: "점수는 1 이상 100 이하의 정수여야 합니다." };
    return { ok: true, value, error: "" };
};

export const normalizedBody = (form: ProblemForm) => normalizedBodyForSave(form);
