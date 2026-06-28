import express from "express";
import type { Server } from "socket.io";
import type { ExamManifest, RoomPublic } from "../shared/game.js";
import { registerAdminCampaignRoutes } from "./adminCampaignRoutes.js";
import { registerAdminExamRoutes } from "./adminExamRoutes.js";
import { registerCampaignRoutes } from "./campaignRoutes.js";
import type { createExamCatalogPool } from "./examDatabase.js";
import { readExamsFromDatabase } from "./examDatabase.js";
import type { HttpRateLimitStore } from "./httpRateLimit.js";
import { registerPublicRoutes } from "./publicRoutes.js";
import { createServerMetrics } from "./serverMetrics.js";
import type { RoomState } from "./types.js";

type RouteRegistrationOptions = {
    app: express.Express;
    io: Server;
    rootDir: string;
    adminToken: string;
    metricsBearerToken: string;
    campaignAuthSecret: string;
    campaignAuthCookieName: string;
    campaignAuthCookieMaxAgeSec: number;
    campaignLocationRadiusKm: number;
    httpRateLimitStore: HttpRateLimitStore;
    roomTtl: {
        emptyLobbyMs: number;
        disconnectedLobbyMs: number;
        finishedMs: number;
    };
    serverMetrics: ReturnType<typeof createServerMetrics>;
    getDb: () => ReturnType<typeof createExamCatalogPool> | null;
    getExams: () => ExamManifest[];
    replaceExams: (exams: ExamManifest[]) => void;
    getExamById: (examId: string) => ExamManifest | undefined;
    getPersistedRoom: (code: string) => Promise<RoomState | null>;
    getRooms: () => RoomState[];
    socketToPlayerCount: () => number;
    hasAdminAccess: (req: express.Request) => boolean;
    hasValidMetricsBearerToken: (authorization: string | undefined) => boolean;
    syncEventRoomsForExam: (exam: ExamManifest) => Promise<unknown[]>;
    readEventRooms: (
        examId: string,
        statuses: Array<"lobby" | "playing" | "finished">,
    ) => Promise<RoomState[]>;
    withRoomMutation: <T>(code: string, callback: () => Promise<T>) => Promise<T>;
    endRoom: (room: RoomState, reason: string) => RoomPublic;
};

export const registerHttpRoutes = (options: RouteRegistrationOptions) => {
    options.app.use((req, res, next) => {
        const endTimer = options.serverMetrics.httpRequestDurationSeconds.startTimer({
            method: req.method,
            path: req.path,
        });
        res.on("finish", () => {
            endTimer({ status: String(res.statusCode) });
        });
        next();
    });

    options.app.use(express.json({ limit: "256kb" }));

    registerPublicRoutes({
        app: options.app,
        rootDir: options.rootDir,
        getDb: options.getDb,
        getExams: options.getExams,
        getExamById: options.getExamById,
        getPersistedRoom: options.getPersistedRoom,
        getRooms: options.getRooms,
        metricsBearerToken: options.metricsBearerToken,
        hasValidMetricsBearerToken: options.hasValidMetricsBearerToken,
        serverMetrics: options.serverMetrics,
        connectedSocketCount: () => options.io.engine.clientsCount,
        registeredSocketCount: options.socketToPlayerCount,
        roomTtl: options.roomTtl,
    });

    registerCampaignRoutes({
        app: options.app,
        getDb: options.getDb,
        campaignAuthSecret: options.campaignAuthSecret,
        campaignAuthCookieName: options.campaignAuthCookieName,
        campaignAuthCookieMaxAgeSec: options.campaignAuthCookieMaxAgeSec,
        campaignLocationRadiusKm: options.campaignLocationRadiusKm,
        httpRateLimitStore: options.httpRateLimitStore,
    });

    registerAdminCampaignRoutes({
        app: options.app,
        getDb: options.getDb,
        hasAdminAccess: options.hasAdminAccess,
        adminToken: options.adminToken,
    });

    registerAdminExamRoutes({
        app: options.app,
        getDb: options.getDb,
        hasAdminAccess: options.hasAdminAccess,
        adminToken: options.adminToken,
        refreshExamCatalog: async () => {
            const db = options.getDb();
            if (!db) return;
            options.replaceExams(await readExamsFromDatabase(db));
        },
        getExamById: options.getExamById,
        syncEventRoomsForExam: options.syncEventRoomsForExam,
        readEventRooms: options.readEventRooms,
        withRoomMutation: options.withRoomMutation,
        getPersistedRoom: options.getPersistedRoom,
        endRoom: options.endRoom,
    });
};
