import express from "express";
import type { ExamManifest, RoomPublic } from "../shared/game.js";
import { createProblemFromRequest, updateProblemFromRequest } from "./adminProblemRequest.js";
import {
    createExamInDatabase,
    readAdminExamsFromDatabase,
    readExamAssetFromDatabase,
    saveExamAssetInDatabase,
    updateExamSettingsInDatabase,
    type ExamCatalogDatabase,
} from "./examDatabase.js";
import { assetUrlPath, isLikelySafeSvg, makeUploadedSvgPath, readString } from "./requestUtils.js";
import type { RoomState } from "./types.js";

export const registerAdminExamRoutes = ({
    app,
    getDb,
    hasAdminAccess,
    adminToken,
    refreshExamCatalog,
    getExamById,
    syncEventRoomsForExam,
    readEventRooms,
    withRoomMutation,
    getPersistedRoom,
    endRoom,
}: {
    app: express.Express;
    getDb: () => ExamCatalogDatabase | null;
    hasAdminAccess: (req: express.Request) => boolean;
    adminToken: string;
    refreshExamCatalog: () => Promise<void>;
    getExamById: (examId: string) => ExamManifest | undefined;
    syncEventRoomsForExam: (exam: ExamManifest) => Promise<unknown>;
    readEventRooms: (examId: string, statuses: RoomPublic["status"][]) => Promise<RoomState[]>;
    withRoomMutation: <T>(code: string, callback: () => Promise<T>) => Promise<T>;
    getPersistedRoom: (code: string) => Promise<RoomState | null>;
    endRoom: (room: RoomState, reason: string) => RoomPublic;
}) => {
    app.get("/api/admin/exams", async (req, res) => {
        if (!hasAdminAccess(req)) {
            res.sendStatus(adminToken ? 401 : 403);
            return;
        }
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }

        res.json(await readAdminExamsFromDatabase(db));
    });

    app.get("/api/admin/exams/:examId/assets/*assetPath", async (req, res) => {
        if (!hasAdminAccess(req)) {
            res.sendStatus(adminToken ? 401 : 403);
            return;
        }
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }

        const examId = readString(req.params.examId, 80);
        const assetPath = readString(
            (req.params as { assetPath?: string[] }).assetPath?.join("/") ?? "",
            240,
        );
        if (!examId || !assetPath || assetPath.includes("..")) {
            res.sendStatus(404);
            return;
        }

        const asset = await readExamAssetFromDatabase(db, examId, assetPath, false);
        if (!asset) {
            res.sendStatus(404);
            return;
        }

        res.set("Content-Type", asset.contentType);
        res.set("Cache-Control", "no-store");
        res.send(asset.body);
    });

    app.post(
        "/api/admin/exams/:examId/assets",
        express.raw({ type: ["image/svg+xml", "application/octet-stream"], limit: "1mb" }),
        async (req, res) => {
            if (!hasAdminAccess(req)) {
                res.sendStatus(adminToken ? 401 : 403);
                return;
            }
            const db = getDb();
            if (!db) {
                res.sendStatus(503);
                return;
            }

            const examId = readString(req.params.examId, 80);
            const fileName = readString(req.get("x-file-name") ?? "asset.svg", 120);
            const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
            if (
                !examId ||
                body.length === 0 ||
                body.length > 1024 * 1024 ||
                !isLikelySafeSvg(body)
            ) {
                res.status(400).json({ error: "Invalid SVG asset." });
                return;
            }

            const assetPath = makeUploadedSvgPath(fileName);
            const asset = await saveExamAssetInDatabase(db, {
                examId,
                path: assetPath,
                contentType: "image/svg+xml; charset=utf-8",
                body,
            });
            if (!asset) {
                res.sendStatus(404);
                return;
            }

            res.status(201).json({
                path: asset.path,
                src: `/api/admin/exams/${encodeURIComponent(examId)}/assets/${assetUrlPath(asset.path)}`,
            });
        },
    );

    // eslint-disable-next-line complexity
    app.post("/api/admin/exams", async (req, res) => {
        const db = requireAdminDb(req, res, { getDb, hasAdminAccess, adminToken });
        if (!db) return;
        const id = readString(req.body?.id, 80);
        const title = readString(req.body?.title, 120);
        const subtitle = readString(req.body?.subtitle, 160);
        const timeLimitSec = Number(req.body?.timeLimitSec);
        const freezeBeforeSec = Number(req.body?.freezeBeforeSec);
        const active = req.body?.active === true;
        const releaseAtRaw = req.body?.releaseAt;
        const releaseAt =
            typeof releaseAtRaw === "string" && releaseAtRaw.trim() ? releaseAtRaw.trim() : null;

        if (
            !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(id) ||
            !title ||
            !subtitle ||
            !Number.isInteger(timeLimitSec) ||
            timeLimitSec < 60 ||
            timeLimitSec > 24 * 60 * 60 ||
            !Number.isInteger(freezeBeforeSec) ||
            freezeBeforeSec < 0 ||
            freezeBeforeSec > timeLimitSec
        ) {
            res.status(400).json({ error: "Invalid exam payload." });
            return;
        }
        if (releaseAt && Number.isNaN(Date.parse(releaseAt))) {
            res.status(400).json({ error: "Invalid release date." });
            return;
        }

        try {
            const exam = await createExamInDatabase(db, {
                id,
                title,
                subtitle,
                timeLimitSec,
                freezeBeforeSec,
                active,
                releaseAt,
            });
            await refreshExamCatalog();
            res.status(201).json(exam);
        } catch (error) {
            const code =
                typeof error === "object" && error && "code" in error
                    ? String((error as { code?: unknown }).code)
                    : "";
            if (code === "23505") {
                res.status(409).json({ error: "Exam id already exists." });
                return;
            }
            throw error;
        }
    });

    // eslint-disable-next-line complexity
    app.patch("/api/admin/exams/:examId", async (req, res) => {
        const db = requireAdminDb(req, res, { getDb, hasAdminAccess, adminToken });
        if (!db) return;
        const examId = readString(req.params.examId, 80);
        const title = readString(req.body?.title, 120);
        const subtitle = readString(req.body?.subtitle, 160);
        const timeLimitSec = Number(req.body?.timeLimitSec);
        const freezeBeforeSec = Number(req.body?.freezeBeforeSec);
        const active = req.body?.active === true;
        const releaseAtRaw = req.body?.releaseAt;
        const releaseAt =
            typeof releaseAtRaw === "string" && releaseAtRaw.trim() ? releaseAtRaw.trim() : null;

        if (
            !examId ||
            !title ||
            !subtitle ||
            !Number.isInteger(timeLimitSec) ||
            timeLimitSec < 60 ||
            timeLimitSec > 24 * 60 * 60 ||
            !Number.isInteger(freezeBeforeSec) ||
            freezeBeforeSec < 0 ||
            freezeBeforeSec > timeLimitSec
        ) {
            res.status(400).json({ error: "Invalid exam settings payload." });
            return;
        }
        if (releaseAt && Number.isNaN(Date.parse(releaseAt))) {
            res.status(400).json({ error: "Invalid release date." });
            return;
        }

        const exam = await updateExamSettingsInDatabase(db, examId, {
            title,
            subtitle,
            timeLimitSec,
            freezeBeforeSec,
            active,
            releaseAt,
        });
        if (!exam) {
            res.sendStatus(404);
            return;
        }

        await refreshExamCatalog();
        const updatedExam = getExamById(examId);
        if (updatedExam) await syncEventRoomsForExam(updatedExam);
        const refreshed =
            (await readAdminExamsFromDatabase(db)).find((candidate) => candidate.id === exam.id) ??
            exam;
        res.json(refreshed);
    });

    app.post("/api/admin/events/:eventId/end", async (req, res) => {
        const db = requireAdminDb(req, res, { getDb, hasAdminAccess, adminToken });
        if (!db) return;
        const eventId = readString(req.params.eventId, 80);
        const exam = getExamById(eventId);
        if (!eventId || !exam) {
            res.sendStatus(404);
            return;
        }

        const activeEventRooms = await readEventRooms(eventId, ["lobby", "playing"]);
        const snapshots: RoomPublic[] = [];
        for (const activeRoom of activeEventRooms) {
            await withRoomMutation(activeRoom.code, async () => {
                const room = await getPersistedRoom(activeRoom.code);
                if (!room || room.eventId !== eventId || room.status === "finished") return;
                room.exam = exam;
                const snapshot = endRoom(room, "운영자가 대회를 종료했습니다.");
                snapshots.push(snapshot);
            });
        }

        res.json({ eventId, endedRooms: snapshots.length, rooms: snapshots });
    });

    app.post("/api/admin/exams/:examId/problems", async (req, res) => {
        const db = requireAdminDb(req, res, { getDb, hasAdminAccess, adminToken });
        if (!db) return;
        const examId = readString(req.params.examId, 80);
        const problem = await createProblemFromRequest(db, examId, req.body);
        if (problem === "bad-payload") {
            res.status(400).json({ error: "Invalid problem payload." });
            return;
        }
        if (problem === "bad-point") {
            res.status(400).json({ error: "Invalid point value." });
            return;
        }
        if (!problem) {
            res.sendStatus(404);
            return;
        }
        await refreshExamCatalog();
        res.status(201).json(problem);
    });

    app.patch("/api/admin/exams/:examId/problems/:problemId", async (req, res) => {
        const db = requireAdminDb(req, res, { getDb, hasAdminAccess, adminToken });
        if (!db) return;
        const examId = readString(req.params.examId, 80);
        const problemId = readString(req.params.problemId, 80);
        const problem = await updateProblemFromRequest(db, examId, problemId, req.body);
        if (problem === "bad-payload") {
            res.status(400).json({ error: "Invalid problem payload." });
            return;
        }
        if (problem === "bad-point") {
            res.status(400).json({ error: "Invalid point value." });
            return;
        }
        if (!problem) {
            res.sendStatus(404);
            return;
        }
        await refreshExamCatalog();
        res.json(problem);
    });
};

const requireAdminDb = (
    req: express.Request,
    res: express.Response,
    {
        getDb,
        hasAdminAccess,
        adminToken,
    }: {
        getDb: () => ExamCatalogDatabase | null;
        hasAdminAccess: (req: express.Request) => boolean;
        adminToken: string;
    },
) => {
    if (!hasAdminAccess(req)) {
        res.sendStatus(adminToken ? 401 : 403);
        return null;
    }
    const db = getDb();
    if (!db) {
        res.sendStatus(503);
        return null;
    }
    return db;
};
