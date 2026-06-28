import express from "express";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ExamManifest, type ProblemManifest, ROOM_GUARDRAILS } from "../shared/game.js";
import { createAccessChecks } from "./accessChecks.js";
import {
    itemEnabledForRoomMode,
    maxPlayersForRoomMode,
    normalizeRoomMode,
} from "../shared/roomConfig.js";
import {
    migrateCampaign,
    seedDefaultHighSchools,
    syncReferralWhitelist,
} from "./campaignDatabase.js";
import {
    createExamCatalogPool,
    migrateExamCatalog,
    readExamsFromDatabase,
} from "./examDatabase.js";
import { KeyedMutex } from "./keyedMutex.js";
import { shouldRateLimit as shouldRateLimitEvent } from "./rateLimit.js";
import type { HttpRateLimitStore } from "./httpRateLimit.js";
import { migrateRoomState, readRoomStates } from "./roomDatabase.js";
import { createRoomCodeFactory } from "./roomCodeFactory.js";
import { createRoomMaintenance } from "./roomMaintenance.js";
import { registerHttpRoutes } from "./routeRegistration.js";
import { campaignAuthSecret, rateLimitMs, roomTtl, serverConfig } from "./serverConfig.js";
import {
    configureSocketAdapter,
    shutdownServer,
    startServer,
    type RedisSocketClients,
} from "./serverLifecycle.js";
import { createServerMetrics } from "./serverMetrics.js";
import { createRoomStore } from "./roomStore.js";
import { createRoomRuntime } from "./roomRuntime.js";
import { createRoomOperations } from "./roomOperations.js";
import { registerAnswerSocketHandler } from "./socketAnswerHandler.js";
import { registerEventEntryHandlers } from "./socketEventEntryHandlers.js";
import { registerItemHandlers } from "./socketItemHandlers.js";
import type { SocketHandlerContext } from "./socketHandlerContext.js";
import {
    createSocketPresence,
    type RoomSocketCleanupPayload,
    type SocketPlayerRef,
    type SocketSpectatorRef,
} from "./socketPresence.js";
import { registerRoomEntryHandlers } from "./socketRoomEntryHandlers.js";
import { registerRoomControlHandlers } from "./socketRoomControlHandlers.js";
import { registerRoomExitHandlers } from "./socketRoomExitHandlers.js";
import type { PlayerState, RoomState } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const app = express();
app.disable("x-powered-by");
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? serverConfig.allowedOrigins : true,
        credentials: true,
    },
    maxHttpBufferSize: 8 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
});

const rooms = new Map<string, RoomState>();
const socketToPlayer = new Map<string, SocketPlayerRef>();
const socketToSpectator = new Map<string, SocketSpectatorRef>();
const socketEventTimestamps = new Map<string, Map<string, number>>();
const httpRateLimitStore: HttpRateLimitStore = new Map();
const remotePresenceFetchedAt = new Map<string, number>();
const EXPIRED_EFFECT_NOTICE_MS = 3000;
const serverMetrics = createServerMetrics();

const { hasAdminAccess, hasValidMetricsBearerToken } = createAccessChecks({
    metricsBearerToken: serverConfig.metricsBearerToken,
    adminToken: serverConfig.adminToken,
});

const REMOTE_PRESENCE_FETCH_INTERVAL_MS = 1000;

let exams: ExamManifest[] = [];
let examById = new Map<string, ExamManifest>();
let examCatalogPool: ReturnType<typeof createExamCatalogPool> | null = null;
let redisClients: RedisSocketClients | null = null;
const contestSubmitMutex = new KeyedMutex();
const pendingRoomBroadcasts = new Map<string, ReturnType<typeof setTimeout>>();
const socketPresence = createSocketPresence({
    io,
    rooms,
    socketToPlayer,
    socketToSpectator,
    remotePresenceFetchedAt,
    getRedisClients: () => redisClients,
    remotePresenceFetchIntervalMs: REMOTE_PRESENCE_FETCH_INTERVAL_MS,
});
const {
    applySocketPresence,
    cleanupLocalRoomSockets,
    cleanupRoomSocketsAcrossCluster,
    clearLocalSocketPlayer,
    clearLocalSocketSpectator,
    getSocketPlayerRef,
    setSocketPlayer,
    setSocketSpectator,
} = socketPresence;
const roomStore = createRoomStore({
    rooms,
    getPool: () => examCatalogPool,
    getExamById: () => examById,
    applySocketPresence,
});
const {
    activeRoomCount,
    afterRoomCommit,
    findLatestEventRoom,
    findReusableEventRoom,
    getPersistedRoom,
    persistRoom,
    readEventRooms,
    roomDatabase,
    withRoomMutation,
} = roomStore;

