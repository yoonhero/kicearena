import express from "express";
import path from "node:path";
import type { ExamManifest } from "../shared/game.js";
import { checkDatabaseHealth, type DatabaseHealth } from "./databaseHealth.js";
import type { ExamCatalogDatabase } from "./examDatabase.js";
import { readExamAssetFromDatabase } from "./examDatabase.js";
import { isExamReleased, toExamPublic, toExamSummary, toGymEventSummary } from "./exams.js";
import { apiNotFound } from "./notFound.js";
import { isPrivateNetworkAddress, readString } from "./requestUtils.js";
import { getPublicOrigin, renderRobotsTxt, renderSiteManifest, renderSitemapXml } from "./seo.js";
import type { createServerMetrics } from "./serverMetrics.js";
import type { RoomState } from "./types.js";

export const registerPublicRoutes = ({
    app,
    rootDir,
    getDb,
    getExams,
    getExamById,
    getPersistedRoom,
    getRooms,
    metricsBearerToken,
    hasValidMetricsBearerToken,
    serverMetrics,
    connectedSocketCount,
    registeredSocketCount,
    roomTtl,
}: {
    app: express.Express;
    rootDir: string;
    getDb: () => ExamCatalogDatabase | null;
    getExams: () => ExamManifest[];
    getExamById: (examId: string) => ExamManifest | undefined;
    getPersistedRoom: (code: string) => Promise<RoomState | null>;
    getRooms: () => RoomState[];
    metricsBearerToken: string;
    hasValidMetricsBearerToken: (authorization: string | undefined) => boolean;
    serverMetrics: ReturnType<typeof createServerMetrics>;
    connectedSocketCount: () => number;
    registeredSocketCount: () => number;
    roomTtl: Parameters<
        ReturnType<typeof createServerMetrics>["updateRuntimeMetrics"]
    >[0]["roomTtl"];
}) => {
    app.get("/api/exams/:examId/assets/*assetPath", async (req, res) => {
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        const exam = getExamById(readString(req.params.examId, 80));
        const assetPath = readString(
            (req.params as { assetPath?: string[] }).assetPath?.join("/") ?? "",
            240,
        );
        if (!exam || !assetPath || assetPath.includes("..")) {
            res.sendStatus(404);
            return;
        }

        const asset = await readExamAssetFromDatabase(db, exam.id, assetPath);
        if (!asset) {
            res.sendStatus(404);
            return;
        }

        res.set("Content-Type", asset.contentType);
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        res.send(asset.body);
    });

    app.get("/api/health", async (_req, res) => {
        const database = await checkDatabaseHealth(getDb());
        const publicDatabase: DatabaseHealth = database.ok
            ? database
            : { ok: false, reason: database.reason };
        const body = {
            ok: database.ok,
            exams: getExams().length,
            problemStorage: "postgres",
            database: publicDatabase,
        };
        if (!database.ok) {
            res.status(503).json(body);
            return;
        }
        res.json(body);
    });

    app.get("/metrics", async (req, res) => {
        if (!isPrivateNetworkAddress(req.socket.remoteAddress)) {
            res.sendStatus(404);
            return;
        }
        if (!metricsBearerToken) {
            res.status(503).send("Metrics bearer token is not configured.");
            return;
        }
        if (!hasValidMetricsBearerToken(req.get("authorization"))) {
            res.sendStatus(401);
            return;
        }

        serverMetrics.updateRuntimeMetrics({
            rooms: getRooms(),
            connectedSocketCount: connectedSocketCount(),
            registeredSocketCount: registeredSocketCount(),
            roomTtl,
        });
        res.set("Content-Type", serverMetrics.registry.contentType);
        res.end(await serverMetrics.registry.metrics());
    });

    app.get("/api/exams", (_req, res) => {
        res.json(
            getExams()
                .filter((exam) => isExamReleased(exam))
                .map(toExamSummary),
        );
    });

    app.get("/api/events", (_req, res) => {
        res.json(getExams().map((exam) => toGymEventSummary(exam)));
    });

    app.get("/api/events/:eventId/problems", (req, res) => {
        const exam = getExamById(readString(req.params.eventId, 80));
        if (!exam) {
            res.sendStatus(404);
            return;
        }
        if (!isExamReleased(exam)) {
            res.status(403).json({ error: "아직 문제를 공개하지 않은 이벤트입니다." });
            return;
        }
        res.json(toExamPublic(exam));
    });

    app.get("/api/rooms/:code", async (req, res) => {
        const room = await getPersistedRoom(readString(req.params.code, 8).toUpperCase());
        if (!room) {
            res.json({ exists: false });
            return;
        }
        res.json({
            exists: true,
            status: room.status,
            playerCount: room.players.size,
            connectedPlayerCount: [...room.players.values()].filter((player) => player.connected)
                .length,
        });
    });

    app.get("/robots.txt", (req, res) => {
        res.type("text/plain").send(renderRobotsTxt(getPublicOrigin(req.headers)));
    });
    app.get("/sitemap.xml", (req, res) => {
        res.type("application/xml").send(renderSitemapXml(getPublicOrigin(req.headers)));
    });
    app.get("/site.webmanifest", (req, res) => {
        res.type("application/manifest+json").json(
            renderSiteManifest(getPublicOrigin(req.headers)),
        );
    });

    app.use("/api", apiNotFound);

    if (process.env.NODE_ENV === "production") {
        const clientDir = path.join(rootDir, "dist/client");
        app.use(express.static(clientDir));
        app.use((req, res, next) => {
            if (req.method !== "GET") {
                next();
                return;
            }
            res.sendFile(path.join(clientDir, "index.html"));
        });
    }
};
