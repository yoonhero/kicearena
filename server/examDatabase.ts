import type { ExamManifest, ProblemManifest } from "../shared/game.js";
import { examFreezeBeforeSec } from "../shared/game.js";
import { examCatalogSchemaStatements } from "./examDatabaseSchema.js";
import { jsonParam, optionalJson, toReleaseAt } from "./examDatabaseUtils.js";
import type {
    AdminExamManifest,
    AdminExamRow,
    ExamAssetInput,
    ExamCatalogDatabase,
    ExamCreateInput,
    ExamRow,
    ExamSettingsUpdateInput,
    ProblemCreateInput,
    ProblemRow,
    ProblemUpdateInput,
} from "./examDatabaseTypes.js";
import { ACTIVE_EXAM_IDS } from "./exams.js";

export type {
    AdminExamManifest,
    ExamAsset,
    ExamAssetInput,
    ExamCatalogDatabase,
    ExamCreateInput,
    ExamSettingsUpdateInput,
    ProblemCreateInput,
    ProblemUpdateInput,
} from "./examDatabaseTypes.js";

export { createExamCatalogPool } from "./examDatabaseUtils.js";

export const migrateExamCatalog = async (db: ExamCatalogDatabase) => {
    for (const statement of examCatalogSchemaStatements) {
        await db.query(statement);
    }
};

export const seedExamCatalog = async (
    db: ExamCatalogDatabase,
    exams: ExamManifest[],
    activeExamIds = ACTIVE_EXAM_IDS,
    assets: ExamAssetInput[] = [],
) => {
    await db.query("BEGIN");
    try {
        for (const exam of exams) {
            await db.query(
                `INSERT INTO exams (id, title, subtitle, time_limit_sec, freeze_before_sec, release_at, capture_summary, active, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           subtitle = EXCLUDED.subtitle,
           time_limit_sec = EXCLUDED.time_limit_sec,
           freeze_before_sec = EXCLUDED.freeze_before_sec,
           release_at = EXCLUDED.release_at,
           capture_summary = EXCLUDED.capture_summary,
           active = EXCLUDED.active,
           updated_at = now()`,
                [
                    exam.id,
                    exam.title,
                    exam.subtitle,
                    exam.timeLimitSec,
                    examFreezeBeforeSec(exam),
                    exam.releaseAt ?? null,
                    jsonParam(exam.captureSummary),
                    activeExamIds.has(exam.id),
                ],
            );

            for (const problem of exam.problems) {
                await db.query(
                    `INSERT INTO problems (
             exam_id, id, number, title, answer_kind, answer, difficulty, point_value,
             image, body, text, source_number, source_page, bbox, section, capture_quality, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14::jsonb, $15, $16::jsonb, now())
           ON CONFLICT (exam_id, id) DO UPDATE SET
             number = EXCLUDED.number,
             title = EXCLUDED.title,
             answer_kind = EXCLUDED.answer_kind,
             answer = EXCLUDED.answer,
             difficulty = EXCLUDED.difficulty,
             point_value = EXCLUDED.point_value,
             image = EXCLUDED.image,
             body = EXCLUDED.body,
             text = EXCLUDED.text,
             source_number = EXCLUDED.source_number,
             source_page = EXCLUDED.source_page,
             bbox = EXCLUDED.bbox,
             section = EXCLUDED.section,
             capture_quality = EXCLUDED.capture_quality,
             updated_at = now()`,
                    [
                        exam.id,
                        problem.id,
                        problem.number,
                        problem.title,
                        problem.answerKind,
                        problem.answer,
                        problem.difficulty,
                        problem.pointValue ?? null,
                        problem.image ?? null,
                        jsonParam(problem.body),
                        problem.text ?? null,
                        problem.sourceNumber ?? null,
                        problem.sourcePage ?? null,
                        jsonParam(problem.bbox),
                        problem.section ?? null,
                        jsonParam(problem.captureQuality),
                    ],
                );
            }

            await db.query(
                "DELETE FROM problems WHERE exam_id = $1 AND NOT (id = ANY($2::text[]))",
                [exam.id, exam.problems.map((problem) => problem.id)],
            );
        }

        for (const asset of assets) {
            await db.query(
                `INSERT INTO exam_assets (exam_id, path, content_type, body, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (exam_id, path) DO UPDATE SET
           content_type = EXCLUDED.content_type,
           body = EXCLUDED.body,
           updated_at = now()`,
                [asset.examId, asset.path, asset.contentType, asset.body],
            );
        }

        for (const exam of exams) {
            const assetPaths = assets
                .filter((asset) => asset.examId === exam.id)
                .map((asset) => asset.path);
            await db.query(
                "DELETE FROM exam_assets WHERE exam_id = $1 AND NOT (path = ANY($2::text[]))",
                [exam.id, assetPaths],
            );
        }

        await db.query("COMMIT");
    } catch (error) {
        await db.query("ROLLBACK");
        throw error;
    }
};