const refreshExamCatalog = async () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
        throw new Error(
            "DATABASE_URL is required. Seed the exam catalog with `npm run db:seed` before starting the server.",
        );
    }

    examCatalogPool = createExamCatalogPool(databaseUrl);
    await migrateExamCatalog(examCatalogPool);
    await migrateRoomState(examCatalogPool);
    await migrateCampaign(examCatalogPool);
    await seedDefaultHighSchools(examCatalogPool);
    await syncReferralWhitelist(examCatalogPool, serverConfig.referralWhitelist);
    exams = await readExamsFromDatabase(examCatalogPool);
    examById = new Map(exams.map((exam) => [exam.id, exam]));
};

const restoreRoomsFromDatabase = async () => {
    if (!examCatalogPool) return;
    const restoredRooms = await readRoomStates(examCatalogPool, examById);
    for (const room of restoredRooms) rooms.set(room.code, await applySocketPresence(room));
    if (restoredRooms.length > 0) {
        console.log(`Restored ${restoredRooms.length} persisted rooms from Postgres.`);
    }
};

const getProblem = (room: RoomState, problemId: string): ProblemManifest | undefined =>
    room.exam.problems.find((problem) => problem.id === problemId);

const { makeAvailableCode } = createRoomCodeFactory({
    rooms,
    getPool: () => examCatalogPool,
    getExamById: () => examById,
});

const makeId = () => Math.random().toString(36).slice(2, 10);
const makeSocketToken = () => crypto.randomUUID();
const makeSubmissionId = () => crypto.randomUUID();

const isCurrentPlayerSocket = (
    player: PlayerState | undefined,
    ref: SocketPlayerRef | undefined,
): player is PlayerState =>
    Boolean(player && ref && player.socketToken && player.socketToken === ref.socketToken);

const clampNumber = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

const readPositiveSeconds = (value: unknown, fallback: number, min: number, max: number) => {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return Math.round(clampNumber(fallback, min, max));
    return Math.round(clampNumber(numeric, min, max));
};

io.on("room:socket-cleanup", (payload: RoomSocketCleanupPayload) => {
    cleanupLocalRoomSockets(payload);
});

const replyAfterRoomCommit = <TResponse>(
    reply: ((response: TResponse) => void) | undefined,
    response: TResponse,
) => {
    if (!reply) return;
    afterRoomCommit(() => reply(response));
};

const {
    addLog,
    closeLobbyRoom,
    closeRoomIfNoConnectedPlayers,
    deleteRoom,
    removePlayerFromRoom,
    touchRoom,
} = createRoomOperations({
    io,
    rooms,
    remotePresenceFetchedAt,
    roomStore,
    clearLocalSocketPlayer,
    cleanupRoomSocketsAcrossCluster,
    makeId,
});

const roomRuntime = createRoomRuntime({
    io,
    pendingRoomBroadcasts,
    expiredEffectNoticeMs: EXPIRED_EFFECT_NOTICE_MS,
    spectatorCount: (roomCode) =>
        [...socketToSpectator.values()].filter((ref) => ref.roomCode === roomCode).length,
    addLog,
    touchRoom,
    persistRoom,
    afterRoomCommit,
    readEventRooms,
    withRoomMutation,
    getPersistedRoom,
});
const {
    emitRoom,
    emitRoomAfterCommit,
    endRoom,
    finishRoom,
    isFinished,
    maybeFreezeScoreboard,
    maybeStartReleasedEventRoom,
    publicRoom,
    syncEventRoomsForExam,
} = roomRuntime;

const shouldRateLimit = (socketId: string, eventName: string, minIntervalMs: number) => {
    return shouldRateLimitEvent(socketEventTimestamps, socketId, eventName, minIntervalMs);
};

const { runRoomMaintenance } = createRoomMaintenance({
    rooms,
    getPool: () => examCatalogPool,
    withRoomMutation,
    getPersistedRoom,
    expiredEffectNoticeMs: EXPIRED_EFFECT_NOTICE_MS,
    roomTtl,
    maybeStartReleasedEventRoom,
    isFinished,
    finishRoom,
    maybeFreezeScoreboard,
    emitRoom,
    deleteRoom,
});

