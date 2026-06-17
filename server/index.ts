import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient, type RedisClientType } from "redis";
import { Server, type Socket } from "socket.io";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";
import type { PoolClient } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    type ActiveEffect,
    type ArenaLog,
    ITEM_DEFINITIONS,
    type ItemAward,
    type ItemId,
    type ExamManifest,
    type ProblemBodyBlock,
    type ProblemManifest,
    type RoomMode,
    type RoomPublic,
    ROOM_GUARDRAILS,
    type ServerResponse,
    WRONG_ANSWER_PENALTY_MS,
    isProblemBody,
    normalizeAnswer,
} from "../shared/game.js";
import { sanitizeNickname } from "../shared/nickname.js";
import { makeScoreboardRevealState } from "../shared/reveal.js";
import {
    itemEnabledForRoomMode,
    maxPlayersForRoomMode,
    normalizeRoomMode,
} from "../shared/roomConfig.js";
import {
    getRoomLeaveAction,
    shouldCloseRoomForNoConnectedPlayers,
    validateLobbyKick,
    validateRoomJoin,
} from "../shared/roomLifecycle.js";
import { runtimeMetricSamples, summarizeRoomMetrics } from "../shared/runtimeMetrics.js";
import { normalizeStudentStatus } from "../shared/campaign.js";
import {
    attachReferralConversion,
    createCampaignUser,
    migrateCampaign,
    readCampaignUserByUsername,
    readReferralWhitelistSchool,
    recordReferralVisit,
    searchHighSchools,
    seedDefaultHighSchools,
    syncReferralWhitelist,
} from "./campaignDatabase.js";
import { readCampaignStats } from "./campaignStatsDatabase.js";
import { findHighSchoolNearLocation } from "./highSchoolGeo.js";
import {
    createExamCatalogPool,
    createExamInDatabase,
    createProblemInDatabase,
    migrateExamCatalog,
    readAdminExamsFromDatabase,
    readExamAssetFromDatabase,
    readExamsFromDatabase,
    saveExamAssetInDatabase,
    updateExamSettingsInDatabase,
    updateProblemInDatabase,
} from "./examDatabase.js";
import {
    isExamReleased,
    isOpenRegistrationExam,
    toExamPublic,
    toExamSummary,
    toGymEventSummary,
} from "./exams.js";
import {
    activeEffectForItem,
    cleanupEffects,
    findAdviceNoteProblem,
    maybeAwardItems,
    randomWeakDebuff,
    validateItemTarget,
} from "./items.js";
import { shouldRateLimit as shouldRateLimitEvent } from "./rateLimit.js";
import {
    contestSubmissionToPublic,
    countActiveRoomStates,
    deleteRoomState,
    migrateRoomState,
    readRoomState,
    readRoomStateCodes,
    readRoomStates,
    saveContestSubmission,
    saveRoomState,
} from "./roomDatabase.js";
import {
    derivePlayerScoreState,
    formatPenaltyMinutes,
    makeStandings,
    normalizeSubmissionPenalty,
    scoreForAccepted,
} from "./scoring.js";
import type { PlayerState, RoomState } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT ?? 3001);
const readMetricsBearerToken = () => {
    const inlineToken = process.env.METRICS_BEARER_TOKEN?.trim();
    if (inlineToken) return inlineToken;

    const tokenFile = process.env.METRICS_BEARER_TOKEN_FILE?.trim();
    if (!tokenFile) return "";

    try {
        return fs.readFileSync(tokenFile, "utf8").trim();
    } catch (error) {
        console.warn(`Unable to read metrics bearer token file: ${tokenFile}`, error);
        return "";
    }
};
const metricsBearerToken = readMetricsBearerToken();
const adminToken = process.env.ADMIN_TOKEN?.trim() ?? "";
const referralWhitelist = (process.env.CAMPAIGN_REFERRAL_WHITELIST ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
const campaignLocationRadiusKm = Math.max(
    0.2,
    Math.min(20, Number(process.env.CAMPAIGN_LOCATION_RADIUS_KM) || 3),
);
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const app = express();
app.disable("x-powered-by");
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? allowedOrigins : true,
        credentials: true,
    },
    maxHttpBufferSize: 8 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
});

const rooms = new Map<string, RoomState>();
type SocketPlayerRef = { roomCode: string; playerId: string; socketToken: string };
const socketToPlayer = new Map<string, SocketPlayerRef>();
type RoomSocketCleanupPayload = {
    roomCode: string;
    playerIds?: string[];
    socketIds?: string[];
    excludeSocketIds?: string[];
};
const socketEventTimestamps = new Map<string, Map<string, number>>();
const remotePresenceFetchedAt = new Map<string, number>();
const metricsRegistry = new Registry();
const EXPIRED_EFFECT_NOTICE_MS = 3000;

const normalizeRemoteAddress = (address: string | undefined) => {
    if (!address) return "";
    if (address.startsWith("::ffff:")) return address.slice("::ffff:".length);
    return address;
};

const isPrivateNetworkAddress = (address: string | undefined) => {
    const normalized = normalizeRemoteAddress(address);
    if (normalized === "::1") return true;
    if (
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe80:")
    )
        return true;

    const octets = normalized.split(".").map((part) => Number(part));
    if (
        octets.length !== 4 ||
        octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
        return false;
    }

    const [first, second] = octets;
    return (
        first === 10 ||
        first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254)
    );
};

const hasValidMetricsBearerToken = (authorization: string | undefined) => {
    if (!metricsBearerToken || !authorization?.startsWith("Bearer ")) return false;
    const suppliedToken = authorization.slice("Bearer ".length).trim();
    const expected = Buffer.from(metricsBearerToken);
    const supplied = Buffer.from(suppliedToken);
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};

const hasAdminAccess = (req: express.Request) => {
    if (adminToken) return req.get("x-admin-token")?.trim() === adminToken;
    return (
        process.env.NODE_ENV !== "production" && isPrivateNetworkAddress(req.socket.remoteAddress)
    );
};

collectDefaultMetrics({
    register: metricsRegistry,
    prefix: "kice_arena_",
});

const runtimeMetricsInfoGauge = new Gauge({
    name: "kice_arena_runtime_metrics_info",
    help: "Stable heartbeat emitted by the KICE Arena runtime metrics collector.",
    labelNames: ["service"],
    registers: [metricsRegistry],
});

const runtimeMetricsLastSuccessGauge = new Gauge({
    name: "kice_arena_runtime_metrics_last_success_unixtime",
    help: "Unix timestamp of the most recent successful runtime metrics collection.",
    labelNames: ["service"],
    registers: [metricsRegistry],
});

const roomsTotalGauge = new Gauge({
    name: "kice_arena_rooms_total",
    help: "Current total rooms held in memory.",
    registers: [metricsRegistry],
});

const activeRoomsGauge = new Gauge({
    name: "kice_arena_rooms_active",
    help: "Current rooms that are not finished.",
    registers: [metricsRegistry],
});

const roomsByStatusGauge = new Gauge({
    name: "kice_arena_rooms_by_status",
    help: "Current rooms grouped by status.",
    labelNames: ["status"],
    registers: [metricsRegistry],
});

const roomExpirySecondsGauge = new Gauge({
    name: "kice_arena_room_expiry_seconds",
    help: "Seconds until rooms finish or become eligible for cleanup.",
    labelNames: ["stat"],
    registers: [metricsRegistry],
});

const playingRoomTimeRemainingSecondsGauge = new Gauge({
    name: "kice_arena_playing_room_time_remaining_seconds",
    help: "Seconds until playing rooms naturally finish.",
    labelNames: ["stat"],
    registers: [metricsRegistry],
});

const playersGauge = new Gauge({
    name: "kice_arena_players",
    help: "Current player counts.",
    labelNames: ["state"],
    registers: [metricsRegistry],
});

