import fs from "node:fs";
import path from "node:path";
import type { ExamManifest, ExamPublic, ExamSummary } from "../shared/game.js";
import { getProblemPointValue } from "../shared/game.js";

const ACTIVE_EXAM_IDS = new Set(["preliminary-day"]);

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
  problemCount: exam.problems.length
});

export const toExamPublic = (exam: ExamManifest): ExamPublic => ({
  ...toExamSummary(exam),
  captureSummary: exam.captureSummary,
  problems: exam.problems.map((problem) => ({
    id: problem.id,
    number: problem.number,
    title: problem.title,
    answerKind: problem.answerKind,
    difficulty: problem.difficulty,
    pointValue: getProblemPointValue(problem),
    imageUrl: problem.image ? `/exams/${exam.id}/problems/${problem.image}` : undefined,
    body: problem.body?.map((block) => (block.kind === "diagram" ? { ...block, src: `/exams/${exam.id}/${block.src}` } : block)),
    text: problem.text,
    sourceNumber: problem.sourceNumber,
    sourcePage: problem.sourcePage,
    bbox: problem.bbox,
    section: problem.section,
    captureQuality: problem.captureQuality
  }))
});