setInterval(() => {
    void runRoomMaintenance().catch((error) => {
        console.error("Room maintenance failed.", error);
    });
}, 1000);

registerHttpRoutes({
    app,
    io,
    rootDir,
    adminToken: serverConfig.adminToken,
    metricsBearerToken: serverConfig.metricsBearerToken,
    campaignAuthSecret,
    campaignAuthCookieName: serverConfig.campaignAuthCookieName,
    campaignAuthCookieMaxAgeSec: serverConfig.campaignAuthCookieMaxAgeSec,
    campaignLocationRadiusKm: serverConfig.campaignLocationRadiusKm,
    httpRateLimitStore,
    roomTtl,
    serverMetrics,
    getDb: () => examCatalogPool,
    getExams: () => exams,
    replaceExams: (updatedExams) => {
        exams = updatedExams;
        examById = new Map(updatedExams.map((candidate) => [candidate.id, candidate]));
    },
    getExamById: (examId: string) => examById.get(examId),
    hasValidMetricsBearerToken,
    hasAdminAccess,
    getPersistedRoom,
    getRooms: () => [...rooms.values()],
    socketToPlayerCount: () => socketToPlayer.size,
    syncEventRoomsForExam,
    readEventRooms,
    withRoomMutation,
    endRoom,
});

const socketHandlerContext: SocketHandlerContext = {
    io,
    rooms,
    socketToPlayer,
    socketToSpectator,
    serverMetrics,
    getExamById: () => examById,
    getExamCatalogPool: () => examCatalogPool,
    campaignAuthCookieName: serverConfig.campaignAuthCookieName,
    campaignAuthSecret,
    activeRoomCount,
    findLatestEventRoom,
    findReusableEventRoom,
    getPersistedRoom,
    withRoomMutation,
    makeAvailableCode,
    makeId,
    makeSocketToken,
    readPositiveSeconds,
    isCurrentPlayerSocket,
    addLog,
    touchRoom,
    publicRoom,
    emitRoom,
    finishRoom,
    getProblem,
    cleanupRoomSocketsAcrossCluster,
    clearLocalSocketPlayer,
    clearLocalSocketSpectator,
    setSocketPlayer,
    setSocketSpectator,
    closeLobbyRoom,
    closeRoomIfNoConnectedPlayers,
    removePlayerFromRoom,
    shouldRateLimit,
    rateLimitMs,
    replyAfterRoomCommit,
    roomGuards: ROOM_GUARDRAILS,
    normalizeRoomMode,
    maxPlayersForRoomMode,
    itemEnabledForRoomMode,
};

io.on("connection", (socket) => {
    registerRoomEntryHandlers(socket, socketHandlerContext);
    registerEventEntryHandlers(socket, socketHandlerContext);
    registerRoomControlHandlers(socket, socketHandlerContext);
    registerRoomExitHandlers(socket, socketHandlerContext, socketEventTimestamps);
    registerItemHandlers(socket, socketHandlerContext);

    registerAnswerSocketHandler(socket, {
        rooms,
        getSocketPlayerRef,
        getPersistedRoom,
        withRoomMutation,
        roomDatabase,
        contestSubmitMutex,
        serverMetrics,
        answerSubmitRateLimitMs: rateLimitMs.answerSubmit,
        makeSubmissionId,
        isCurrentPlayerSocket,
        isFinished,
        finishRoom,
        getProblem,
        shouldRateLimit,
        addLog,
        touchRoom,
        emitRoom,
        emitRoomAfterCommit,
        replyAfterRoomCommit,
    });
});

const shutdown = async () => {
    await shutdownServer({
        getRedisClients: () => redisClients,
        getExamCatalogPool: () => examCatalogPool,
    });
};

process.once("SIGINT", () => {
    void shutdown();
});
process.once("SIGTERM", () => {
    void shutdown();
});

startServer({
    refreshExamCatalog,
    restoreRoomsFromDatabase,
    configureAdapter: () =>
        configureSocketAdapter(io, (clients) => {
            redisClients = clients;
        }),
    httpServer,
    port: serverConfig.port,
}).catch((error) => {
    console.error("Unable to start KICE 아레나 server.", error);
    process.exit(1);
});