export const composeExamManifests = (
    examRows: ExamRow[],
    problemRows: ProblemRow[],
): ExamManifest[] => {
    const problemsByExam = new Map<string, ProblemManifest[]>();
    for (const row of problemRows) {
        const problem: ProblemManifest = {
            id: row.id,
            number: Number(row.number),
            title: row.title,
            answerKind: row.answer_kind,
            answer: row.answer,
            difficulty: Number(row.difficulty) as ProblemManifest["difficulty"],
            pointValue: row.point_value ?? undefined,
            image: row.image ?? undefined,
            body: optionalJson(row.body),
            text: row.text ?? undefined,
            sourceNumber: row.source_number ?? undefined,
            sourcePage: row.source_page ?? undefined,
            bbox: optionalJson(row.bbox),
            section: row.section ?? undefined,
            captureQuality: optionalJson(row.capture_quality),
        };
        problemsByExam.set(row.exam_id, [...(problemsByExam.get(row.exam_id) ?? []), problem]);
    }

    return examRows.map((row) => ({
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        timeLimitSec: Number(row.time_limit_sec),
        freezeBeforeSec: examFreezeBeforeSec({
            timeLimitSec: Number(row.time_limit_sec),
            freezeBeforeSec: row.freeze_before_sec ?? undefined,
        }),
        releaseAt: toReleaseAt(row.release_at),
        captureSummary: optionalJson(row.capture_summary),
        problems: problemsByExam.get(row.id) ?? [],
    }));
};

export const readExamsFromDatabase = async (db: ExamCatalogDatabase): Promise<ExamManifest[]> => {
    const exams = await db.query<ExamRow>(
        `SELECT id, title, subtitle, time_limit_sec, freeze_before_sec, release_at, capture_summary
     FROM exams
     WHERE active = true
     ORDER BY title, id`,
    );
    if (exams.rows.length === 0) return [];

    const examIds = exams.rows.map((exam) => exam.id);
    const problems = await db.query<ProblemRow>(
        `SELECT exam_id, id, number, title, answer_kind, answer, difficulty, point_value,
            image, body, text, source_number, source_page, bbox, section, capture_quality
     FROM problems
     WHERE exam_id = ANY($1::text[])
     ORDER BY exam_id, number`,
        [examIds],
    );

    return composeExamManifests(exams.rows, problems.rows);
};

export const readAdminExamsFromDatabase = async (
    db: ExamCatalogDatabase,
): Promise<AdminExamManifest[]> => {
    const exams = await db.query<AdminExamRow>(
        `SELECT id, title, subtitle, time_limit_sec, freeze_before_sec, release_at, capture_summary, active
     FROM exams
     ORDER BY title, id`,
    );
    if (exams.rows.length === 0) return [];

    const examIds = exams.rows.map((exam) => exam.id);
    const problems = await db.query<ProblemRow>(
        `SELECT exam_id, id, number, title, answer_kind, answer, difficulty, point_value,
            image, body, text, source_number, source_page, bbox, section, capture_quality
     FROM problems
     WHERE exam_id = ANY($1::text[])
     ORDER BY exam_id, number`,
        [examIds],
    );

    const manifests = composeExamManifests(exams.rows, problems.rows);
    const activeById = new Map(exams.rows.map((exam) => [exam.id, exam.active]));
    return manifests.map((exam) => ({ ...exam, active: activeById.get(exam.id) === true }));
};

export const createExamInDatabase = async (
    db: ExamCatalogDatabase,
    input: ExamCreateInput,
): Promise<AdminExamManifest> => {
    const result = await db.query<AdminExamRow>(
        `INSERT INTO exams (id, title, subtitle, time_limit_sec, freeze_before_sec, active, release_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     RETURNING id, title, subtitle, time_limit_sec, freeze_before_sec, release_at, capture_summary, active`,
        [
            input.id,
            input.title,
            input.subtitle,
            input.timeLimitSec,
            input.freezeBeforeSec,
            input.active,
            input.releaseAt,
        ],
    );
    const [manifest] = composeExamManifests(result.rows, []);
    return { ...manifest, active: result.rows[0]?.active === true };
};

