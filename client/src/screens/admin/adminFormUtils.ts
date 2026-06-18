import { examFreezeBeforeSec, type ProblemManifest } from "../../../../shared/game";
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
    freezeBeforeMin: String(Math.round(examFreezeBeforeSec(exam) / 60)),
    active: exam.active,
    releaseAt: toDateTimeLocalValue(exam.releaseAt),
});

export const makeEmptyNewExamForm = (): NewExamForm => ({
    id: "",
    title: "",
    subtitle: "직접 추가한 문제지",
    timeLimitMin: "100",
    freezeBeforeMin: "10",
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

const sourceMetaToMarkup = (problem: ProblemManifest) =>
    [
        problem.sourceNumber || problem.sourcePage || problem.section
            ? `::source ${[problem.sourceNumber ?? "", problem.sourcePage ?? "", problem.section ?? ""].join(" | ").replace(/(?:\s*\|\s*)+$/g, "")}`
            : "",
        problem.bbox ? `::bbox ${problem.bbox.join(", ")}` : "",
    ]
        .filter(Boolean)
        .join("\n");

export const makeForm = (problem: ProblemManifest): ProblemForm => {
    const metaMarkup = sourceMetaToMarkup(problem);
    const bodyMarkup = bodyToMarkup(
        problem.answerKind === "short"
            ? problem.body?.filter((block) => block.kind !== "choices")
            : problem.body,
    );
    return {
        title: problem.title,
        answerKind: problem.answerKind,
        answer: problem.answer,
        difficulty: problem.difficulty,
        pointValue: problem.pointValue ? String(problem.pointValue) : "",
        bodyMarkup: [metaMarkup, bodyMarkup].filter(Boolean).join("\n\n"),
    };
};

export const optionalPositiveInteger = (value: string, label: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { ok: true as const, value: null, error: "" };
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1)
        return { ok: false as const, value: null, error: `${label}은 1 이상의 정수여야 합니다.` };
    return { ok: true as const, value: parsed, error: "" };
};

export const bboxCheck = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return { ok: true as const, value: null, error: "" };
    const parts = trimmed
        .replace(/^\[|\]$/g, "")
        .split(/[,\s]+/)
        .filter(Boolean);
    const bbox = parts.map(Number);
    if (bbox.length !== 4 || bbox.some((part) => !Number.isFinite(part)))
        return {
            ok: false as const,
            value: null,
            error: "bbox는 숫자 4개를 x1, y1, x2, y2 형식으로 입력하세요.",
        };
    if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1])
        return {
            ok: false as const,
            value: null,
            error: "bbox의 오른쪽/아래 좌표가 더 커야 합니다.",
        };
    return {
        ok: true as const,
        value: bbox as [number, number, number, number],
        error: "",
    };
};

const readSourceMetaMarkup = (bodyMarkup: string) => {
    const meta = {
        sourceNumber: "",
        sourcePage: "",
        bbox: "",
        section: "",
    };
    for (const rawLine of bodyMarkup.split(/\r?\n/)) {
        const command = rawLine.trim();
        if (command.startsWith("::source ")) {
            const [sourceNumber = "", sourcePage = "", section = ""] = command
                .slice("::source ".length)
                .split("|")
                .map((part) => part.trim());
            meta.sourceNumber = sourceNumber;
            meta.sourcePage = sourcePage;
            meta.section = section;
        } else if (command.startsWith("::source-number ")) {
            meta.sourceNumber = command.slice("::source-number ".length).trim();
        } else if (command.startsWith("::source-page ")) {
            meta.sourcePage = command.slice("::source-page ".length).trim();
        } else if (command.startsWith("::section ")) {
            meta.section = command.slice("::section ".length).trim();
        } else if (command.startsWith("::bbox ")) {
            meta.bbox = command.slice("::bbox ".length).trim();
        }
    }
    return meta;
};

