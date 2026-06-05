import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ActiveEffect,
  type ArenaLog,
  ITEM_DEFINITIONS,
  type ItemAward,
  type ItemId,
  type ProblemManifest,
  type RoomPublic,
  ROOM_GUARDRAILS,
  type ServerResponse,
  WRONG_ANSWER_PENALTY_MS,
  normalizeAnswer
} from "../shared/game.js";
import { sanitizeNickname } from "../shared/nickname.js";
import { makeScoreboardRevealState } from "../shared/reveal.js";
import { getRoomLeaveAction, shouldCloseRoomForNoConnectedPlayers, validateLobbyKick, validateRoomJoin } from "../shared/roomLifecycle.js";
import { runtimeMetricSamples, summarizeRoomMetrics } from "../shared/runtimeMetrics.js";
import { isExamReleased, readExams, toExamPublic, toExamSummary } from "./exams.js";
import { activeEffectForItem, cleanupEffects, findAdviceNoteProblem, maybeAwardItems, randomWeakDebuff, validateItemTarget } from "./items.js";
import { shouldRateLimit as shouldRateLimitEvent } from "./rateLimit.js";
import { derivePlayerScoreState, formatPenaltyMinutes, makeStandings, normalizeSubmissionPenalty, scoreForAccepted } from "./scoring.js";
import type { PlayerState, RoomState } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const examsDir = path.join(__dirname, "exams");
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
    credentials: true
  },
  maxHttpBufferSize: 8 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000
});

const rooms = new Map<string, RoomState>();
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();
const socketEventTimestamps = new Map<string, Map<string, number>>();
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
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;

  const octets = normalized.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
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

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "kice_arena_"
});

const runtimeMetricsInfoGauge = new Gauge({
  name: "kice_arena_runtime_metrics_info",
  help: "Stable heartbeat emitted by the KICE Arena runtime metrics collector.",
  labelNames: ["service"],
  registers: [metricsRegistry]
});

const runtimeMetricsLastSuccessGauge = new Gauge({
  name: "kice_arena_runtime_metrics_last_success_unixtime",
  help: "Unix timestamp of the most recent successful runtime metrics collection.",
  labelNames: ["service"],
  registers: [metricsRegistry]
});

const roomsTotalGauge = new Gauge({
  name: "kice_arena_rooms_total",
  help: "Current total rooms held in memory.",
  registers: [metricsRegistry]
});

const activeRoomsGauge = new Gauge({
  name: "kice_arena_rooms_active",
  help: "Current rooms that are not finished.",
  registers: [metricsRegistry]
});

const roomsByStatusGauge = new Gauge({
  name: "kice_arena_rooms_by_status",
  help: "Current rooms grouped by status.",
  labelNames: ["status"],
  registers: [metricsRegistry]
});

const roomExpirySecondsGauge = new Gauge({
  name: "kice_arena_room_expiry_seconds",
  help: "Seconds until rooms finish or become eligible for cleanup.",
  labelNames: ["stat"],
  registers: [metricsRegistry]
});

const playingRoomTimeRemainingSecondsGauge = new Gauge({
  name: "kice_arena_playing_room_time_remaining_seconds",
  help: "Seconds until playing rooms naturally finish.",
  labelNames: ["stat"],
  registers: [metricsRegistry]
});