const runtimeMetricGauges = new Map<string, Gauge<string>>([
    ["kice_arena_runtime_metrics_info", runtimeMetricsInfoGauge],
    ["kice_arena_runtime_metrics_last_success_unixtime", runtimeMetricsLastSuccessGauge],
    ["kice_arena_rooms_total", roomsTotalGauge],
    ["kice_arena_rooms_active", activeRoomsGauge],
    ["kice_arena_rooms_by_status", roomsByStatusGauge],
    ["kice_arena_room_expiry_seconds", roomExpirySecondsGauge],
    ["kice_arena_playing_room_time_remaining_seconds", playingRoomTimeRemainingSecondsGauge],
    ["kice_arena_players", playersGauge],
    [
        "kice_arena_players_disconnected_ratio",
        new Gauge({
            name: "kice_arena_players_disconnected_ratio",
            help: "Share of tracked players that are currently disconnected. Value range: 0..1.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_players_per_active_room",
        new Gauge({
            name: "kice_arena_players_per_active_room",
            help: "Average players per non-finished room by player state.",
            labelNames: ["state"],
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_rooms_empty_lobby",
        new Gauge({
            name: "kice_arena_rooms_empty_lobby",
            help: "Lobby rooms with no tracked players. High values point to lobby cleanup pressure.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_rooms_disconnected_lobby",
        new Gauge({
            name: "kice_arena_rooms_disconnected_lobby",
            help: "Lobby rooms that still have tracked players but no connected players.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_rooms_partially_disconnected",
        new Gauge({
            name: "kice_arena_rooms_partially_disconnected",
            help: "Active rooms where at least one, but not all, tracked players are disconnected.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_rooms_zombie_playing",
        new Gauge({
            name: "kice_arena_rooms_zombie_playing",
            help: "Playing rooms with no connected players. This is usually a stale game-session signal.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_rooms_player_count_mismatch",
        new Gauge({
            name: "kice_arena_rooms_player_count_mismatch",
            help: "Rooms whose connected player count is negative, exceeds total players, or total players is negative.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_rooms_expiring_soon",
        new Gauge({
            name: "kice_arena_rooms_expiring_soon",
            help: "Rooms whose finish or cleanup deadline is inside the expiringSoonMs window.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_rooms_expired",
        new Gauge({
            name: "kice_arena_rooms_expired",
            help: "Rooms whose finish or cleanup deadline has passed but are still present in memory.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_room_expiry_overdue_seconds",
        new Gauge({
            name: "kice_arena_room_expiry_overdue_seconds",
            help: "How long expired rooms have remained in memory after their deadline.",
            labelNames: ["stat"],
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_room_disconnect_risk_score",
        new Gauge({
            name: "kice_arena_room_disconnect_risk_score",
            help: "Weighted active-room disconnect risk score. Value range: 0..1.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_room_cleanup_pressure_score",
        new Gauge({
            name: "kice_arena_room_cleanup_pressure_score",
            help: "Weighted room cleanup pressure score. Value range: 0..1.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_contests_active",
        new Gauge({
            name: "kice_arena_contests_active",
            help: "Distinct contest events with at least one non-finished participant session.",
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_contest_sessions",
        new Gauge({
            name: "kice_arena_contest_sessions",
            help: "Contest participant sessions by event and room status.",
            labelNames: ["event_id", "status"],
            registers: [metricsRegistry],
        }),
    ],
    [
        "kice_arena_contest_participants",
        new Gauge({
            name: "kice_arena_contest_participants",
            help: "Contest participants by event and connection state.",
            labelNames: ["event_id", "state"],
            registers: [metricsRegistry],
        }),
    ],
]);

const socketConnectionsGauge = new Gauge({
    name: "kice_arena_socket_connections",
    help: "Current Socket.IO connections.",
    registers: [metricsRegistry],
});

const registeredSocketConnectionsGauge = new Gauge({
    name: "kice_arena_registered_socket_connections",
    help: "Current Socket.IO connections associated with a tracked room player.",
    registers: [metricsRegistry],
});

const roomsCreatedCounter = new Counter({
    name: "kice_arena_rooms_created_total",
    help: "Total rooms created since server start.",
    registers: [metricsRegistry],
});

const playersJoinedCounter = new Counter({
    name: "kice_arena_players_joined_total",
    help: "Total non-host players joined since server start.",
    registers: [metricsRegistry],
});

const answersSubmittedCounter = new Counter({
    name: "kice_arena_answers_submitted_total",
    help: "Total answer submissions since server start, labeled by correctness.",
    labelNames: ["correct"],
    registers: [metricsRegistry],
});

const contestSubmissionsCounter = new Counter({
    name: "kice_arena_contest_submissions_total",
    help: "Total contest answer submissions since server start, labeled by event and correctness.",
    labelNames: ["event_id", "correct"],
    registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram({
    name: "kice_arena_http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "path", "status"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [metricsRegistry],
});

const ROOM_TTL = {
    emptyLobbyMs: 10 * 60 * 1000,
    disconnectedLobbyMs: 30 * 60 * 1000,
    finishedMs: 30 * 60 * 1000,
} as const;
const REMOTE_PRESENCE_FETCH_INTERVAL_MS = 1000;

const RATE_LIMIT_MS = {
    ready: 200,
    problemSet: 150,
    answerSubmit: 500,
    itemUse: 300,
    revealNext: 250,
} as const;

let exams: ExamManifest[] = [];
let examById = new Map<string, ExamManifest>();
let examCatalogPool: ReturnType<typeof createExamCatalogPool> | null = null;
let redisClients: { pubClient: RedisClientType; subClient: RedisClientType } | null = null;
type RoomMutationContext = {
    client: PoolClient;
    pendingWrites: Promise<unknown>[];
    afterCommit: Array<() => void>;
};
const roomMutationStorage = new AsyncLocalStorage<RoomMutationContext>();

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
    await syncReferralWhitelist(examCatalogPool, referralWhitelist);
    exams = await readExamsFromDatabase(examCatalogPool);
    examById = new Map(exams.map((exam) => [exam.id, exam]));
};

const configureSocketAdapter = async () => {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) return;

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    pubClient.on("error", (error) => {
        console.error("Socket.IO Redis pub client error.", error);
    });
    subClient.on("error", (error) => {
        console.error("Socket.IO Redis sub client error.", error);
    });
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    redisClients = { pubClient, subClient };
    console.log("Socket.IO Redis adapter enabled.");
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

const makeCode = (): string => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return rooms.has(code) ? makeCode() : code;
};

const makeAvailableCode = async (): Promise<string> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = makeCode();
        if (!examCatalogPool || !(await readRoomState(examCatalogPool, code, examById)))
            return code;
    }
    throw new Error("Unable to allocate a unique room code.");
};

const makeId = () => Math.random().toString(36).slice(2, 10);
const makeSocketToken = () => crypto.randomUUID();
const makeSubmissionId = () => crypto.randomUUID();

const isCurrentPlayerSocket = (
    player: PlayerState | undefined,
    ref: SocketPlayerRef | undefined,
): player is PlayerState =>
    Boolean(player && ref && player.socketToken && player.socketToken === ref.socketToken);

const bumpRoomVersion = (room: RoomState) => {
    room.version += 1;
};

const addLog = (room: RoomState, kind: ArenaLog["kind"], message: string) => {
    room.logs.unshift({ id: makeId(), kind, message, createdAt: Date.now() });
    room.logs = room.logs.slice(0, 24);
};

const clampNumber = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

const readPositiveSeconds = (value: unknown, fallback: number, min: number, max: number) => {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return Math.round(clampNumber(fallback, min, max));
    return Math.round(clampNumber(numeric, min, max));
};

const readString = (value: unknown, maxLength: number) =>
    typeof value === "string" ? value.trim().slice(0, maxLength) : "";
const hashPassword = (password: string) => {
    const salt = crypto.randomBytes(16).toString("base64url");
    const key = crypto.scryptSync(password, salt, 64).toString("base64url");
    return `scrypt:${salt}:${key}`;
};
const verifyPassword = (password: string, storedHash: string) => {
    const [scheme, salt, key] = storedHash.split(":");
    if (scheme !== "scrypt" || !salt || !key) return false;
    const expected = Buffer.from(key, "base64url");
    const supplied = crypto.scryptSync(password, salt, 64);
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};
const visitorFingerprint = (req: express.Request) =>
    crypto
        .createHash("sha256")
        .update(
            `${normalizeRemoteAddress(req.socket.remoteAddress)}:${req.get("user-agent") ?? ""}`,
        )
        .digest("base64url");
const sanitizeAssetFileName = (value: string) => {
    const safeName = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 96);
    const withExtension = safeName.endsWith(".svg") ? safeName : `${safeName || "asset"}.svg`;
    return withExtension.replace(/\.{2,}/g, ".");
};
const assetUrlPath = (assetPath: string) =>
    assetPath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
const makeUploadedSvgPath = (fileName: string) =>
    `diagrams/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${sanitizeAssetFileName(fileName)}`;
const isLikelySafeSvg = (body: Buffer) => {
    const text = body.toString("utf8");
    return (
        /<svg[\s>]/i.test(text) &&
        !/<script[\s>]/i.test(text) &&
        !/\son[a-z]+\s*=/i.test(text) &&
        !/javascript:/i.test(text)
    );
};
const readOptionalBodyBlocks = (value: unknown): ProblemBodyBlock[] | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return isProblemBody(value) ? value : undefined;
};

const setSocketPlayer = (socket: Socket, ref: SocketPlayerRef) => {
    socketToPlayer.set(socket.id, ref);
    socket.data.roomCode = ref.roomCode;
    socket.data.playerId = ref.playerId;
    socket.data.socketToken = ref.socketToken;
};

const clearLocalSocketPlayer = (socketId: string) => {
    socketToPlayer.delete(socketId);
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) return;
    delete socket.data.roomCode;
    delete socket.data.playerId;
    delete socket.data.socketToken;
};

const cleanupLocalRoomSockets = ({
    roomCode,
    playerIds,
    socketIds,
    excludeSocketIds,
}: RoomSocketCleanupPayload) => {
    const playerIdSet = playerIds ? new Set(playerIds) : null;
    const socketIdSet = socketIds ? new Set(socketIds) : null;
    const excludedSocketIds = new Set(excludeSocketIds ?? []);
    for (const [socketId, ref] of socketToPlayer.entries()) {
        if (excludedSocketIds.has(socketId)) continue;
        if (ref.roomCode !== roomCode) continue;
        if (
            (playerIdSet || socketIdSet) &&
            !playerIdSet?.has(ref.playerId) &&
            !socketIdSet?.has(socketId)
        )
            continue;
        io.sockets.sockets.get(socketId)?.leave(roomCode);
        clearLocalSocketPlayer(socketId);
    }
};

const cleanupRoomSocketsAcrossCluster = (payload: RoomSocketCleanupPayload) => {
    cleanupLocalRoomSockets(payload);
    io.serverSideEmit("room:socket-cleanup", payload);
};

io.on("room:socket-cleanup", (payload: RoomSocketCleanupPayload) => {
    cleanupLocalRoomSockets(payload);
});

const markSocketPresence = (room: RoomState, ref: Partial<SocketPlayerRef>, socketId: string) => {
    if (ref.roomCode !== room.code || !ref.playerId) return;
    const player = room.players.get(ref.playerId);
    if (!player) return;
    if (!ref.socketToken || player.socketToken !== ref.socketToken) return;
    player.socketId = socketId;
    player.connected = true;
};

const applySocketPresence = async (room: RoomState) => {
    const cachedRoom = rooms.get(room.code);
    for (const player of room.players.values()) {
        const cachedPlayer = cachedRoom?.players.get(player.id);
        if (cachedPlayer?.socketToken === player.socketToken) {
            player.socketId = cachedPlayer.socketId;
            player.connected = cachedPlayer.connected;
        } else {
            player.socketId = "";
            player.connected = false;
        }
    }
    for (const [socketId, ref] of socketToPlayer.entries()) {
        if (ref.roomCode !== room.code) continue;
        const socket = io.sockets.sockets.get(socketId);
        if (!room.players.has(ref.playerId) || !socket) {
            clearLocalSocketPlayer(socketId);
            continue;
        }
        markSocketPresence(room, ref, socketId);
    }

    const now = Date.now();
    const shouldFetchRemotePresence =
        redisClients &&
        now - (remotePresenceFetchedAt.get(room.code) ?? 0) >= REMOTE_PRESENCE_FETCH_INTERVAL_MS;
    if (shouldFetchRemotePresence) {
        try {
            const sockets = await io.in(room.code).fetchSockets();
            for (const player of room.players.values()) {
                if (io.sockets.sockets.has(player.socketId)) continue;
                player.socketId = "";
                player.connected = false;
            }
            for (const remoteSocket of sockets) {
                markSocketPresence(
                    room,
                    remoteSocket.data as Partial<SocketPlayerRef>,
                    remoteSocket.id,
                );
            }
            remotePresenceFetchedAt.set(room.code, now);
        } catch (error) {
            console.error(`Unable to fetch socket presence for room ${room.code}.`, error);
        }
    }
    return room;
};

const roomDatabase = () => roomMutationStorage.getStore()?.client ?? examCatalogPool;

const getPersistedRoom = async (code: string) => {
    const db = roomDatabase();
    if (!db) return rooms.get(code) ?? null;
    const persisted = await readRoomState(db, code, examById);
    if (!persisted) {
        rooms.delete(code);
        return null;
    }
    const room = await applySocketPresence(persisted);
    rooms.set(code, room);
    return room;
};

const withRoomMutation = async <T>(code: string, callback: () => Promise<T>): Promise<T> => {
    if (!examCatalogPool) return callback();
    const existingContext = roomMutationStorage.getStore();
    if (existingContext) return callback();

    const client = await examCatalogPool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [code]);
        const context: RoomMutationContext = { client, pendingWrites: [], afterCommit: [] };
        const result = await roomMutationStorage.run(context, callback);
        await Promise.all(context.pendingWrites);
        await client.query("COMMIT");
        for (const action of context.afterCommit) action();
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const afterRoomCommit = (action: () => void) => {
    const context = roomMutationStorage.getStore();
    if (!context) {
        action();
        return;
    }
    context.afterCommit.push(action);
};

const replyAfterRoomCommit = <TResponse>(
    reply: ((response: TResponse) => void) | undefined,
    response: TResponse,
) => {
    if (!reply) return;
    afterRoomCommit(() => reply(response));
};

const activeRoomCount = async () => {
    const db = roomDatabase();
    if (db) return countActiveRoomStates(db);
    return [...rooms.values()].filter((room) => room.status !== "finished").length;
};

const updateRuntimeMetrics = () => {
    const now = Date.now();
    const summary = summarizeRoomMetrics(
        [...rooms.values()].map((room) => ({
            status: room.status,
            mode: room.mode,
            eventId: room.exam.id,
            endsAt: room.endsAt,
            createdAt: room.createdAt,
            lastActivityAt: room.lastActivityAt,
            playerCount: room.players.size,
            connectedPlayerCount: [...room.players.values()].filter((player) => player.connected)
                .length,
        })),
        now,
        ROOM_TTL,
    );

    for (const gauge of runtimeMetricGauges.values()) gauge.reset();
    for (const sample of runtimeMetricSamples(summary, { collectedAtMs: now })) {
        const gauge = runtimeMetricGauges.get(sample.name);
        if (!gauge) continue;
        if (sample.labels) {
            gauge.set(sample.labels, sample.value);
        } else {
            gauge.set(sample.value);
        }
    }

    socketConnectionsGauge.set(io.engine.clientsCount);
    registeredSocketConnectionsGauge.set(socketToPlayer.size);
};

const touchRoom = (room: RoomState) => {
    room.lastActivityAt = Date.now();
};

const persistRoom = (room: RoomState) => {
    const db = roomDatabase();
    if (!db) return;
    const write = saveRoomState(db, room);
    const context = roomMutationStorage.getStore();
    if (context) {
        context.pendingWrites.push(write);
        return;
    }
    void write.catch((error) => {
        console.error(`Unable to persist room ${room.code}.`, error);
    });
};

const removePersistedRoom = (code: string) => {
    const db = roomDatabase();
    if (!db) return;
    const write = deleteRoomState(db, code);
    const context = roomMutationStorage.getStore();
    if (context) {
        context.pendingWrites.push(write);
        return;
    }
    void write.catch((error) => {
        console.error(`Unable to delete persisted room ${code}.`, error);
    });
};

const deleteRoom = (room: RoomState) => {
    cleanupRoomSocketsAcrossCluster({ roomCode: room.code });
    for (const player of room.players.values()) {
        io.sockets.sockets.get(player.socketId)?.leave(room.code);
    }
    rooms.delete(room.code);
    remotePresenceFetchedAt.delete(room.code);
    removePersistedRoom(room.code);
};

const removePlayerFromRoom = (room: RoomState, player: PlayerState) => {
    room.players.delete(player.id);
    clearLocalSocketPlayer(player.socketId);
    io.sockets.sockets.get(player.socketId)?.leave(room.code);
};

const closeLobbyRoom = (room: RoomState) => {
    io.to(room.code).emit("room:closed", { code: room.code });
    deleteRoom(room);
};

const closeRoomIfNoConnectedPlayers = (room: RoomState) => {
    if (room.status !== "lobby") return false;
    if (!shouldCloseRoomForNoConnectedPlayers(room.players.values())) return false;
    io.to(room.code).emit("room:closed", { code: room.code });
    deleteRoom(room);
    return true;
};

const applySubmissionToPlayer = (
    player: PlayerState,
    submission: ReturnType<typeof contestSubmissionToPublic>,
) => {
    player.submissions = player.submissions.filter(
        (existing) => existing.problemId !== submission.problemId,
    );
    player.submissions.push(submission);
    player.submissionHistory.push(submission);
    if (submission.correct) {
        player.score += submission.scoreAwarded;
        player.penaltyMs += submission.penaltyMs;
        player.scoreBreakdown.solved += 1;
        player.scoreBreakdown.difficultyBonus += 0;
        player.scoreBreakdown.timeBonus += 0;
        player.consecutiveWrong = 0;
    } else {
        player.consecutiveWrong += 1;
    }
};

const shouldRateLimit = (socketId: string, eventName: string, minIntervalMs: number) => {
    return shouldRateLimitEvent(socketEventTimestamps, socketId, eventName, minIntervalMs);
};

const isScoreboardFrozen = (room: RoomState) =>
    room.status === "playing" &&
    room.scoreboardFrozenAt !== null &&
    Date.now() >= room.scoreboardFrozenAt;

const maybeFreezeScoreboard = (room: RoomState) => {
    if (!isScoreboardFrozen(room) || room.frozenStandings.length > 0) return false;
    room.frozenStandings = makeStandings(room);
    addLog(
        room,
        "system",
        `종료 ${Math.round(room.freezeBeforeSec / 60)}분 전. 순위표가 비공개 처리되었습니다.`,
    );
    touchRoom(room);
    return true;
};

const publicRoom = (room: RoomState): RoomPublic => ({
    code: room.code,
    hostId: room.hostId,
    exam: toExamPublic(room.exam),
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    version: room.version,
    status: room.status,
    timeLimitSec: room.timeLimitSec,
    freezeBeforeSec: room.freezeBeforeSec,
    itemEnabled: room.itemEnabled,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    scoreboardFrozen: isScoreboardFrozen(room),
    scoreboardFrozenAt: room.scoreboardFrozenAt,
    frozenStandings: room.frozenStandings,
    scoreboardRevealCount: room.scoreboardRevealCount,
    players: [...room.players.values()].map(
        ({ socketId: _socketId, socketToken: _socketToken, ...player }) => {
            const derived = derivePlayerScoreState(room, player);
            return {
                ...player,
                score: derived.score,
                penaltyMs: derived.penaltyMs,
                scoreBreakdown: {
                    ...player.scoreBreakdown,
                    solved: derived.solved,
                },
                submissions: derived.normalizedSubmissions,
                submissionHistory: (player.submissionHistory ?? player.submissions).map(
                    (submission) => normalizeSubmissionPenalty(room, submission),
                ),
                itemCooldowns: player.itemCooldowns ?? {},
                effects: player.effects.filter((effect) => effect.expiresAt > Date.now()),
                expiredEffects: (player.expiredEffects ?? []).filter(
                    (effect) => Date.now() - effect.clearedAt <= EXPIRED_EFFECT_NOTICE_MS,
                ),
            };
        },
    ),
    logs: room.logs,
});

const emitRoom = (room: RoomState): RoomPublic => {
    maybeFreezeScoreboard(room);
    bumpRoomVersion(room);
    persistRoom(room);
    const snapshot = publicRoom(room);
    io.to(room.code).emit("room:update", snapshot);
    return snapshot;
};

const isFinished = (room: RoomState) =>
    room.status === "playing" && room.endsAt !== null && Date.now() >= room.endsAt;

const finishRoom = (room: RoomState, reason = "시험 종료. 답안지를 걷습니다.") => {
    if (room.status !== "playing") return null;
    maybeFreezeScoreboard(room);
    if (room.frozenStandings.length === 0) room.frozenStandings = makeStandings(room);
    room.scoreboardRevealCount = 0;
    room.status = "finished";
    touchRoom(room);
    addLog(room, "system", "채점 완료. 프리즈 이후 비공개 시도 공개를 시작합니다.");
    addLog(room, "system", reason);
    return emitRoom(room);
};

const runRoomMaintenance = async () => {
    const now = Date.now();
    const codes = new Set(rooms.keys());
    if (examCatalogPool) {
        for (const code of await readRoomStateCodes(examCatalogPool)) codes.add(code);
    }
    for (const code of codes) {
        await withRoomMutation(code, async () => {
            const room = await getPersistedRoom(code);
            if (!room) return;
            const effectsChanged = cleanupEffects(room, now, EXPIRED_EFFECT_NOTICE_MS);
            if (isFinished(room)) finishRoom(room);
            else if (maybeFreezeScoreboard(room)) emitRoom(room);
            else if (effectsChanged) emitRoom(room);

            const hasConnectedPlayers = [...room.players.values()].some(
                (player) => player.connected,
            );
            const shouldDelete =
                (room.status === "finished" && now - room.lastActivityAt > ROOM_TTL.finishedMs) ||
                (room.status === "lobby" &&
                    room.players.size === 0 &&
                    now - room.createdAt > ROOM_TTL.emptyLobbyMs) ||
                (room.status === "lobby" &&
                    !hasConnectedPlayers &&
                    now - room.lastActivityAt > ROOM_TTL.disconnectedLobbyMs);
            if (shouldDelete) deleteRoom(room);
        });
    }
};

setInterval(() => {
    void runRoomMaintenance().catch((error) => {
        console.error("Room maintenance failed.", error);
    });
}, 1000);

app.use((req, res, next) => {
    const endTimer = httpRequestDurationSeconds.startTimer({
        method: req.method,
        path: req.path,
    });
    res.on("finish", () => {
        endTimer({ status: String(res.statusCode) });
    });
    next();
});

app.use(express.json({ limit: "256kb" }));

app.get("/api/exams/:examId/assets/*assetPath", async (req, res) => {
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }

    const exam = examById.get(readString(req.params.examId, 80));
    const assetPath = readString(
        (req.params as { assetPath?: string[] }).assetPath?.join("/") ?? "",
        240,
    );
    if (!exam || !isExamReleased(exam) || !assetPath || assetPath.includes("..")) {
        res.sendStatus(404);
        return;
    }

    const asset = await readExamAssetFromDatabase(examCatalogPool, exam.id, assetPath);
    if (!asset) {
        res.sendStatus(404);
        return;
    }

    res.set("Content-Type", asset.contentType);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(asset.body);
});

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, exams: exams.length, problemStorage: "postgres" });
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

    updateRuntimeMetrics();
    res.set("Content-Type", metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
});

app.get("/api/exams", (_req, res) => {
    res.json(exams.filter((exam) => isExamReleased(exam)).map(toExamSummary));
});

app.get("/api/events", (_req, res) => {
    res.json(exams.map((exam) => toGymEventSummary(exam)));
});

app.get("/api/events/:eventId/problems", (req, res) => {
    const eventId = readString(req.params.eventId, 80);
    const exam = examById.get(eventId);
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

app.get("/api/schools", async (req, res) => {
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }
    const query = readString(req.query.q, 80);
    res.json(await searchHighSchools(examCatalogPool, query));
});

app.post("/api/campaign/referral-visit", async (req, res) => {
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }
    const referralCode = readString(req.body?.referralCode, 32).toLowerCase();
    if (!/^[2-9a-z]{4,32}$/.test(referralCode)) {
        res.status(400).json({ error: "Invalid referral code." });
        return;
    }
    if (!(await readReferralWhitelistSchool(examCatalogPool, referralCode))) {
        res.status(403).json({ error: "Referral code is not whitelisted." });
        return;
    }
    await recordReferralVisit(examCatalogPool, referralCode, visitorFingerprint(req));
    res.json({ ok: true });
});

app.post("/api/campaign/referral-location-verify", async (req, res) => {
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }
    const referralCode = readString(req.body?.referralCode, 32).toLowerCase();
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (
        !/^[2-9a-z]{4,32}$/.test(referralCode) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < 33 ||
        latitude > 39 ||
        longitude < 124 ||
        longitude > 132
    ) {
        res.status(400).json({ error: "Invalid location verification payload." });
        return;
    }
    const allowedSchool = await readReferralWhitelistSchool(examCatalogPool, referralCode);
    if (!allowedSchool) {
        res.status(403).json({ error: "Referral code is not whitelisted." });
        return;
    }
    const verified = await findHighSchoolNearLocation(
        examCatalogPool,
        allowedSchool.id,
        latitude,
        longitude,
        campaignLocationRadiusKm,
    );
    if (!verified) {
        res.status(403).json({ error: "This referral code is not valid for this location." });
        return;
    }
    await recordReferralVisit(examCatalogPool, referralCode, visitorFingerprint(req));
    res.json({
        referralCode,
        school: verified.school,
        distanceKm: Math.round(verified.distanceKm * 100) / 100,
        verifiedAt: new Date().toISOString(),
    });
});

app.post("/api/campaign/register", async (req, res) => {
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }
    const username = readString(req.body?.username, 32).toLowerCase();
    const password = readString(req.body?.password, 120);
    const phone = readString(req.body?.phone, 32);
    const schoolId = readString(req.body?.schoolId, 80);
    const referredByCode = readString(req.body?.referredByCode, 32).toLowerCase() || null;
    const paymentMeta =
        req.body?.paymentMeta && typeof req.body.paymentMeta === "object"
            ? (req.body.paymentMeta as Record<string, unknown>)
            : {};

    if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 8 || !phone || !schoolId) {
        res.status(400).json({ error: "Invalid campaign registration payload." });
        return;
    }
    if (referredByCode) {
        const allowedSchool = await readReferralWhitelistSchool(examCatalogPool, referredByCode);
        if (!allowedSchool || allowedSchool.id !== schoolId) {
            res.status(403).json({ error: "Referral code is not valid for this school." });
            return;
        }
    }

    try {
        const user = await createCampaignUser(examCatalogPool, {
            username,
            passwordHash: hashPassword(password),
            studentStatus: normalizeStudentStatus(req.body?.studentStatus),
            phone,
            schoolId,
            paymentMeta,
            referredByCode,
        });
        if (referredByCode) {
            await attachReferralConversion(
                examCatalogPool,
                referredByCode,
                user.id,
                visitorFingerprint(req),
            );
        }
        res.status(201).json(user);
    } catch (error) {
        const code =
            typeof error === "object" && error && "code" in error
                ? String((error as { code?: unknown }).code)
                : "";
        if (code === "23505") {
            res.status(409).json({ error: "Username already exists." });
            return;
        }
        if (code === "23503") {
            res.status(400).json({ error: "Unknown school." });
            return;
        }
        throw error;
    }
});

app.post("/api/campaign/login", async (req, res) => {
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }
    const username = readString(req.body?.username, 32).toLowerCase();
    const password = readString(req.body?.password, 120);
    const record = username ? await readCampaignUserByUsername(examCatalogPool, username) : null;
    if (!record || !verifyPassword(password, record.passwordHash)) {
        res.status(401).json({ error: "Invalid username or password." });
        return;
    }
    res.json(record.user);
});

app.get("/api/admin/campaign/stats", async (req, res) => {
    if (!hasAdminAccess(req)) {
        res.sendStatus(adminToken ? 401 : 403);
        return;
    }
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }
    res.json(await readCampaignStats(examCatalogPool));
});

app.get("/api/admin/exams", async (req, res) => {
    if (!hasAdminAccess(req)) {
        res.sendStatus(adminToken ? 401 : 403);
        return;
    }
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }

    res.json(await readAdminExamsFromDatabase(examCatalogPool));
});

app.get("/api/admin/exams/:examId/assets/*assetPath", async (req, res) => {
    if (!hasAdminAccess(req)) {
        res.sendStatus(adminToken ? 401 : 403);
        return;
    }
    if (!examCatalogPool) {
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

    const asset = await readExamAssetFromDatabase(examCatalogPool, examId, assetPath, false);
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
        if (!examCatalogPool) {
            res.sendStatus(503);
            return;
        }

        const examId = readString(req.params.examId, 80);
        const fileName = readString(req.get("x-file-name") ?? "asset.svg", 120);
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (!examId || body.length === 0 || body.length > 1024 * 1024 || !isLikelySafeSvg(body)) {
            res.status(400).json({ error: "Invalid SVG asset." });
            return;
        }

        const assetPath = makeUploadedSvgPath(fileName);
        const asset = await saveExamAssetInDatabase(examCatalogPool, {
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

app.post("/api/admin/exams", async (req, res) => {
    if (!hasAdminAccess(req)) {
        res.sendStatus(adminToken ? 401 : 403);
        return;
    }
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }

    const id = readString(req.body?.id, 80);
    const title = readString(req.body?.title, 120);
    const subtitle = readString(req.body?.subtitle, 160);
    const timeLimitSec = Number(req.body?.timeLimitSec);
    const active = req.body?.active === true;

    if (
        !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(id) ||
        !title ||
        !subtitle ||
        !Number.isInteger(timeLimitSec) ||
        timeLimitSec < 60 ||
        timeLimitSec > 24 * 60 * 60
    ) {
        res.status(400).json({ error: "Invalid exam payload." });
        return;
    }

    try {
        const exam = await createExamInDatabase(examCatalogPool, {
            id,
            title,
            subtitle,
            timeLimitSec,
            active,
        });
        exams = await readExamsFromDatabase(examCatalogPool);
        examById = new Map(exams.map((candidate) => [candidate.id, candidate]));
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

app.patch("/api/admin/exams/:examId", async (req, res) => {
    if (!hasAdminAccess(req)) {
        res.sendStatus(adminToken ? 401 : 403);
        return;
    }
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }

    const examId = readString(req.params.examId, 80);
    const title = readString(req.body?.title, 120);
    const subtitle = readString(req.body?.subtitle, 160);
    const timeLimitSec = Number(req.body?.timeLimitSec);
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
        timeLimitSec > 24 * 60 * 60
    ) {
        res.status(400).json({ error: "Invalid exam settings payload." });
        return;
    }
    if (releaseAt && Number.isNaN(Date.parse(releaseAt))) {
        res.status(400).json({ error: "Invalid release date." });
        return;
    }

    const exam = await updateExamSettingsInDatabase(examCatalogPool, examId, {
        title,
        subtitle,
        timeLimitSec,
        active,
        releaseAt,
    });
    if (!exam) {
        res.sendStatus(404);
        return;
    }

    exams = await readExamsFromDatabase(examCatalogPool);
    examById = new Map(exams.map((candidate) => [candidate.id, candidate]));
    const refreshed =
        (await readAdminExamsFromDatabase(examCatalogPool)).find(
            (candidate) => candidate.id === exam.id,
        ) ?? exam;
    res.json(refreshed);
});

app.post("/api/admin/exams/:examId/problems", async (req, res) => {
    if (!hasAdminAccess(req)) {
        res.sendStatus(adminToken ? 401 : 403);
        return;
    }
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }

    const examId = readString(req.params.examId, 80);
    const title = readString(req.body?.title, 120) || "새 문항";
    const answerKind = req.body?.answerKind === "choice" ? "choice" : "short";
    const answer = readString(req.body?.answer, 40) || "1";
    const difficulty = Number(req.body?.difficulty ?? 1);
    const pointValueRaw = req.body?.pointValue;
    const pointValue =
        pointValueRaw === null || pointValueRaw === "" || pointValueRaw === undefined
            ? null
            : Number(pointValueRaw);
    const body =
        req.body?.body === undefined
            ? ([{ kind: "paragraph", text: "" }] as ProblemBodyBlock[])
            : readOptionalBodyBlocks(req.body?.body);

    if (
        !examId ||
        !Number.isInteger(difficulty) ||
        difficulty < 1 ||
        difficulty > 5 ||
        body === undefined
    ) {
        res.status(400).json({ error: "Invalid problem payload." });
        return;
    }
    if (
        pointValue !== null &&
        (!Number.isInteger(pointValue) || pointValue < 1 || pointValue > 100)
    ) {
        res.status(400).json({ error: "Invalid point value." });
        return;
    }

    const problem = await createProblemInDatabase(examCatalogPool, examId, {
        title,
        answerKind,
        answer,
        difficulty: difficulty as ProblemManifest["difficulty"],
        pointValue,
        body,
    });
    if (!problem) {
        res.sendStatus(404);
        return;
    }

    exams = await readExamsFromDatabase(examCatalogPool);
    examById = new Map(exams.map((candidate) => [candidate.id, candidate]));
    res.status(201).json(problem);
});

app.patch("/api/admin/exams/:examId/problems/:problemId", async (req, res) => {
    if (!hasAdminAccess(req)) {
        res.sendStatus(adminToken ? 401 : 403);
        return;
    }
    if (!examCatalogPool) {
        res.sendStatus(503);
        return;
    }

    const examId = readString(req.params.examId, 80);
    const problemId = readString(req.params.problemId, 80);
    const title = readString(req.body?.title, 120);
    const answerKind =
        req.body?.answerKind === "short"
            ? "short"
            : req.body?.answerKind === "choice"
              ? "choice"
              : "";
    const answer = readString(req.body?.answer, 40);
    const difficulty = Number(req.body?.difficulty);
    const pointValueRaw = req.body?.pointValue;
    const pointValue =
        pointValueRaw === null || pointValueRaw === "" || pointValueRaw === undefined
            ? null
            : Number(pointValueRaw);
    const body = readOptionalBodyBlocks(req.body?.body);

    if (
        !title ||
        !answerKind ||
        !answer ||
        !Number.isInteger(difficulty) ||
        difficulty < 1 ||
        difficulty > 5 ||
        body === undefined
    ) {
        res.status(400).json({ error: "Invalid problem payload." });
        return;
    }
    if (
        pointValue !== null &&
        (!Number.isInteger(pointValue) || pointValue < 1 || pointValue > 100)
    ) {
        res.status(400).json({ error: "Invalid point value." });
        return;
    }

    const problem = await updateProblemInDatabase(examCatalogPool, examId, problemId, {
        title,
        answerKind,
        answer,
        difficulty: difficulty as ProblemManifest["difficulty"],
        pointValue,
        body,
    });
    if (!problem) {
        res.sendStatus(404);
        return;
    }

    exams = await readExamsFromDatabase(examCatalogPool);
    examById = new Map(exams.map((exam) => [exam.id, exam]));
    res.json(problem);
});

app.get("/api/rooms/:code", async (req, res) => {
    const code = readString(req.params.code, 8).toUpperCase();
    const room = await getPersistedRoom(code);
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

io.on("connection", (socket) => {
    socket.on(
        "room:rejoin",
        async (
            payload: { code: string; playerId: string },
            reply: (response: ServerResponse<RoomPublic>) => void,
        ) => {
            const code = readString(payload?.code, 8).toUpperCase();
            await withRoomMutation(code, async () => {
                const room = await getPersistedRoom(code);
                const player = room?.players.get(readString(payload?.playerId, 32));
                if (!room || !player) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "이전에 입실했던 방을 찾을 수 없습니다.",
                    });
                    return;
                }

                const previousSocketId = player.socketId;
                const socketToken = makeSocketToken();
                player.socketId = socket.id;
                player.socketToken = socketToken;
                player.connected = true;
                io.sockets.sockets.get(previousSocketId)?.leave(code);
                socket.join(code);
                cleanupRoomSocketsAcrossCluster({
                    roomCode: code,
                    playerIds: [player.id],
                    socketIds: previousSocketId ? [previousSocketId] : [],
                    excludeSocketIds: [socket.id],
                });
                setSocketPlayer(socket, { roomCode: code, playerId: player.id, socketToken });
                touchRoom(room);
                socket.emit("player:you", player.id);
                addLog(room, "system", `${player.nickname} 재입실. 기존 수험번호를 복구했습니다.`);
                const snapshot = emitRoom(room);
                replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );

    socket.on(
        "room:create",
        async (
            payload: {
                examId: string;
                nickname: string;
                timeLimitSec?: number;
                freezeBeforeSec?: number;
                itemEnabled: boolean;
                mode?: RoomMode;
            },
            reply: (response: ServerResponse<RoomPublic>) => void,
        ) => {
            await withRoomMutation("__room_create__", async () => {
                if ((await activeRoomCount()) >= ROOM_GUARDRAILS.maxActiveRooms) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "현재 생성 가능한 방 수를 초과했습니다. 잠시 후 다시 시도하세요.",
                    });
                    return;
                }

                const exam = examById.get(readString(payload?.examId, 80));
                if (!exam) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "등록된 시험을 찾을 수 없습니다.",
                    });
                    return;
                }
                if (!isExamReleased(exam)) {
                    replyAfterRoomCommit(reply, { ok: false, error: "아직 공개 전인 시험입니다." });
                    return;
                }

                const nickname = sanitizeNickname(
                    readString(payload?.nickname, ROOM_GUARDRAILS.maxNicknameLength),
                );
                if (!nickname) {
                    replyAfterRoomCommit(reply, { ok: false, error: "닉네임을 입력하세요." });
                    return;
                }

                const timeLimitSec = readPositiveSeconds(
                    payload?.timeLimitSec,
                    exam.timeLimitSec,
                    ROOM_GUARDRAILS.minTimeLimitSec,
                    ROOM_GUARDRAILS.maxTimeLimitSec,
                );
                const freezeBeforeSec = readPositiveSeconds(
                    payload?.freezeBeforeSec,
                    ROOM_GUARDRAILS.defaultFreezeBeforeSec,
                    0,
                    timeLimitSec,
                );
                if (payload?.mode === "contest") {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "콘테스트는 초대받은 계정만 이벤트 등록으로 입장할 수 있습니다.",
                    });
                    return;
                }
                const mode = normalizeRoomMode(payload?.mode);
                const maxPlayers = maxPlayersForRoomMode(mode);
                const code = await makeAvailableCode();
                const playerId = makeId();
                const socketToken = makeSocketToken();
                const firstProblemId = exam.problems[0]?.id ?? "";
                const host: PlayerState = {
                    id: playerId,
                    socketId: socket.id,
                    socketToken,
                    nickname,
                    score: 0,
                    penaltyMs: 0,
                    scoreBreakdown: { solved: 0, timeBonus: 0, difficultyBonus: 0 },
                    ready: true,
                    currentProblemId: firstProblemId,
                    consecutiveWrong: 0,
                    inventory: [],
                    itemCooldowns: {},
                    effects: [],
                    expiredEffects: [],
                    submissions: [],
                    submissionHistory: [],
                    connected: true,
                };
                const room: RoomState = {
                    code,
                    hostId: playerId,
                    exam,
                    mode,
                    maxPlayers,
                    version: 0,
                    status: "lobby",
                    timeLimitSec,
                    freezeBeforeSec,
                    itemEnabled: itemEnabledForRoomMode(mode, payload?.itemEnabled === true),
                    startedAt: null,
                    endsAt: null,
                    scoreboardFrozenAt: null,
                    frozenStandings: [],
                    scoreboardRevealCount: 0,
                    players: new Map([[playerId, host]]),
                    logs: [],
                    createdAt: Date.now(),
                    lastActivityAt: Date.now(),
                };

                rooms.set(code, room);
                roomsCreatedCounter.inc();
                socket.join(code);
                setSocketPlayer(socket, { roomCode: code, playerId, socketToken });
                socket.emit("player:you", playerId);
                addLog(
                    room,
                    "system",
                    mode === "contest"
                        ? `${nickname} 감독관이 콘테스트 방을 열었습니다.`
                        : `${nickname} 출제위원장이 방을 열었습니다.`,
                );
                const snapshot = emitRoom(room);
                replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );

    socket.on(
        "event:register",
        async (
            payload: { eventId: string; accountId?: string; nickname: string },
            reply: (response: ServerResponse<RoomPublic>) => void,
        ) => {
            await withRoomMutation("__event_register__", async () => {
                if ((await activeRoomCount()) >= ROOM_GUARDRAILS.maxActiveRooms) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "현재 등록 가능한 이벤트 방 수를 초과했습니다. 잠시 후 다시 시도하세요.",
                    });
                    return;
                }

                const eventId = readString(payload?.eventId, 80);
                const accountId = readString(payload?.accountId, 80).toLowerCase();
                const exam = examById.get(eventId);
                if (!exam) {
                    replyAfterRoomCommit(reply, { ok: false, error: "이벤트를 찾을 수 없습니다." });
                    return;
                }
                if (!isExamReleased(exam)) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "아직 등록을 시작하지 않은 이벤트입니다.",
                    });
                    return;
                }
                const openRegistration = isOpenRegistrationExam(exam);
                if (!openRegistration) {
                    if (!/^[a-z0-9._-]{3,80}$/.test(accountId)) {
                        replyAfterRoomCommit(reply, {
                            ok: false,
                            error: "계정 ID가 없으면 문제 관전만 가능합니다.",
                        });
                        return;
                    }
                    if (
                        !examCatalogPool ||
                        !(await readCampaignUserByUsername(examCatalogPool, accountId))
                    ) {
                        replyAfterRoomCommit(reply, {
                            ok: false,
                            error: "등록된 계정만 이벤트에 등록할 수 있습니다.",
                        });
                        return;
                    }
                }

                const nickname = sanitizeNickname(
                    readString(payload?.nickname, ROOM_GUARDRAILS.maxNicknameLength),
                );
                if (!nickname) {
                    replyAfterRoomCommit(reply, { ok: false, error: "닉네임을 입력하세요." });
                    return;
                }

                const code = await makeAvailableCode();
                const playerId = makeId();
                const socketToken = makeSocketToken();
                const player: PlayerState = {
                    id: playerId,
                    socketId: socket.id,
                    socketToken,
                    nickname,
                    score: 0,
                    penaltyMs: 0,
                    scoreBreakdown: { solved: 0, timeBonus: 0, difficultyBonus: 0 },
                    ready: true,
                    currentProblemId: exam.problems[0]?.id ?? "",
                    consecutiveWrong: 0,
                    inventory: [],
                    itemCooldowns: {},
                    effects: [],
                    expiredEffects: [],
                    submissions: [],
                    submissionHistory: [],
                    connected: true,
                };
                const room: RoomState = {
                    code,
                    hostId: playerId,
                    exam,
                    mode: openRegistration ? "casual" : "contest",
                    maxPlayers: maxPlayersForRoomMode(openRegistration ? "casual" : "contest"),
                    version: 0,
                    status: "lobby",
                    timeLimitSec: exam.timeLimitSec,
                    freezeBeforeSec: Math.min(
                        ROOM_GUARDRAILS.defaultFreezeBeforeSec,
                        exam.timeLimitSec,
                    ),
                    itemEnabled: false,
                    startedAt: null,
                    endsAt: null,
                    scoreboardFrozenAt: null,
                    frozenStandings: [],
                    scoreboardRevealCount: 0,
                    players: new Map([[playerId, player]]),
                    logs: [],
                    createdAt: Date.now(),
                    lastActivityAt: Date.now(),
                };

                rooms.set(code, room);
                roomsCreatedCounter.inc();
                socket.join(code);
                setSocketPlayer(socket, { roomCode: code, playerId, socketToken });
                socket.emit("player:you", playerId);
                addLog(
                    room,
                    "system",
                    openRegistration
                        ? `${nickname} 예비소집일 대기실을 열었습니다.`
                        : `${nickname} 등록 완료. virtual gym 대기실을 열었습니다.`,
                );
                const snapshot = emitRoom(room);
                replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );

    socket.on(
        "room:join",
        async (
            payload: { code: string; nickname: string },
            reply: (response: ServerResponse<RoomPublic>) => void,
        ) => {
            const code = readString(payload?.code, 8).toUpperCase();
            await withRoomMutation(code, async () => {
                const room = await getPersistedRoom(code);
                const nickname = sanitizeNickname(
                    readString(payload?.nickname, ROOM_GUARDRAILS.maxNicknameLength),
                );
                if (!room) {
                    replyAfterRoomCommit(reply, { ok: false, error: "방을 찾을 수 없습니다." });
                    return;
                }
                const joinValidation = validateRoomJoin(room);
                if (!joinValidation.ok) {
                    const error =
                        joinValidation.error === "contest-invite-only"
                            ? "콘테스트는 초대받은 계정만 등록할 수 있습니다."
                            : "이미 종료된 방입니다.";
                    replyAfterRoomCommit(reply, { ok: false, error });
                    return;
                }
                if (!nickname) {
                    replyAfterRoomCommit(reply, { ok: false, error: "닉네임을 입력하세요." });
                    return;
                }
                if (room.players.size >= room.maxPlayers) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: `입실 정원 ${room.maxPlayers}명을 초과했습니다.`,
                    });
                    return;
                }

                const playerId = makeId();
                const socketToken = makeSocketToken();
                const player: PlayerState = {
                    id: playerId,
                    socketId: socket.id,
                    socketToken,
                    nickname,
                    score: 0,
                    penaltyMs: 0,
                    scoreBreakdown: { solved: 0, timeBonus: 0, difficultyBonus: 0 },
                    ready: room.status === "playing",
                    currentProblemId: room.exam.problems[0]?.id ?? "",
                    consecutiveWrong: 0,
                    inventory: [],
                    itemCooldowns: {},
                    effects: [],
                    expiredEffects: [],
                    submissions: [],
                    submissionHistory: [],
                    connected: true,
                };
                room.players.set(playerId, player);
                playersJoinedCounter.inc();
                socket.join(code);
                setSocketPlayer(socket, { roomCode: code, playerId, socketToken });
                socket.emit("player:you", playerId);
                touchRoom(room);
                addLog(
                    room,
                    "system",
                    room.status === "playing"
                        ? `${nickname} 지각 입실. 시험지와 답안지를 받았습니다.`
                        : `${nickname} 입실. 컴싸 확인 완료.`,
                );
                const snapshot = emitRoom(room);
                replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );

    socket.on("player:ready", async (payload: { ready: boolean }) => {
        if (shouldRateLimit(socket.id, "player:ready", RATE_LIMIT_MS.ready)) return;
        const ref = socketToPlayer.get(socket.id);
        if (!ref) return;
        await withRoomMutation(ref.roomCode, async () => {
            const room = await getPersistedRoom(ref.roomCode);
            const player = room?.players.get(ref.playerId);
            if (!room || !isCurrentPlayerSocket(player, ref) || room.status !== "lobby") return;
            player.ready = payload.ready;
            touchRoom(room);
            addLog(
                room,
                "system",
                `${player.nickname}${payload.ready ? " 준비 완료" : " 준비 취소"}`,
            );
            emitRoom(room);
        });
    });

    socket.on(
        "room:start",
        async (_payload?: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
            const ref = socketToPlayer.get(socket.id);
            if (!ref) {
                replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await withRoomMutation(ref.roomCode, async () => {
                const room = await getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (
                    !room ||
                    !isCurrentPlayerSocket(player, ref) ||
                    room.hostId !== ref.playerId ||
                    room.status !== "lobby"
                ) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "방장만 로비에서 시험을 시작할 수 있습니다.",
                    });
                    return;
                }
                room.status = "playing";
                room.startedAt = Date.now();
                room.endsAt = room.startedAt + room.timeLimitSec * 1000;
                room.scoreboardFrozenAt =
                    room.freezeBeforeSec === 0
                        ? null
                        : Math.max(room.startedAt, room.endsAt - room.freezeBeforeSec * 1000);
                room.frozenStandings = [];
                room.scoreboardRevealCount = 0;
                for (const player of room.players.values()) player.ready = true;
                touchRoom(room);
                addLog(room, "system", "타종. 1교시 수학 영역을 시작합니다.");
                const snapshot = emitRoom(room);
                replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );

    socket.on(
        "room:end",
        async (_payload: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
            const ref = socketToPlayer.get(socket.id);
            if (!ref) {
                replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await withRoomMutation(ref.roomCode, async () => {
                const room = await getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (!room || !isCurrentPlayerSocket(player, ref) || room.hostId !== ref.playerId) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "방장만 시험을 종료할 수 있습니다.",
                    });
                    return;
                }
                if (room.status !== "playing") {
                    replyAfterRoomCommit(reply, { ok: false, error: "진행 중인 시험이 아닙니다." });
                    return;
                }

                const snapshot =
                    finishRoom(room, "방장이 시험을 조기 종료했습니다. 답안지를 걷습니다.") ??
                    publicRoom(room);
                replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );

    socket.on(
        "room:reveal-next",
        async (_payload: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
            if (shouldRateLimit(socket.id, "room:reveal-next", RATE_LIMIT_MS.revealNext)) {
                replyAfterRoomCommit(reply, { ok: false, error: "너무 빠르게 공개하고 있습니다." });
                return;
            }
            const ref = socketToPlayer.get(socket.id);
            if (!ref) {
                replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await withRoomMutation(ref.roomCode, async () => {
                const room = await getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (!room || !isCurrentPlayerSocket(player, ref) || room.hostId !== ref.playerId) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "방장만 순위표를 공개할 수 있습니다.",
                    });
                    return;
                }
                if (room.status !== "finished") {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "시험 종료 후 공개할 수 있습니다.",
                    });
                    return;
                }

                const total = makeScoreboardRevealState(publicRoom(room)).total;
                if (room.scoreboardRevealCount >= total) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "공개할 비공개 시도가 더 없습니다.",
                    });
                    return;
                }
                room.scoreboardRevealCount = Math.min(total, room.scoreboardRevealCount + 1);
                addLog(room, "system", "프리즈 이후 비공개 시도의 정답 여부를 한 건 공개했습니다.");
                touchRoom(room);
                const snapshot = emitRoom(room);
                replyAfterRoomCommit(reply, { ok: true, data: snapshot });
            });
        },
    );

    socket.on(
        "room:leave",
        async (_payload: unknown, reply?: (response: ServerResponse) => void) => {
            const ref = socketToPlayer.get(socket.id);
            if (!ref) {
                replyAfterRoomCommit(reply, { ok: true });
                return;
            }
            await withRoomMutation(ref.roomCode, async () => {
                const room = await getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (room && player && !isCurrentPlayerSocket(player, ref)) {
                    clearLocalSocketPlayer(socket.id);
                    replyAfterRoomCommit(reply, { ok: true });
                    return;
                }
                const action = getRoomLeaveAction(room ?? undefined, player?.id);

                if (room && player && action === "close-room") {
                    addLog(room, "system", `${player.nickname} 방장이 퇴실하여 방이 닫혔습니다.`);
                    closeLobbyRoom(room);
                } else if (room && player && action === "remove-player") {
                    removePlayerFromRoom(room, player);
                    addLog(room, "system", `${player.nickname} 퇴실.`);
                    touchRoom(room);
                    emitRoom(room);
                } else if (room && player && action === "detach-player") {
                    player.connected = false;
                    addLog(room, "system", `${player.nickname} 퇴실.`);
                    socket.leave(room.code);
                    touchRoom(room);
                    if (closeRoomIfNoConnectedPlayers(room)) {
                        clearLocalSocketPlayer(socket.id);
                        replyAfterRoomCommit(reply, { ok: true });
                        return;
                    }
                    emitRoom(room);
                }
                clearLocalSocketPlayer(socket.id);
                replyAfterRoomCommit(reply, { ok: true });
            });
        },
    );

    socket.on(
        "room:kick",
        async (
            payload: { targetPlayerId: string },
            reply?: (response: ServerResponse<RoomPublic>) => void,
        ) => {
            const ref = socketToPlayer.get(socket.id);
            if (!ref) {
                replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await withRoomMutation(ref.roomCode, async () => {
                const room = ref ? await getPersistedRoom(ref.roomCode) : undefined;
                const player = room?.players.get(ref.playerId);
                if (room && !isCurrentPlayerSocket(player, ref)) {
                    clearLocalSocketPlayer(socket.id);
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "참가자 정보를 찾을 수 없습니다.",
                    });
                    return;
                }
                const targetPlayerId = readString(payload?.targetPlayerId, 32);
                const validation = validateLobbyKick(
                    room ?? undefined,
                    ref?.playerId,
                    targetPlayerId,
                );

                if (!validation.ok) {
                    const error =
                        validation.error === "not-host"
                            ? "방장만 추방할 수 있습니다."
                            : validation.error === "not-lobby"
                              ? "로비에서만 추방할 수 있습니다."
                              : validation.error === "self-target"
                                ? "방장은 자기 자신을 추방할 수 없습니다."
                                : "추방할 참가자를 찾을 수 없습니다.";
                    replyAfterRoomCommit(reply, { ok: false, error });
                    return;
                }

                const target = room?.players.get(validation.targetPlayerId);
                if (!room || !target) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "추방할 참가자를 찾을 수 없습니다.",
                    });
                    return;
                }

                removePlayerFromRoom(room, target);
                io.to(target.socketId).emit("room:kicked", { code: room.code });
                cleanupRoomSocketsAcrossCluster({
                    roomCode: room.code,
                    playerIds: [target.id],
                    socketIds: [target.socketId],
                });
                addLog(room, "system", `${target.nickname} 추방.`);
                touchRoom(room);
                emitRoom(room);
                replyAfterRoomCommit(reply, { ok: true, data: publicRoom(room) });
            });
        },
    );

    socket.on("problem:set", async (payload: { problemId: string }) => {
        if (shouldRateLimit(socket.id, "problem:set", RATE_LIMIT_MS.problemSet)) return;
        const ref = socketToPlayer.get(socket.id);
        if (!ref) return;
        await withRoomMutation(ref.roomCode, async () => {
            const room = await getPersistedRoom(ref.roomCode);
            const player = room?.players.get(ref.playerId);
            const problemId = readString(payload?.problemId, 80);
            if (!room || !isCurrentPlayerSocket(player, ref) || !getProblem(room, problemId))
                return;
            const hasHardLock = player.effects.some(
                (effect) => effect.id === "hardFirst" && effect.expiresAt > Date.now(),
            );
            const problem = getProblem(room, problemId);
            if (hasHardLock && problem && problem.difficulty < 4) return;
            if (player.currentProblemId === problemId) return;
            player.currentProblemId = problemId;
            touchRoom(room);
            emitRoom(room);
        });
    });

    socket.on(
        "answer:submit",
        async (
            payload: { problemId: string; answer: string; idempotencyKey?: string },
            reply: (
                response: ServerResponse<{
                    correct: boolean;
                    itemAwarded: ItemId | null;
                    itemAwards: ItemAward[];
                }>,
            ) => void,
        ) => {
            const ref = socketToPlayer.get(socket.id);
            if (!ref) {
                replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await withRoomMutation(ref.roomCode, async () => {
                const room = await getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                if (!room || !isCurrentPlayerSocket(player, ref) || room.status !== "playing") {
                    replyAfterRoomCommit(reply, { ok: false, error: "진행 중인 시험이 아닙니다." });
                    return;
                }
                if (isFinished(room)) {
                    finishRoom(room);
                    replyAfterRoomCommit(reply, { ok: false, error: "시험이 종료되었습니다." });
                    return;
                }
                const problem = getProblem(room, readString(payload?.problemId, 80));
                if (!problem) {
                    replyAfterRoomCommit(reply, { ok: false, error: "문제를 찾을 수 없습니다." });
                    return;
                }
                if (
                    player.effects.some(
                        (effect) =>
                            ["penLock", "slowInput"].includes(effect.id) &&
                            effect.expiresAt > Date.now(),
                    )
                ) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "지금은 펜이 압수된 상태입니다.",
                    });
                    return;
                }

                const answer = readString(payload?.answer, 24);
                if (!answer) {
                    replyAfterRoomCommit(reply, { ok: false, error: "답안을 입력하세요." });
                    return;
                }
                const acceptedAt = Date.now();
                const correct = normalizeAnswer(answer) === normalizeAnswer(problem.answer);
                const idempotencyKey =
                    readString(payload?.idempotencyKey, 120) || makeSubmissionId();
                if (shouldRateLimit(socket.id, "answer:submit", RATE_LIMIT_MS.answerSubmit)) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "답안 제출 간격이 너무 짧습니다.",
                    });
                    return;
                }
                answersSubmittedCounter.inc({ correct: String(correct) });
                if (room.mode === "contest") {
                    contestSubmissionsCounter.inc({
                        event_id: room.exam.id,
                        correct: String(correct),
                    });
                }
                const previousCorrect = player.submissions.some(
                    (submission) => submission.problemId === problem.id && submission.correct,
                );
                const previousSubmission = player.submissions.find(
                    (submission) => submission.problemId === problem.id,
                );
                if (previousCorrect) {
                    replyAfterRoomCommit(reply, { ok: false, error: "이미 맞힌 문항입니다." });
                    return;
                }
                if (problem.answerKind === "choice" && previousSubmission) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "5지선다 문항은 한 번만 제출할 수 있습니다.",
                    });
                    return;
                }
                player.submissions = player.submissions.filter(
                    (submission) => submission.problemId !== problem.id,
                );
                const attempts = (previousSubmission?.attempts ?? 0) + 1;
                const scoreAwarded = correct && !previousCorrect ? scoreForAccepted(problem) : 0;
                const rawSubmission = {
                    problemId: problem.id,
                    answer,
                    correct,
                    submittedAt: acceptedAt,
                    scoreAwarded,
                    penaltyMs: 0,
                    attempts,
                };
                const submission = normalizeSubmissionPenalty(room, rawSubmission);

                if (room.mode === "contest") {
                    const saved = await saveContestSubmission(roomDatabase()!, {
                        id: makeSubmissionId(),
                        roomCode: room.code,
                        playerId: player.id,
                        problemId: problem.id,
                        answer,
                        submittedAt: submission.submittedAt,
                        correct: submission.correct,
                        scoreAwarded: submission.scoreAwarded,
                        penaltyMs: submission.penaltyMs,
                        attempts: submission.attempts,
                        idempotencyKey,
                    });
                    if (saved.reused) {
                        replyAfterRoomCommit(reply, {
                            ok: true,
                            data: {
                                correct: saved.submission.correct,
                                itemAwarded: null,
                                itemAwards: [],
                            },
                        });
                        return;
                    }
                    const durableSubmission = contestSubmissionToPublic(saved.submission);
                    applySubmissionToPlayer(player, durableSubmission);
                    if (durableSubmission.correct) {
                        addLog(
                            room,
                            "submit",
                            `${player.nickname} ${problem.number}번 정답 +${durableSubmission.scoreAwarded}점, 페널티 +${formatPenaltyMinutes(durableSubmission.penaltyMs)}분.`,
                        );
                    } else {
                        addLog(
                            room,
                            "submit",
                            `${player.nickname} ${problem.number}번 오답. 정답 시 오답 페널티 +${Math.round(WRONG_ANSWER_PENALTY_MS / 60000)}분, 연속 ${player.consecutiveWrong}회.`,
                        );
                    }
                    replyAfterRoomCommit(reply, {
                        ok: true,
                        data: {
                            correct: durableSubmission.correct,
                            itemAwarded: null,
                            itemAwards: [],
                        },
                    });
                    touchRoom(room);
                    emitRoom(room);
                    return;
                }

                player.submissions.push(submission);
                player.submissionHistory.push(submission);

                if (correct) {
                    if (!previousCorrect) {
                        player.score += scoreAwarded;
                        player.penaltyMs += submission.penaltyMs;
                        player.scoreBreakdown.solved += 1;
                        player.scoreBreakdown.difficultyBonus += 0;
                        player.scoreBreakdown.timeBonus += 0;
                    }
                    player.consecutiveWrong = 0;
                    const itemAwards = maybeAwardItems(room, player, problem, attempts);
                    for (const award of itemAwards) player.inventory.push(award.itemId);
                    const itemAwarded = itemAwards[0]?.itemId ?? null;
                    const itemAwardNames = itemAwards
                        .map((award) => ITEM_DEFINITIONS[award.itemId].name)
                        .join(", ");
                    addLog(
                        room,
                        "submit",
                        `${player.nickname} ${problem.number}번 정답 +${scoreAwarded}점, 페널티 +${formatPenaltyMinutes(submission.penaltyMs)}분.${itemAwards.length > 0 ? ` ${itemAwardNames} 획득.` : ""}`,
                    );
                    replyAfterRoomCommit(reply, {
                        ok: true,
                        data: { correct, itemAwarded, itemAwards },
                    });
                    touchRoom(room);
                    emitRoom(room);
                    return;
                } else {
                    player.consecutiveWrong += 1;
                    addLog(
                        room,
                        "submit",
                        `${player.nickname} ${problem.number}번 오답. 정답 시 오답 페널티 +${Math.round(WRONG_ANSWER_PENALTY_MS / 60000)}분, 연속 ${player.consecutiveWrong}회.`,
                    );
                    if (player.consecutiveWrong >= 3) {
                        const penalty = randomWeakDebuff();
                        player.effects.push(penalty);
                        player.consecutiveWrong = 0;
                        addLog(
                            room,
                            "penalty",
                            `${player.nickname} 연속 오답 벌칙: ${penalty.label}`,
                        );
                    }
                }

                replyAfterRoomCommit(reply, {
                    ok: true,
                    data: { correct, itemAwarded: null, itemAwards: [] },
                });
                touchRoom(room);
                emitRoom(room);
            });
        },
    );

    socket.on(
        "item:use",
        async (
            payload: { itemId: ItemId; targetPlayerId: string; message?: string },
            reply: (response: ServerResponse) => void,
        ) => {
            if (shouldRateLimit(socket.id, "item:use", RATE_LIMIT_MS.itemUse)) {
                replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "아이템 사용 간격이 너무 짧습니다.",
                });
                return;
            }
            const ref = socketToPlayer.get(socket.id);
            if (!ref) {
                replyAfterRoomCommit(reply, {
                    ok: false,
                    error: "참가자 정보를 찾을 수 없습니다.",
                });
                return;
            }
            await withRoomMutation(ref.roomCode, async () => {
                const room = await getPersistedRoom(ref.roomCode);
                const player = room?.players.get(ref.playerId);
                const target = room?.players.get(readString(payload?.targetPlayerId, 32));
                const itemId = readString(payload?.itemId, 32) as ItemId;
                const item = ITEM_DEFINITIONS[itemId];
                if (
                    !room ||
                    !isCurrentPlayerSocket(player, ref) ||
                    !target ||
                    room.status !== "playing" ||
                    !item ||
                    !room.itemEnabled
                ) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "아이템을 사용할 수 없습니다.",
                    });
                    return;
                }
                const index = player.inventory.indexOf(itemId);
                if (index === -1) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: "보유하지 않은 아이템입니다.",
                    });
                    return;
                }
                const readyAt = player.itemCooldowns?.[itemId] ?? 0;
                const now = Date.now();
                if (readyAt > now) {
                    replyAfterRoomCommit(reply, {
                        ok: false,
                        error: `아이템 재사용 대기 ${Math.ceil((readyAt - now) / 1000)}초 남았습니다.`,
                    });
                    return;
                }
                const targetCheck = validateItemTarget(room, itemId, player, target);
                if (!targetCheck.ok) {
                    replyAfterRoomCommit(reply, { ok: false, error: targetCheck.error });
                    return;
                }
                const existingEffect = activeEffectForItem(target, itemId);
                const effect: ActiveEffect = existingEffect ?? {
                    id: item.id,
                    label: item.name,
                    sourceName: player.nickname,
                    expiresAt: now + item.lifecycle.durationMs,
                };
                if (existingEffect) {
                    existingEffect.label = item.name;
                    existingEffect.sourceName = player.nickname;
                    existingEffect.expiresAt = now + item.lifecycle.durationMs;
                    delete existingEffect.message;
                    delete existingEffect.problemNumber;
                }
                if (item.effectKind === "adviceNote") {
                    const problem = findAdviceNoteProblem(room, player, target);
                    if (!problem) {
                        replyAfterRoomCommit(reply, {
                            ok: false,
                            error: "내가 맞혔고 대상이 아직 못 맞힌 문제가 필요합니다.",
                        });
                        return;
                    }
                    effect.problemNumber = problem.number;
                    const messageMeta = item.payload?.message;
                    effect.message =
                        readString(payload?.message, messageMeta?.maxLength ?? 72) ||
                        `${problem.number}번은 생각보다 쉽던데?`;
                }
                player.inventory.splice(index, 1);
                if (item.lifecycle.cooldownMs > 0) {
                    player.itemCooldowns = {
                        ...(player.itemCooldowns ?? {}),
                        [itemId]: now + item.lifecycle.cooldownMs,
                    };
                }
                target.expiredEffects = (target.expiredEffects ?? []).filter(
                    (expiredEffect) => expiredEffect.id !== itemId,
                );
                if (!existingEffect) target.effects.push(effect);
                addLog(room, "item", `${player.nickname} -> ${target.nickname}: ${item.name}`);
                replyAfterRoomCommit(reply, { ok: true });
                touchRoom(room);
                emitRoom(room);
            });
        },
    );

    socket.on("disconnect", async () => {
        socketEventTimestamps.delete(socket.id);
        const ref = socketToPlayer.get(socket.id);
        if (!ref) return;
        await withRoomMutation(ref.roomCode, async () => {
            const room = await getPersistedRoom(ref.roomCode);
            const player = room?.players.get(ref.playerId);
            if (!room || !player) {
                clearLocalSocketPlayer(socket.id);
                return;
            }
            if (!isCurrentPlayerSocket(player, ref)) {
                clearLocalSocketPlayer(socket.id);
                return;
            }
            player.connected = false;
            clearLocalSocketPlayer(socket.id);
            addLog(room, "system", `${player.nickname} 연결 끊김.`);
            touchRoom(room);
            if (closeRoomIfNoConnectedPlayers(room)) return;
            emitRoom(room);
        });
    });
});

const startServer = async () => {
    await refreshExamCatalog();
    await restoreRoomsFromDatabase();
    await configureSocketAdapter();
    httpServer.listen(port, () => {
        console.log(`KICE arena server listening on http://localhost:${port}`);
    });
};

const shutdown = async () => {
    await Promise.all(
        [redisClients?.pubClient.quit(), redisClients?.subClient.quit()].filter(Boolean),
    );
    await examCatalogPool?.end();
    process.exit(0);
};

process.once("SIGINT", () => {
    void shutdown();
});
process.once("SIGTERM", () => {
    void shutdown();
});

startServer().catch((error) => {
    console.error("Unable to start KICE arena server.", error);
    process.exit(1);
});
