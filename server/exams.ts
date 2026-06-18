import fs from "node:fs";
import path from "node:path";
import type { ExamManifest, ExamPublic, ExamSummary, GymEventSummary } from "../shared/game.js";
import { examFreezeBeforeSec, getProblemPointValue } from "../shared/game.js";

export const ACTIVE_EXAM_IDS = new Set(["preliminary-day"]);
export const OPEN_REGISTRATION_EXAM_IDS = new Set(["preliminary-day"]);

export const isOpenRegistrationExam = (exam: ExamManifest) =>
    OPEN_REGISTRATION_EXAM_IDS.has(exam.id);

export const readExams = (examsDir: string): ExamManifest[] => {
    if (!fs.existsSync(examsDir)) return [];

    return fs
        .readdirSync(examsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => fs.existsSync(path.join(examsDir, entry.name, "manifest.json")))
        .map((entry) => {
            const manifestPath = path.join(examsDir, entry.name, "manifest.json");
            return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ExamManifest;
        })
        .filter((exam) => ACTIVE_EXAM_IDS.has(exam.id))
        .sort((a, b) => a.title.localeCompare(b.title));
};

export const isExamReleased = (exam: ExamManifest, now = Date.now()) => {
    if (!exam.releaseAt) return true;
    const releaseAt = Date.parse(exam.releaseAt);
    return !Number.isFinite(releaseAt) || now >= releaseAt;
};

export const toExamSummary = (exam: ExamManifest): ExamSummary => ({
    id: exam.id,
    title: exam.title,
    subtitle: exam.subtitle,
    timeLimitSec: exam.timeLimitSec,
    freezeBeforeSec: examFreezeBeforeSec(exam),
    problemCount: exam.problems.length,
});

export const toGymEventSummary = (exam: ExamManifest, now = Date.now()): GymEventSummary => {
    const releaseAt = exam.releaseAt ? Date.parse(exam.releaseAt) : NaN;
    return {
        ...toExamSummary(exam),
        startsAt: exam.releaseAt ?? null,
        status: Number.isFinite(releaseAt) && now < releaseAt ? "upcoming" : "open",
        registration: isOpenRegistrationExam(exam) ? "open" : "invite-only",
        spectatorAllowed: true,
    };
};

const defaultAssetUrl = (examId: string, assetPath: string) =>
    `/api/exams/${encodeURIComponent(examId)}/assets/${assetPath.split("/").map(encodeURIComponent).join("/")}`;

export const toExamPublic = (exam: ExamManifest, assetUrl = defaultAssetUrl): ExamPublic => ({
    ...toExamSummary(exam),
    captureSummary: exam.captureSummary,
    problems: exam.problems.map((problem) => ({
        id: problem.id,
        number: problem.number,
        title: problem.title,
        answerKind: problem.answerKind,
        difficulty: problem.difficulty,
        pointValue: getProblemPointValue(problem),
        imageUrl: problem.image ? assetUrl(exam.id, `problems/${problem.image}`) : undefined,
        body: problem.body?.map((block) =>
            block.kind === "diagram" ? { ...block, src: assetUrl(exam.id, block.src) } : block,
        ),
        text: problem.text,
        sourceNumber: problem.sourceNumber,
        sourcePage: problem.sourcePage,
        bbox: problem.bbox,
        section: problem.section,
        captureQuality: problem.captureQuality,
    })),
});