const playersGauge = new Gauge({
  name: "kice_arena_players",
  help: "Current player counts.",
  labelNames: ["state"],
  registers: [metricsRegistry]
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
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_players_per_active_room",
    new Gauge({
      name: "kice_arena_players_per_active_room",
      help: "Average players per non-finished room by player state.",
      labelNames: ["state"],
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_rooms_empty_lobby",
    new Gauge({
      name: "kice_arena_rooms_empty_lobby",
      help: "Lobby rooms with no tracked players. High values point to lobby cleanup pressure.",
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_rooms_disconnected_lobby",
    new Gauge({
      name: "kice_arena_rooms_disconnected_lobby",
      help: "Lobby rooms that still have tracked players but no connected players.",
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_rooms_partially_disconnected",
    new Gauge({
      name: "kice_arena_rooms_partially_disconnected",
      help: "Active rooms where at least one, but not all, tracked players are disconnected.",
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_rooms_zombie_playing",
    new Gauge({
      name: "kice_arena_rooms_zombie_playing",
      help: "Playing rooms with no connected players. This is usually a stale game-session signal.",
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_rooms_player_count_mismatch",
    new Gauge({
      name: "kice_arena_rooms_player_count_mismatch",
      help: "Rooms whose connected player count is negative, exceeds total players, or total players is negative.",
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_rooms_expiring_soon",
    new Gauge({
      name: "kice_arena_rooms_expiring_soon",
      help: "Rooms whose finish or cleanup deadline is inside the expiringSoonMs window.",
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_rooms_expired",
    new Gauge({
      name: "kice_arena_rooms_expired",
      help: "Rooms whose finish or cleanup deadline has passed but are still present in memory.",
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_room_expiry_overdue_seconds",
    new Gauge({
      name: "kice_arena_room_expiry_overdue_seconds",
      help: "How long expired rooms have remained in memory after their deadline.",
      labelNames: ["stat"],
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_room_disconnect_risk_score",
    new Gauge({
      name: "kice_arena_room_disconnect_risk_score",
      help: "Weighted active-room disconnect risk score. Value range: 0..1.",
      registers: [metricsRegistry]
    })
  ],
  [
    "kice_arena_room_cleanup_pressure_score",
    new Gauge({
      name: "kice_arena_room_cleanup_pressure_score",
      help: "Weighted room cleanup pressure score. Value range: 0..1.",
      registers: [metricsRegistry]
    })
  ]
]);

const socketConnectionsGauge = new Gauge({
  name: "kice_arena_socket_connections",
  help: "Current Socket.IO connections.",
  registers: [metricsRegistry]
});

const registeredSocketConnectionsGauge = new Gauge({
  name: "kice_arena_registered_socket_connections",
  help: "Current Socket.IO connections associated with a tracked room player.",
  registers: [metricsRegistry]
});

const roomsCreatedCounter = new Counter({
  name: "kice_arena_rooms_created_total",
  help: "Total rooms created since server start.",
  registers: [metricsRegistry]
});

const playersJoinedCounter = new Counter({
  name: "kice_arena_players_joined_total",
  help: "Total non-host players joined since server start.",
  registers: [metricsRegistry]
});

const answersSubmittedCounter = new Counter({
  name: "kice_arena_answers_submitted_total",
  help: "Total answer submissions since server start, labeled by correctness.",
  labelNames: ["correct"],
  registers: [metricsRegistry]
});

const httpRequestDurationSeconds = new Histogram({
  name: "kice_arena_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "path", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

const ROOM_TTL = {
  emptyLobbyMs: 10 * 60 * 1000,
  disconnectedLobbyMs: 30 * 60 * 1000,
  finishedMs: 30 * 60 * 1000
} as const;

const RATE_LIMIT_MS = {
  ready: 200,
  problemSet: 150,
  answerSubmit: 500,
  itemUse: 300,
  revealNext: 250
} as const;

const exams = readExams(examsDir);
const examById = new Map(exams.map((exam) => [exam.id, exam]));

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

const makeId = () => Math.random().toString(36).slice(2, 10);

const addLog = (room: RoomState, kind: ArenaLog["kind"], message: string) => {
  room.logs.unshift({ id: makeId(), kind, message, createdAt: Date.now() });
  room.logs = room.logs.slice(0, 24);
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const readPositiveSeconds = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return Math.round(clampNumber(fallback, min, max));
  return Math.round(clampNumber(numeric, min, max));
};

const readString = (value: unknown, maxLength: number) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const activeRoomCount = () => [...rooms.values()].filter((room) => room.status !== "finished").length;

const updateRuntimeMetrics = () => {
  const now = Date.now();
  const summary = summarizeRoomMetrics(
    [...rooms.values()].map((room) => ({
      status: room.status,
      endsAt: room.endsAt,
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
      playerCount: room.players.size,
      connectedPlayerCount: [...room.players.values()].filter((player) => player.connected).length
    })),
    now,
    ROOM_TTL
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

const deleteRoom = (room: RoomState) => {
  for (const player of room.players.values()) {
    socketToPlayer.delete(player.socketId);
    io.sockets.sockets.get(player.socketId)?.leave(room.code);
  }
  rooms.delete(room.code);
};

const removePlayerFromRoom = (room: RoomState, player: PlayerState) => {
  room.players.delete(player.id);
  socketToPlayer.delete(player.socketId);
  io.sockets.sockets.get(player.socketId)?.leave(room.code);
};

const closeLobbyRoom = (room: RoomState) => {
  io.to(room.code).emit("room:closed", { code: room.code });
  deleteRoom(room);
};

const closeRoomIfNoConnectedPlayers = (room: RoomState) => {
  if (!shouldCloseRoomForNoConnectedPlayers(room.players.values())) return false;
  io.to(room.code).emit("room:closed", { code: room.code });
  deleteRoom(room);
  return true;
};

const shouldRateLimit = (socketId: string, eventName: string, minIntervalMs: number) => {
  return shouldRateLimitEvent(socketEventTimestamps, socketId, eventName, minIntervalMs);
};

const isScoreboardFrozen = (room: RoomState) =>
  room.status === "playing" && room.scoreboardFrozenAt !== null && Date.now() >= room.scoreboardFrozenAt;

const maybeFreezeScoreboard = (room: RoomState) => {
  if (!isScoreboardFrozen(room) || room.frozenStandings.length > 0) return false;
  room.frozenStandings = makeStandings(room);
  addLog(room, "system", `종료 ${Math.round(room.freezeBeforeSec / 60)}분 전. 순위표가 비공개 처리되었습니다.`);
  touchRoom(room);
  return true;
};

const publicRoom = (room: RoomState): RoomPublic => ({
  code: room.code,
  hostId: room.hostId,
  exam: toExamPublic(room.exam),
  status: room.status,
  timeLimitSec: room.timeLimitSec,
  freezeBeforeSec: room.freezeBeforeSec,
  itemEnabled: room.itemEnabled,
  startedAt: room.startedAt,
  endsAt: room.endsAt,
  scoreboardFrozen: isScoreboardFrozen(room),
  scoreboardFrozenAt: room.scoreboardFrozenAt,
  frozenStandings: room.frozenStandings.length > 0 ? makeStandings(room, [...room.players.values()], room.scoreboardFrozenAt) : room.frozenStandings,
  scoreboardRevealCount: room.scoreboardRevealCount,
  players: [...room.players.values()].map(({ socketId: _socketId, ...player }) => {
    const derived = derivePlayerScoreState(room, player);
    return {
      ...player,
      score: derived.score,
      penaltyMs: derived.penaltyMs,
      scoreBreakdown: {
        ...player.scoreBreakdown,
        solved: derived.solved
      },
      submissions: derived.normalizedSubmissions,
      submissionHistory: (player.submissionHistory ?? player.submissions).map((submission) => normalizeSubmissionPenalty(room, submission)),
      itemCooldowns: player.itemCooldowns ?? {},
      effects: player.effects.filter((effect) => effect.expiresAt > Date.now()),
      expiredEffects: (player.expiredEffects ?? []).filter((effect) => Date.now() - effect.clearedAt <= EXPIRED_EFFECT_NOTICE_MS)
    };
  }),
  logs: room.logs
});

const emitRoom = (room: RoomState) => {
  maybeFreezeScoreboard(room);
  io.to(room.code).emit("room:update", publicRoom(room));
};

const isFinished = (room: RoomState) =>
  room.status === "playing" && room.endsAt !== null && Date.now() >= room.endsAt;

const finishRoom = (room: RoomState, reason = "시험 종료. 답안지를 걷습니다.") => {
  if (room.status !== "playing") return;
  maybeFreezeScoreboard(room);
  if (room.frozenStandings.length === 0) room.frozenStandings = makeStandings(room);
  room.scoreboardRevealCount = 0;
  room.status = "finished";
  touchRoom(room);
  addLog(room, "system", "채점 완료. 프리즈 이후 비공개 시도 공개를 시작합니다.");
  addLog(room, "system", reason);
  emitRoom(room);
};

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const effectsChanged = cleanupEffects(room, now, EXPIRED_EFFECT_NOTICE_MS);
    if (isFinished(room)) finishRoom(room);
    else if (maybeFreezeScoreboard(room)) emitRoom(room);
    else if (effectsChanged) emitRoom(room);

    const hasConnectedPlayers = [...room.players.values()].some((player) => player.connected);
    const shouldDelete =
      (room.status === "finished" && now - room.lastActivityAt > ROOM_TTL.finishedMs) ||
      (room.status === "lobby" && room.players.size === 0 && now - room.createdAt > ROOM_TTL.emptyLobbyMs) ||
      (room.status === "lobby" && !hasConnectedPlayers && now - room.lastActivityAt > ROOM_TTL.disconnectedLobbyMs);
    if (shouldDelete) deleteRoom(room);
  }
}, 1000);

app.use((req, res, next) => {
  const endTimer = httpRequestDurationSeconds.startTimer({
    method: req.method,
    path: req.path
  });
  res.on("finish", () => {
    endTimer({ status: String(res.statusCode) });
  });
  next();
});

app.use("/exams/:examId", (req, res, next) => {
  const exam = examById.get(readString(req.params.examId, 80));
  if (exam && !isExamReleased(exam)) {
    res.sendStatus(404);
    return;
  }
  next();
});

app.use("/exams", express.static(examsDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, exams: exams.length });
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

app.get("/api/rooms/:code", (req, res) => {
  const code = readString(req.params.code, 8).toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    res.json({ exists: false });
    return;
  }
  res.json({
    exists: true,
    status: room.status,
    playerCount: room.players.size,
    connectedPlayerCount: [...room.players.values()].filter((player) => player.connected).length
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
  socket.on("room:rejoin", (payload: { code: string; playerId: string }, reply: (response: ServerResponse<RoomPublic>) => void) => {
    const code = readString(payload?.code, 8).toUpperCase();
    const room = rooms.get(code);
    const player = room?.players.get(readString(payload?.playerId, 32));
    if (!room || !player) {
      reply({ ok: false, error: "이전에 입실했던 방을 찾을 수 없습니다." });
      return;
    }

    const previousSocketId = player.socketId;
    player.socketId = socket.id;
    player.connected = true;
    io.sockets.sockets.get(previousSocketId)?.leave(code);
    socket.join(code);
    socketToPlayer.delete(previousSocketId);
    socketToPlayer.set(socket.id, { roomCode: code, playerId: player.id });
    touchRoom(room);
    socket.emit("player:you", player.id);
    addLog(room, "system", `${player.nickname} 재입실. 기존 수험번호를 복구했습니다.`);
    reply({ ok: true, data: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:create", (payload: { examId: string; nickname: string; timeLimitSec?: number; freezeBeforeSec?: number; itemEnabled: boolean }, reply: (response: ServerResponse<RoomPublic>) => void) => {
    if (activeRoomCount() >= ROOM_GUARDRAILS.maxActiveRooms) {
      reply({ ok: false, error: "현재 생성 가능한 방 수를 초과했습니다. 잠시 후 다시 시도하세요." });
      return;
    }

    const exam = examById.get(readString(payload?.examId, 80));
    if (!exam) {
      reply({ ok: false, error: "등록된 시험을 찾을 수 없습니다." });
      return;
    }
    if (!isExamReleased(exam)) {
      reply({ ok: false, error: "아직 공개 전인 시험입니다." });
      return;
    }

    const nickname = sanitizeNickname(readString(payload?.nickname, ROOM_GUARDRAILS.maxNicknameLength));
    if (!nickname) {
      reply({ ok: false, error: "닉네임을 입력하세요." });
      return;
    }

    const timeLimitSec = readPositiveSeconds(payload?.timeLimitSec, exam.timeLimitSec, ROOM_GUARDRAILS.minTimeLimitSec, ROOM_GUARDRAILS.maxTimeLimitSec);
    const freezeBeforeSec = readPositiveSeconds(payload?.freezeBeforeSec, ROOM_GUARDRAILS.defaultFreezeBeforeSec, 0, timeLimitSec);
    const code = makeCode();
    const playerId = makeId();
    const firstProblemId = exam.problems[0]?.id ?? "";
    const host: PlayerState = {
      id: playerId,
      socketId: socket.id,
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
      connected: true
    };
    const room: RoomState = {
      code,
      hostId: playerId,
      exam,
      status: "lobby",
      timeLimitSec,
      freezeBeforeSec,
      itemEnabled: payload?.itemEnabled === true,
      startedAt: null,
      endsAt: null,
      scoreboardFrozenAt: null,
      frozenStandings: [],
      scoreboardRevealCount: 0,
      players: new Map([[playerId, host]]),
      logs: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };

    rooms.set(code, room);
    roomsCreatedCounter.inc();
    socket.join(code);
    socketToPlayer.set(socket.id, { roomCode: code, playerId });
    socket.emit("player:you", playerId);
    addLog(room, "system", `${nickname} 출제위원장이 방을 열었습니다.`);
    reply({ ok: true, data: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:join", (payload: { code: string; nickname: string }, reply: (response: ServerResponse<RoomPublic>) => void) => {
    const code = readString(payload?.code, 8).toUpperCase();
    const room = rooms.get(code);
    const nickname = sanitizeNickname(readString(payload?.nickname, ROOM_GUARDRAILS.maxNicknameLength));
    if (!room) {
      reply({ ok: false, error: "방을 찾을 수 없습니다." });
      return;
    }
    const joinValidation = validateRoomJoin(room);
    if (!joinValidation.ok) {
      reply({ ok: false, error: "이미 종료된 방입니다." });
      return;
    }
    if (!nickname) {
      reply({ ok: false, error: "닉네임을 입력하세요." });
      return;
    }
    if (room.players.size >= ROOM_GUARDRAILS.maxPlayersPerRoom) {
      reply({ ok: false, error: `입실 정원 ${ROOM_GUARDRAILS.maxPlayersPerRoom}명을 초과했습니다.` });
      return;
    }

    const playerId = makeId();
    const player: PlayerState = {
      id: playerId,
      socketId: socket.id,
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
      connected: true
    };
    room.players.set(playerId, player);
    playersJoinedCounter.inc();
    socket.join(code);
    socketToPlayer.set(socket.id, { roomCode: code, playerId });
    socket.emit("player:you", playerId);
    touchRoom(room);
    addLog(room, "system", room.status === "playing" ? `${nickname} 지각 입실. 시험지와 답안지를 받았습니다.` : `${nickname} 입실. 컴싸 확인 완료.`);
    reply({ ok: true, data: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("player:ready", (payload: { ready: boolean }) => {
    if (shouldRateLimit(socket.id, "player:ready", RATE_LIMIT_MS.ready)) return;
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    if (!room || !player || room.status !== "lobby") return;
    player.ready = payload.ready;
    touchRoom(room);
    addLog(room, "system", `${player.nickname}${payload.ready ? " 준비 완료" : " 준비 취소"}`);
    emitRoom(room);
  });

  socket.on("room:start", () => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.roomCode);
    if (!room || room.hostId !== ref.playerId || room.status !== "lobby") return;
    room.status = "playing";
    room.startedAt = Date.now();
    room.endsAt = room.startedAt + room.timeLimitSec * 1000;
    room.scoreboardFrozenAt = room.freezeBeforeSec === 0 ? null : Math.max(room.startedAt, room.endsAt - room.freezeBeforeSec * 1000);
    room.frozenStandings = [];
    room.scoreboardRevealCount = 0;
    for (const player of room.players.values()) player.ready = true;
    touchRoom(room);
    addLog(room, "system", "타종. 1교시 수학 영역을 시작합니다.");
    emitRoom(room);
  });

  socket.on("room:end", (_payload: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) {
      reply?.({ ok: false, error: "참가자 정보를 찾을 수 없습니다." });
      return;
    }
    const room = rooms.get(ref.roomCode);
    if (!room || room.hostId !== ref.playerId) {
      reply?.({ ok: false, error: "방장만 시험을 종료할 수 있습니다." });
      return;
    }
    if (room.status !== "playing") {
      reply?.({ ok: false, error: "진행 중인 시험이 아닙니다." });
      return;
    }

    finishRoom(room, "방장이 시험을 조기 종료했습니다. 답안지를 걷습니다.");
    touchRoom(room);
    reply?.({ ok: true, data: publicRoom(room) });
  });

  socket.on("room:reveal-next", (_payload: unknown, reply?: (response: ServerResponse<RoomPublic>) => void) => {
    if (shouldRateLimit(socket.id, "room:reveal-next", RATE_LIMIT_MS.revealNext)) {
      reply?.({ ok: false, error: "너무 빠르게 공개하고 있습니다." });
      return;
    }
    const ref = socketToPlayer.get(socket.id);
    if (!ref) {
      reply?.({ ok: false, error: "참가자 정보를 찾을 수 없습니다." });
      return;
    }
    const room = rooms.get(ref.roomCode);
    if (!room || room.hostId !== ref.playerId) {
      reply?.({ ok: false, error: "방장만 순위표를 공개할 수 있습니다." });
      return;
    }
    if (room.status !== "finished") {
      reply?.({ ok: false, error: "시험 종료 후 공개할 수 있습니다." });
      return;
    }

    const total = makeScoreboardRevealState(publicRoom(room)).total;
    if (room.scoreboardRevealCount >= total) {
      reply?.({ ok: false, error: "공개할 비공개 시도가 더 없습니다." });
      return;
    }
    room.scoreboardRevealCount = Math.min(total, room.scoreboardRevealCount + 1);
    addLog(room, "system", "프리즈 이후 비공개 시도의 정답 여부를 한 건 공개했습니다.");
    touchRoom(room);
    emitRoom(room);
    reply?.({ ok: true, data: publicRoom(room) });
  });

  socket.on("room:leave", (_payload: unknown, reply?: (response: ServerResponse) => void) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) {
      reply?.({ ok: true });
      return;
    }
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    const action = getRoomLeaveAction(room, player?.id);

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
        socketToPlayer.delete(socket.id);
        reply?.({ ok: true });
        return;
      }
      emitRoom(room);
    }
    socketToPlayer.delete(socket.id);
    reply?.({ ok: true });
  });

  socket.on("room:kick", (payload: { targetPlayerId: string }, reply?: (response: ServerResponse<RoomPublic>) => void) => {
    const ref = socketToPlayer.get(socket.id);
    const room = ref ? rooms.get(ref.roomCode) : undefined;
    const targetPlayerId = readString(payload?.targetPlayerId, 32);
    const validation = validateLobbyKick(room, ref?.playerId, targetPlayerId);

    if (!validation.ok) {
      const error =
        validation.error === "not-host"
          ? "방장만 추방할 수 있습니다."
          : validation.error === "not-lobby"
            ? "로비에서만 추방할 수 있습니다."
            : validation.error === "self-target"
              ? "방장은 자기 자신을 추방할 수 없습니다."
              : "추방할 참가자를 찾을 수 없습니다.";
      reply?.({ ok: false, error });
      return;
    }

    const target = room?.players.get(validation.targetPlayerId);
    if (!room || !target) {
      reply?.({ ok: false, error: "추방할 참가자를 찾을 수 없습니다." });
      return;
    }

    removePlayerFromRoom(room, target);
    io.sockets.sockets.get(target.socketId)?.emit("room:kicked", { code: room.code });
    addLog(room, "system", `${target.nickname} 추방.`);
    touchRoom(room);
    emitRoom(room);
    reply?.({ ok: true, data: publicRoom(room) });
  });

  socket.on("problem:set", (payload: { problemId: string }) => {
    if (shouldRateLimit(socket.id, "problem:set", RATE_LIMIT_MS.problemSet)) return;
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    const problemId = readString(payload?.problemId, 80);
    if (!room || !player || !getProblem(room, problemId)) return;
    const hasHardLock = player.effects.some((effect) => effect.id === "hardFirst" && effect.expiresAt > Date.now());
    const problem = getProblem(room, problemId);
    if (hasHardLock && problem && problem.difficulty < 4) return;
    if (player.currentProblemId === problemId) return;
    player.currentProblemId = problemId;
    touchRoom(room);
    emitRoom(room);
  });

  socket.on("answer:submit", (payload: { problemId: string; answer: string }, reply: (response: ServerResponse<{ correct: boolean; itemAwarded: ItemId | null; itemAwards: ItemAward[] }>) => void) => {
    if (shouldRateLimit(socket.id, "answer:submit", RATE_LIMIT_MS.answerSubmit)) {
      reply({ ok: false, error: "답안 제출 간격이 너무 짧습니다." });
      return;
    }
    const ref = socketToPlayer.get(socket.id);
    if (!ref) {
      reply({ ok: false, error: "참가자 정보를 찾을 수 없습니다." });
      return;
    }
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    if (!room || !player || room.status !== "playing") {
      reply({ ok: false, error: "진행 중인 시험이 아닙니다." });
      return;
    }
    if (isFinished(room)) {
      finishRoom(room);
      reply({ ok: false, error: "시험이 종료되었습니다." });
      return;
    }
    const problem = getProblem(room, readString(payload?.problemId, 80));
    if (!problem) {
      reply({ ok: false, error: "문제를 찾을 수 없습니다." });
      return;
    }
    if (player.effects.some((effect) => ["penLock", "slowInput"].includes(effect.id) && effect.expiresAt > Date.now())) {
      reply({ ok: false, error: "지금은 펜이 압수된 상태입니다." });
      return;
    }

    const answer = readString(payload?.answer, 24);
    if (!answer) {
      reply({ ok: false, error: "답안을 입력하세요." });
      return;
    }
    const acceptedAt = Date.now();
    const correct = normalizeAnswer(answer) === normalizeAnswer(problem.answer);
    answersSubmittedCounter.inc({ correct: String(correct) });
    const previousCorrect = player.submissions.some((submission) => submission.problemId === problem.id && submission.correct);
    const previousSubmission = player.submissions.find((submission) => submission.problemId === problem.id);
    if (previousCorrect) {
      reply({ ok: false, error: "이미 맞힌 문항입니다." });
      return;
    }
    if (problem.answerKind === "choice" && previousSubmission) {
      reply({ ok: false, error: "5지선다 문항은 한 번만 제출할 수 있습니다." });
      return;
    }
    player.submissions = player.submissions.filter((submission) => submission.problemId !== problem.id);
    const attempts = (previousSubmission?.attempts ?? 0) + 1;
    const elapsedMs = Math.max(0, acceptedAt - (room.startedAt ?? acceptedAt));
    const scoreAwarded = correct && !previousCorrect ? scoreForAccepted(problem) : 0;
    const rawSubmission = { problemId: problem.id, answer, correct, submittedAt: acceptedAt, scoreAwarded, penaltyMs: 0, attempts };
    const submission = normalizeSubmissionPenalty(room, rawSubmission);
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
      const itemAwardNames = itemAwards.map((award) => ITEM_DEFINITIONS[award.itemId].name).join(", ");
      addLog(
        room,
        "submit",
        `${player.nickname} ${problem.number}번 정답 +${scoreAwarded}점, 페널티 +${formatPenaltyMinutes(submission.penaltyMs)}분.${itemAwards.length > 0 ? ` ${itemAwardNames} 획득.` : ""}`
      );
      reply({ ok: true, data: { correct, itemAwarded, itemAwards } });
      touchRoom(room);
      emitRoom(room);
      return;
    } else {
      player.consecutiveWrong += 1;
      addLog(room, "submit", `${player.nickname} ${problem.number}번 오답. 정답 시 오답 페널티 +${Math.round(WRONG_ANSWER_PENALTY_MS / 60000)}분, 연속 ${player.consecutiveWrong}회.`);
      if (player.consecutiveWrong >= 3) {
        const penalty = randomWeakDebuff();
        player.effects.push(penalty);
        player.consecutiveWrong = 0;
        addLog(room, "penalty", `${player.nickname} 연속 오답 벌칙: ${penalty.label}`);
      }
    }

    reply({ ok: true, data: { correct, itemAwarded: null, itemAwards: [] } });
    touchRoom(room);
    emitRoom(room);
  });

  socket.on("item:use", (payload: { itemId: ItemId; targetPlayerId: string; message?: string }, reply: (response: ServerResponse) => void) => {
    if (shouldRateLimit(socket.id, "item:use", RATE_LIMIT_MS.itemUse)) {
      reply({ ok: false, error: "아이템 사용 간격이 너무 짧습니다." });
      return;
    }
    const ref = socketToPlayer.get(socket.id);
    if (!ref) {
      reply({ ok: false, error: "참가자 정보를 찾을 수 없습니다." });
      return;
    }
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    const target = room?.players.get(readString(payload?.targetPlayerId, 32));
    const itemId = readString(payload?.itemId, 32) as ItemId;
    const item = ITEM_DEFINITIONS[itemId];
    if (!room || !player || !target || room.status !== "playing" || !item) {
      reply({ ok: false, error: "아이템을 사용할 수 없습니다." });
      return;
    }
    const index = player.inventory.indexOf(itemId);
    if (index === -1) {
      reply({ ok: false, error: "보유하지 않은 아이템입니다." });
      return;
    }
    const readyAt = player.itemCooldowns?.[itemId] ?? 0;
    const now = Date.now();
    if (readyAt > now) {
      reply({ ok: false, error: `아이템 재사용 대기 ${Math.ceil((readyAt - now) / 1000)}초 남았습니다.` });
      return;
    }
    const targetCheck = validateItemTarget(room, itemId, player, target);
    if (!targetCheck.ok) {
      reply({ ok: false, error: targetCheck.error });
      return;
    }
    const existingEffect = activeEffectForItem(target, itemId);
    const effect: ActiveEffect = existingEffect ?? {
      id: item.id,
      label: item.name,
      sourceName: player.nickname,
      expiresAt: now + item.lifecycle.durationMs
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
        reply({ ok: false, error: "내가 맞혔고 대상이 아직 못 맞힌 문제가 필요합니다." });
        return;
      }
      effect.problemNumber = problem.number;
      const messageMeta = item.payload?.message;
      effect.message = readString(payload?.message, messageMeta?.maxLength ?? 72) || `${problem.number}번은 생각보다 쉽던데?`;
    }
    player.inventory.splice(index, 1);
    if (item.lifecycle.cooldownMs > 0) {
      player.itemCooldowns = {
        ...(player.itemCooldowns ?? {}),
        [itemId]: now + item.lifecycle.cooldownMs
      };
    }
    target.expiredEffects = (target.expiredEffects ?? []).filter((expiredEffect) => expiredEffect.id !== itemId);
    if (!existingEffect) target.effects.push(effect);
    addLog(room, "item", `${player.nickname} -> ${target.nickname}: ${item.name}`);
    reply({ ok: true });
    touchRoom(room);
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    socketEventTimestamps.delete(socket.id);
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    if (!room || !player) return;
    player.connected = false;
    socketToPlayer.delete(socket.id);
    addLog(room, "system", `${player.nickname} 연결 끊김.`);
    touchRoom(room);
    if (closeRoomIfNoConnectedPlayers(room)) return;
    emitRoom(room);
  });
});

httpServer.listen(port, () => {
  console.log(`KICE arena server listening on http://localhost:${port}`);
});
