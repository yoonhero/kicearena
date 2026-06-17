import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isProblemBody, type ExamManifest } from "../shared/game.js";
import {
    composeExamManifests,
    createExamInDatabase,
    type ExamCatalogDatabase,
    migrateExamCatalog,
    readAdminExamsFromDatabase,
    readExamAssetFromDatabase,
    readExamsFromDatabase,
    saveExamAssetInDatabase,
    seedExamCatalog,
    updateExamSettingsInDatabase,
    updateProblemInDatabase,
} from "./examDatabase.js";

const exam: ExamManifest = {
    id: "db-exam",
    title: "DB Exam",
    subtitle: "Storage test",
    timeLimitSec: 1800,
    captureSummary: {
        mode: "problem-bbox",
        problemCount: 2,
        averageScore: 100,
        warningCount: 0,
        unusableProblems: [],
    },
    problems: [
        {
            id: "db-p1",
            number: 1,
            title: "Stored Problem 1",
            answerKind: "choice",
            answer: "3",
            difficulty: 2,
            pointValue: 3,
            image: "001.png",
            sourceNumber: 1,
            sourcePage: 2,
            bbox: [10, 20, 100, 160],
            captureQuality: { score: 100, usable: true, warnings: [] },
        },
        {
            id: "db-p2",
            number: 2,
            title: "Stored Problem 2",
            answerKind: "short",
            answer: "42",
            difficulty: 5,
            pointValue: 4,
            body: [{ kind: "paragraph", text: "{}의 값은?", inlineMath: ["6\\times7"] }],
        },
    ],
};

describe("exam database row mapping", () => {
    it("reconstructs manifests from database rows without null-only optional fields", () => {
        const [manifest] = composeExamManifests(
            [
                {
                    id: "row-exam",
                    title: "Row Exam",
                    subtitle: "Rows",
                    time_limit_sec: 600,
                    release_at: new Date("2026-06-06T00:00:00.000Z"),
                    capture_summary: null,
                },
            ],
            [
                {
                    exam_id: "row-exam",
                    id: "row-p1",
                    number: 1,
                    title: "Row Problem",
                    answer_kind: "choice",
                    answer: "1",
                    difficulty: 1,
                    point_value: null,
                    image: null,
                    body: null,
                    text: null,
                    source_number: null,
                    source_page: null,
                    bbox: null,
                    section: null,
                    capture_quality: null,
                },
            ],
        );

        expect(manifest).toEqual({
            id: "row-exam",
            title: "Row Exam",
            subtitle: "Rows",
            timeLimitSec: 600,
            releaseAt: "2026-06-06T00:00:00.000Z",
            captureSummary: undefined,
            problems: [
                {
                    id: "row-p1",
                    number: 1,
                    title: "Row Problem",
                    answerKind: "choice",
                    answer: "1",
                    difficulty: 1,
                    pointValue: undefined,
                    image: undefined,
                    body: undefined,
                    text: undefined,
                    sourceNumber: undefined,
                    sourcePage: undefined,
                    bbox: undefined,
                    section: undefined,
                    captureQuality: undefined,
                },
            ],
        });
    });

    it("saves admin uploaded assets with an exam existence guard", async () => {
        const queries: { text: string; values?: unknown[] }[] = [];
        const body = Buffer.from('<svg><circle cx="1" cy="1" r="1" /></svg>');
        const fakeDb: ExamCatalogDatabase = {
            query: async <T extends object>(text: string, values?: unknown[]) => {
                queries.push({ text, values });
                return {
                    command: "INSERT",
                    rowCount: 1,
                    oid: 0,
                    fields: [],
                    rows: [
                        {
                            exam_id: values?.[0],
                            path: values?.[1],
                            content_type: values?.[2],
                            body: values?.[3],
                            updated_at: new Date("2026-06-06T00:00:00.000Z"),
                        } as T,
                    ],
                };
            },
        };

        await expect(
            saveExamAssetInDatabase(fakeDb, {
                examId: "db-exam",
                path: "diagrams/uploaded.svg",
                contentType: "image/svg+xml; charset=utf-8",
                body,
            }),
        ).resolves.toMatchObject({
            examId: "db-exam",
            path: "diagrams/uploaded.svg",
            contentType: "image/svg+xml; charset=utf-8",
            body,
        });
        expect(queries[0]?.text).toContain("WHERE EXISTS (SELECT 1 FROM exams WHERE id = $1)");
        expect(queries[0]?.values).toEqual([
            "db-exam",
            "diagrams/uploaded.svg",
            "image/svg+xml; charset=utf-8",
            body,
        ]);
    });

    it("persists admin contest start times in exam settings", async () => {
        const queries: { text: string; values?: unknown[] }[] = [];
        const fakeDb: ExamCatalogDatabase = {
            query: async <T extends object>(text: string, values?: unknown[]) => {
                queries.push({ text, values });
                const isInsert = queries.length === 1;
                return {
                    command: isInsert ? "INSERT" : "UPDATE",
                    rowCount: 1,
                    oid: 0,
                    fields: [],
                    rows: [
                        {
                            id: values?.[0],
                            title: values?.[1],
                            subtitle: values?.[2],
                            time_limit_sec: values?.[3],
                            release_at: values?.[5],
                            capture_summary: null,
                            active: values?.[4],
                        } as T,
                    ],
                };
            },
        };

        await createExamInDatabase(fakeDb, {
            id: "contest-day",
            title: "Contest Day",
            subtitle: "Admin",
            timeLimitSec: 6000,
            active: true,
            releaseAt: "2026-06-20T01:00:00.000Z",
        });
        await updateExamSettingsInDatabase(fakeDb, "contest-day", {
            title: "Contest Day",
            subtitle: "Admin",
            timeLimitSec: 7200,
            active: true,
            releaseAt: "2026-06-21T01:00:00.000Z",
        });

        expect(queries[0]?.text).toContain("release_at");
        expect(queries[0]?.values?.[5]).toBe("2026-06-20T01:00:00.000Z");
        expect(queries[1]?.values?.[4]).toBe(true);
        expect(queries[1]?.values?.[5]).toBe("2026-06-21T01:00:00.000Z");
    });
});