export const problemSourceMetaCheck = (form: ProblemForm | null) => {
    if (!form)
        return {
            ok: false as const,
            sourceNumber: null,
            sourcePage: null,
            bbox: null,
            section: "",
            error: "",
        };
    const meta = readSourceMetaMarkup(form.bodyMarkup);
    const sourceNumber = optionalPositiveInteger(meta.sourceNumber, "원본 번호");
    if (!sourceNumber.ok)
        return {
            ok: false as const,
            sourceNumber: null,
            sourcePage: null,
            bbox: null,
            section: "",
            error: sourceNumber.error,
        };
    const sourcePage = optionalPositiveInteger(meta.sourcePage, "원본 페이지");
    if (!sourcePage.ok)
        return {
            ok: false as const,
            sourceNumber: null,
            sourcePage: null,
            bbox: null,
            section: "",
            error: sourcePage.error,
        };
    const bbox = bboxCheck(meta.bbox);
    if (!bbox.ok)
        return {
            ok: false as const,
            sourceNumber: null,
            sourcePage: null,
            bbox: null,
            section: "",
            error: bbox.error,
        };
    return {
        ok: true as const,
        sourceNumber: sourceNumber.value,
        sourcePage: sourcePage.value,
        bbox: bbox.value,
        section: meta.section.trim(),
        error: "",
    };
};

export const newExamCheck = (newExam: NewExamForm) => {
    const timeLimitMin = Number(newExam.timeLimitMin);
    const freezeBeforeMin = Number(newExam.freezeBeforeMin);
    if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(newExam.id.trim()))
        return {
            ok: false,
            timeLimitSec: 0,
            freezeBeforeSec: 0,
            error: "id는 영문 소문자, 숫자, 하이픈으로 3~80자여야 합니다.",
        };
    if (!newExam.title.trim() || !newExam.subtitle.trim())
        return {
            ok: false,
            timeLimitSec: 0,
            freezeBeforeSec: 0,
            error: "새 문제지 제목과 설명을 입력하세요.",
        };
    if (!Number.isInteger(timeLimitMin) || timeLimitMin < 1 || timeLimitMin > 1440)
        return {
            ok: false,
            timeLimitSec: 0,
            freezeBeforeSec: 0,
            error: "시간은 1분 이상 1440분 이하의 정수여야 합니다.",
        };
    if (!Number.isInteger(freezeBeforeMin) || freezeBeforeMin < 0 || freezeBeforeMin > timeLimitMin)
        return {
            ok: false,
            timeLimitSec: 0,
            freezeBeforeSec: 0,
            error: "프리즈 시간은 0분 이상 제한 시간 이하의 정수여야 합니다.",
        };
    return {
        ok: true,
        timeLimitSec: timeLimitMin * 60,
        freezeBeforeSec: freezeBeforeMin * 60,
        error: "",
    };
};

export const examSettingsCheck = (
    selectedExam: AdminExam | undefined,
    settings: ExamSettingsForm | null,
) => {
    if (!selectedExam || !settings)
        return { ok: false, timeLimitSec: 0, freezeBeforeSec: 0, error: "" };
    const timeLimitMin = Number(settings.timeLimitMin);
    const freezeBeforeMin = Number(settings.freezeBeforeMin);
    if (!settings.title.trim() || !settings.subtitle.trim())
        return {
            ok: false,
            timeLimitSec: 0,
            freezeBeforeSec: 0,
            error: "문제지 제목과 설명을 입력하세요.",
        };
    if (!Number.isInteger(timeLimitMin) || timeLimitMin < 1 || timeLimitMin > 1440)
        return {
            ok: false,
            timeLimitSec: 0,
            freezeBeforeSec: 0,
            error: "시간은 1분 이상 1440분 이하의 정수여야 합니다.",
        };
    if (!Number.isInteger(freezeBeforeMin) || freezeBeforeMin < 0 || freezeBeforeMin > timeLimitMin)
        return {
            ok: false,
            timeLimitSec: 0,
            freezeBeforeSec: 0,
            error: "프리즈 시간은 0분 이상 제한 시간 이하의 정수여야 합니다.",
        };
    if (settings.releaseAt.trim() && Number.isNaN(Date.parse(settings.releaseAt.trim())))
        return {
            ok: false,
            timeLimitSec: 0,
            freezeBeforeSec: 0,
            error: "공개 시작 시각 형식을 확인하세요.",
        };
    return {
        ok: true,
        timeLimitSec: timeLimitMin * 60,
        freezeBeforeSec: freezeBeforeMin * 60,
        error: "",
    };
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