export const updateExamSettingsInDatabase = async (
    db: ExamCatalogDatabase,
    examId: string,
    update: ExamSettingsUpdateInput,
): Promise<AdminExamManifest | null> => {
    const result = await db.query<AdminExamRow>(
        `UPDATE exams
     SET title = $2,
         subtitle = $3,
         time_limit_sec = $4,
         freeze_before_sec = $5,
         active = $6,
         release_at = $7,
         updated_at = now()
     WHERE id = $1
     RETURNING id, title, subtitle, time_limit_sec, freeze_before_sec, release_at, capture_summary, active`,
        [
            examId,
            update.title,
            update.subtitle,
            update.timeLimitSec,
            update.freezeBeforeSec,
            update.active,
            update.releaseAt,
        ],
    );
    const [manifest] = composeExamManifests(result.rows, []);
    return manifest ? { ...manifest, active: result.rows[0]?.active === true } : null;
};

export const createProblemInDatabase = async (
    db: ExamCatalogDatabase,
    examId: string,
    input: ProblemCreateInput,
): Promise<ProblemManifest | null> => {
    const result = await db.query<ProblemRow>(
        `WITH next_problem AS (
       SELECT COALESCE(MAX(number), 0) + 1 AS number
       FROM problems
       WHERE exam_id = $1
     )
     INSERT INTO problems (
       exam_id, id, number, title, answer_kind, answer, difficulty, point_value, body,
       source_number, source_page, bbox, section, updated_at
     )
     SELECT $1, 'p' || number::text, number, $2, $3, $4, $5, $6, $7::jsonb,
            $8, $9, $10::jsonb, $11, now()
     FROM next_problem
     WHERE EXISTS (SELECT 1 FROM exams WHERE id = $1)
     RETURNING exam_id, id, number, title, answer_kind, answer, difficulty, point_value,
               image, body, text, source_number, source_page, bbox, section, capture_quality`,
        [
            examId,
            input.title,
            input.answerKind,
            input.answer,
            input.difficulty,
            input.pointValue,
            jsonParam(input.body),
            input.sourceNumber ?? null,
            input.sourcePage ?? null,
            jsonParam(input.bbox ?? null),
            input.section ?? null,
        ],
    );
    const [manifest] = composeExamManifests(
        [
            {
                id: examId,
                title: "",
                subtitle: "",
                time_limit_sec: 1,
                freeze_before_sec: 0,
                release_at: null,
                capture_summary: null,
            },
        ],
        result.rows,
    );
    return manifest?.problems[0] ?? null;
};

export const updateProblemInDatabase = async (
    db: ExamCatalogDatabase,
    examId: string,
    problemId: string,
    update: ProblemUpdateInput,
): Promise<ProblemManifest | null> => {
    const result = await db.query<ProblemRow>(
        `UPDATE problems
     SET title = $3,
         answer_kind = $4,
         answer = $5,
         difficulty = $6,
         point_value = $7,
         body = $8::jsonb,
         source_number = $9,
         source_page = $10,
         bbox = $11::jsonb,
         section = $12,
         updated_at = now()
     WHERE exam_id = $1 AND id = $2
     RETURNING exam_id, id, number, title, answer_kind, answer, difficulty, point_value,
               image, body, text, source_number, source_page, bbox, section, capture_quality`,
        [
            examId,
            problemId,
            update.title,
            update.answerKind,
            update.answer,
            update.difficulty,
            update.pointValue,
            jsonParam(update.body),
            update.sourceNumber,
            update.sourcePage,
            jsonParam(update.bbox),
            update.section,
        ],
    );
    const [manifest] = composeExamManifests(
        [
            {
                id: examId,
                title: "",
                subtitle: "",
                time_limit_sec: 1,
                freeze_before_sec: 0,
                release_at: null,
                capture_summary: null,
            },
        ],
        result.rows,
    );
    return manifest?.problems[0] ?? null;
};

export { readExamAssetFromDatabase, saveExamAssetInDatabase } from "./examAssetDatabase.js";