const dbTestUrl = process.env.KICE_DB_TEST_URL?.trim();
const describePostgres = dbTestUrl ? describe : describe.skip;

describePostgres("postgres exam catalog storage", () => {
    let adminPool: Pool;
    let pool: Pool;
    let schemaName: string;

    beforeAll(async () => {
        schemaName = `kice_test_${randomUUID().replaceAll("-", "_")}`;
        adminPool = new Pool({ connectionString: dbTestUrl! });
        await adminPool.query(`CREATE SCHEMA ${schemaName}`);
        pool = new Pool({ connectionString: dbTestUrl!, options: `-c search_path=${schemaName}` });
    });

    afterAll(async () => {
        await pool?.end();
        if (adminPool && schemaName) {
            await adminPool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
            await adminPool.end();
        }
    });

    it("migrates, seeds, reads only active exam problems, and removes stale problems", async () => {
        await migrateExamCatalog(pool);
        await seedExamCatalog(
            pool,
            [exam, { ...exam, id: "inactive-exam", title: "Inactive" }],
            new Set(["db-exam"]),
            [
                {
                    examId: "db-exam",
                    path: "diagrams/graph.svg",
                    contentType: "image/svg+xml; charset=utf-8",
                    body: Buffer.from('<svg><path d="M0 0" /></svg>'),
                },
            ],
        );

        const initial = await readExamsFromDatabase(pool);
        const adminInitial = await readAdminExamsFromDatabase(pool);
        expect(initial).toHaveLength(1);
        expect(adminInitial).toHaveLength(2);
        expect(adminInitial.find((candidate) => candidate.id === "inactive-exam")).toMatchObject({
            active: false,
        });
        expect(initial[0]).toMatchObject({
            id: "db-exam",
            title: "DB Exam",
            captureSummary: { mode: "problem-bbox", problemCount: 2 },
            problems: [
                {
                    id: "db-p1",
                    answer: "3",
                    image: "001.png",
                    bbox: [10, 20, 100, 160],
                    captureQuality: { score: 100, usable: true, warnings: [] },
                },
                {
                    id: "db-p2",
                    answerKind: "short",
                    body: [{ kind: "paragraph", text: "{}의 값은?", inlineMath: ["6\\times7"] }],
                },
            ],
        });
        await expect(
            readExamAssetFromDatabase(pool, "db-exam", "diagrams/graph.svg"),
        ).resolves.toMatchObject({
            examId: "db-exam",
            path: "diagrams/graph.svg",
            contentType: "image/svg+xml; charset=utf-8",
            body: Buffer.from('<svg><path d="M0 0" /></svg>'),
        });
        await expect(
            readExamAssetFromDatabase(pool, "inactive-exam", "diagrams/graph.svg"),
        ).resolves.toBeNull();
        await expect(
            saveExamAssetInDatabase(pool, {
                examId: "inactive-exam",
                path: "diagrams/admin-only.svg",
                contentType: "image/svg+xml; charset=utf-8",
                body: Buffer.from('<svg><path d="M1 1" /></svg>'),
            }),
        ).resolves.toMatchObject({ examId: "inactive-exam", path: "diagrams/admin-only.svg" });
        await expect(
            readExamAssetFromDatabase(pool, "inactive-exam", "diagrams/admin-only.svg"),
        ).resolves.toBeNull();
        await expect(
            readExamAssetFromDatabase(pool, "inactive-exam", "diagrams/admin-only.svg", false),
        ).resolves.toMatchObject({
            examId: "inactive-exam",
            path: "diagrams/admin-only.svg",
        });

        await expect(
            updateProblemInDatabase(pool, "db-exam", "db-p2", {
                title: "Admin Updated",
                answerKind: "short",
                answer: "43",
                difficulty: 4,
                pointValue: 5,
                body: [{ kind: "note", text: "관리자 수정" }],
            }),
        ).resolves.toMatchObject({
            id: "db-p2",
            title: "Admin Updated",
            answer: "43",
            difficulty: 4,
            pointValue: 5,
            body: [{ kind: "note", text: "관리자 수정" }],
        });

        expect(isProblemBody([{ kind: "paragraph" }])).toBe(false);

        await seedExamCatalog(
            pool,
            [{ ...exam, problems: [{ ...exam.problems[0], title: "Updated Problem" }] }],
            new Set(["db-exam"]),
        );

        const updated = await readExamsFromDatabase(pool);
        expect(updated[0].problems).toHaveLength(1);
        expect(updated[0].problems[0]).toMatchObject({ id: "db-p1", title: "Updated Problem" });
        await expect(
            readExamAssetFromDatabase(pool, "db-exam", "diagrams/graph.svg"),
        ).resolves.toBeNull();
    });
});
