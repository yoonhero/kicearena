import type { ExamAsset, ExamAssetInput, ExamCatalogDatabase } from "./examDatabaseTypes.js";

export const saveExamAssetInDatabase = async (
    db: ExamCatalogDatabase,
    asset: ExamAssetInput,
): Promise<ExamAsset | null> => {
    const result = await db.query<{
        exam_id: string;
        path: string;
        content_type: string;
        body: Buffer;
        updated_at: Date;
    }>(
        `INSERT INTO exam_assets (exam_id, path, content_type, body, updated_at)
     SELECT $1, $2, $3, $4, now()
     WHERE EXISTS (SELECT 1 FROM exams WHERE id = $1)
     ON CONFLICT (exam_id, path) DO UPDATE SET
       content_type = EXCLUDED.content_type,
       body = EXCLUDED.body,
       updated_at = now()
     RETURNING exam_id, path, content_type, body, updated_at`,
        [asset.examId, asset.path, asset.contentType, asset.body],
    );
    const row = result.rows[0];
    return row
        ? {
              examId: row.exam_id,
              path: row.path,
              contentType: row.content_type,
              body: row.body,
              updatedAt: row.updated_at,
          }
        : null;
};

export const readExamAssetFromDatabase = async (
    db: ExamCatalogDatabase,
    examId: string,
    assetPath: string,
    requireActive = true,
): Promise<ExamAsset | null> => {
    const result = await db.query<{
        exam_id: string;
        path: string;
        content_type: string;
        body: Buffer;
        updated_at: Date;
    }>(
        `SELECT asset.exam_id, asset.path, asset.content_type, asset.body, asset.updated_at
     FROM exam_assets asset
     JOIN exams exam ON exam.id = asset.exam_id
     WHERE asset.exam_id = $1 AND asset.path = $2 AND ($3::boolean = false OR exam.active = true)`,
        [examId, assetPath, requireActive],
    );
    const row = result.rows[0];
    return row
        ? {
              examId: row.exam_id,
              path: row.path,
              contentType: row.content_type,
              body: row.body,
              updatedAt: row.updated_at,
          }
        : null;
};
