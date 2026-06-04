import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ActiveEffect,
  type ArenaLog,
  type ExamManifest,
  type ExamPublic,
  type ExamSummary,
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemAward,
  type ItemId,
  type PlayerPublic,
  type ProblemManifest,
  type RoomPublic,
  ROOM_GUARDRAILS,
  type ServerResponse,
  type StandingPublic,
  WRONG_ANSWER_PENALTY_MS,
  getProblemPointValue,
  normalizeAnswer
} from "../shared/game.js";
import { makeScoreboardRevealState } from "../shared/reveal.js";
import { summarizeRoomMetrics } from "../shared/runtimeMetrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const examsDir = path.join(__dirname, "exams");
const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

interface PlayerState extends PlayerPublic {
  socketId: string;
}

interface RoomState {
  code: string;
  hostId: string;
  exam: ExamManifest;
  status: RoomPublic["status"];
  timeLimitSec: number;
  freezeBeforeSec: number;
  itemEnabled: boolean;
  startedAt: number | null;
  endsAt: number | null;
  scoreboardFrozenAt: number | null;
  frozenStandings: StandingPublic[];
  scoreboardRevealCount: number;
  players: Map<string, PlayerState>;
  logs: ArenaLog[];
  createdAt: number;
  lastActivityAt: number;
}

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

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "kice_arena_"
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

const socketConnectionsGauge = new Gauge({
  name: "kice_arena_socket_connections",
  help: "Current Socket.IO connections.",
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

const readExams = (): ExamManifest[] => {
  if (!fs.existsSync(examsDir)) return [];

  return fs
    .readdirSync(examsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(examsDir, entry.name, "manifest.json")))
    .map((entry) => {
      const manifestPath = path.join(examsDir, entry.name, "manifest.json");
      return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ExamManifest;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
};

const exams = readExams();
const examById = new Map(exams.map((exam) => [exam.id, exam]));

const isExamReleased = (exam: ExamManifest, now = Date.now()) => {
  if (!exam.releaseAt) return true;
  const releaseAt = Date.parse(exam.releaseAt);
  return !Number.isFinite(releaseAt) || now >= releaseAt;
};

const toExamSummary = (exam: ExamManifest): ExamSummary => ({
  id: exam.id,
  title: exam.title,
  subtitle: exam.subtitle,
  timeLimitSec: exam.timeLimitSec,
  problemCount: exam.problems.length
});

const toExamPublic = (exam: ExamManifest): ExamPublic => ({
  ...toExamSummary(exam),
  captureSummary: exam.captureSummary,
  problems: exam.problems.map((problem) => ({
    id: problem.id,
    number: problem.number,
    title: problem.title,
    answerKind: problem.answerKind,
    difficulty: problem.difficulty,
    pointValue: getProblemPointValue(problem),
    imageUrl: `/exams/${exam.id}/problems/${problem.image}`,
    text: problem.text,
    sourceNumber: problem.sourceNumber,
    sourcePage: problem.sourcePage,
    bbox: problem.bbox,
    section: problem.section,
    captureQuality: problem.captureQuality
  }))
});

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

  roomsTotalGauge.set(summary.roomCount);
  activeRoomsGauge.set(summary.activeRoomCount);
  roomsByStatusGauge.reset();
  roomsByStatusGauge.set({ status: "lobby" }, summary.statusCounts.lobby);
  roomsByStatusGauge.set({ status: "playing" }, summary.statusCounts.playing);
  roomsByStatusGauge.set({ status: "finished" }, summary.statusCounts.finished);

  roomExpirySecondsGauge.reset();
  roomExpirySecondsGauge.set({ stat: "avg" }, summary.roomExpirySeconds.avg);
  roomExpirySecondsGauge.set({ stat: "max" }, summary.roomExpirySeconds.max);

  playingRoomTimeRemainingSecondsGauge.reset();
  playingRoomTimeRemainingSecondsGauge.set({ stat: "avg" }, summary.playingRoomTimeRemainingSeconds.avg);
  playingRoomTimeRemainingSecondsGauge.set({ stat: "max" }, summary.playingRoomTimeRemainingSeconds.max);

  playersGauge.reset();
  playersGauge.set({ state: "total" }, summary.totalPlayers);
  playersGauge.set({ state: "connected" }, summary.connectedPlayers);
  playersGauge.set({ state: "disconnected" }, summary.disconnectedPlayers);
  socketConnectionsGauge.set(io.engine.clientsCount);
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

const shouldRateLimit = (socketId: string, eventName: string, minIntervalMs: number) => {
  const now = Date.now();
  let events = socketEventTimestamps.get(socketId);
  if (!events) {
    events = new Map();
    socketEventTimestamps.set(socketId, events);
  }
  const previous = events.get(eventName) ?? 0;
  events.set(eventName, now);
  return now - previous < minIntervalMs;
};

const makeStandings = (room: RoomState, players: PlayerPublic[] = [...room.players.values()], visibleUntil: number | null = null): StandingPublic[] =>
  players
    .map((player) => {
      const visibleSubmissions = visibleUntil === null ? player.submissions : player.submissions.filter((submission) => submission.submittedAt <= visibleUntil);
      const derived = derivePlayerScoreState(room, { ...player, submissions: visibleSubmissions });
      const lastAcceptedAt =
        visibleSubmissions
          .filter((submission) => submission.correct)
          .reduce<number | null>((latest, submission) => (latest === null || submission.submittedAt > latest ? submission.submittedAt : latest), null);
      return {
        playerId: player.id,
        nickname: player.nickname,
        score: derived.score,
        penaltyMs: derived.penaltyMs,
        solved: derived.solved,
        lastAcceptedAt
      };
    })
    .sort(compareStandings);

const compareStandings = (a: StandingPublic, b: StandingPublic) =>
  b.score - a.score ||
  a.penaltyMs - b.penaltyMs ||
  b.solved - a.solved ||
  (a.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER) - (b.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER);

const effectiveSubmissionPenaltyMs = (room: Pick<RoomState, "startedAt">, submission: PlayerPublic["submissions"][number]) => {
  if (!submission.correct) return 0;
  const elapsedMs = Math.max(0, submission.submittedAt - (room.startedAt ?? submission.submittedAt));
  const elapsedPenaltyMs = elapsedMs > 0 ? Math.max(1, Math.ceil(elapsedMs / 60000)) * 60000 : 0;
  return elapsedPenaltyMs + Math.max(0, submission.attempts - 1) * WRONG_ANSWER_PENALTY_MS;
};

const normalizeSubmissionPenalty = (room: Pick<RoomState, "startedAt">, submission: PlayerPublic["submissions"][number]) => ({
  ...submission,
  penaltyMs: effectiveSubmissionPenaltyMs(room, submission)
});

const formatPenaltyMinutes = (penaltyMs: number) => Math.max(0, Math.round(penaltyMs / 60000));

const derivePlayerScoreState = (room: Pick<RoomState, "startedAt">, player: PlayerPublic) => {
  const normalizedSubmissions = player.submissions.map((submission) => normalizeSubmissionPenalty(room, submission));
  const accepted = normalizedSubmissions.filter((submission) => submission.correct);
  return {
    score: accepted.reduce((sum, submission) => sum + submission.scoreAwarded, 0),
    penaltyMs: accepted.reduce((sum, submission) => sum + submission.penaltyMs, 0),
    solved: accepted.length,
    normalizedSubmissions
  };
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

const isItemId = (id: ActiveEffect["id"]): id is ItemId => id in ITEM_DEFINITIONS;

const cleanupEffects = (room: RoomState) => {
  const now = Date.now();
  let changed = false;
  for (const player of room.players.values()) {
    const activeEffects: ActiveEffect[] = [];
    const expiredEffects = player.expiredEffects ?? [];
    for (const effect of player.effects) {
      if (effect.expiresAt > now) {
        activeEffects.push(effect);
      } else if (isItemId(effect.id)) {
        expiredEffects.push({ ...effect, clearedAt: now });
        changed = true;
      } else {
        changed = true;
      }
    }
    const visibleExpiredEffects = expiredEffects.filter((effect) => now - effect.clearedAt <= EXPIRED_EFFECT_NOTICE_MS);
    if (visibleExpiredEffects.length !== expiredEffects.length) changed = true;
    player.effects = activeEffects;
    player.expiredEffects = visibleExpiredEffects;
    const cooldowns = player.itemCooldowns ?? {};
    for (const [itemId, readyAt] of Object.entries(cooldowns) as Array<[ItemId, number]>) {
      if (readyAt <= now) {
        delete cooldowns[itemId];
        changed = true;
      }
    }
    player.itemCooldowns = cooldowns;
  }
  return changed;
};

const randomItem = (): ItemId => {
  return ITEM_IDS[Math.floor(Math.random() * ITEM_IDS.length)];
};

const findAdviceNoteProblem = (room: RoomState, sender: PlayerState, target: PlayerState) => {
  const targetSolved = new Set(target.submissionHistory.filter((submission) => submission.correct).map((submission) => submission.problemId));
  const senderSolved = sender.submissionHistory.filter((submission) => submission.correct && !targetSolved.has(submission.problemId));
  const newest = senderSolved.sort((a, b) => b.submittedAt - a.submittedAt)[0];
  return newest ? getProblem(room, newest.problemId) : null;
};

const activeEffectForItem = (target: PlayerState, itemId: ItemId) => target.effects.find((effect) => effect.id === itemId && effect.expiresAt > Date.now());

const validateItemTarget = (room: RoomState, itemId: ItemId, sender: PlayerState, target: PlayerState) => {
  const item = ITEM_DEFINITIONS[itemId];
  if (item.lifecycle.target === "opponent" && sender.id === target.id) {
    return { ok: false, error: "상대에게만 사용할 수 있는 아이템입니다." } as const;
  }
  if (item.lifecycle.target === "eligibleUnsolved") {
    if (sender.id === target.id) {
      return { ok: false, error: "다른 참가자에게만 사용할 수 있는 아이템입니다." } as const;
    }
    if (!findAdviceNoteProblem(room, sender, target)) {
      return { ok: false, error: "내가 맞혔고 대상이 아직 못 맞힌 문제가 필요합니다." } as const;
    }
  }
  if (item.lifecycle.duplicate === "blockWhileActive" && activeEffectForItem(target, itemId)) {
    return { ok: false, error: "대상에게 같은 아이템 효과가 이미 적용 중입니다." } as const;
  }
  return { ok: true } as const;
};

const leadingScore = (room: RoomState) => Math.max(0, ...[...room.players.values()].map((player) => player.score));

const maybeAwardItems = (room: RoomState, player: PlayerState, problem: ProblemManifest, attempts: number): ItemAward[] => {
  if (!room.itemEnabled) return [];

  const firstTry = attempts === 1;
  const scoreGap = Math.max(0, leadingScore(room) - player.score);
  const comebackBoost = scoreGap >= 240 ? 0.14 : scoreGap >= 120 ? 0.08 : 0;
  const difficultyBoost = problem.difficulty * 0.055;
  const firstTryBoost = firstTry ? 0.1 : 0;
  const chance = Math.min(0.82, 0.2 + difficultyBoost + firstTryBoost + comebackBoost);
  const awards: ItemAward[] = [];

  if (Math.random() < chance) {
    awards.push({ itemId: randomItem(), reason: comebackBoost > 0.1 ? "comeback" : problem.difficulty >= 4 ? "difficulty" : "lucky" });
  }
  if (firstTry && problem.difficulty >= 5 && Math.random() < 0.35) {
    awards.push({ itemId: randomItem(), reason: "firstTry" });
  }

  return awards;
};

const randomWeakDebuff = (): ActiveEffect => {
  const now = Date.now();
  const pool: ActiveEffect[] = [
    { id: "hideAssist", label: "멘탈 흔들림", sourceName: "연속 오답", expiresAt: now + 8000 },
    { id: "blur", label: "시야 흐림", sourceName: "연속 오답", expiresAt: now + 6000 },
    { id: "slowInput", label: "손 굳음", sourceName: "연속 오답", expiresAt: now + 5000 }
  ];
  return pool[Math.floor(Math.random() * pool.length)];
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
    const effectsChanged = cleanupEffects(room);
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

const scoreForAccepted = (problem: ProblemManifest) => getProblemPointValue(problem);

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

app.get("/metrics", async (_req, res) => {
  updateRuntimeMetrics();
  res.set("Content-Type", metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

app.get("/api/exams", (_req, res) => {
  res.json(exams.filter((exam) => isExamReleased(exam)).map(toExamSummary));
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

    const nickname = readString(payload?.nickname, 18);
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
    const nickname = readString(payload?.nickname, 18);
    if (!room) {
      reply({ ok: false, error: "방을 찾을 수 없습니다." });
      return;
    }
    if (!nickname) {
      reply({ ok: false, error: "닉네임을 입력하세요." });
      return;
    }
    if (room.status !== "lobby") {
      reply({ ok: false, error: "이미 시작한 방입니다." });
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
      ready: false,
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
    addLog(room, "system", `${nickname} 입실. 컴싸 확인 완료.`);
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
    if (room && player) {
      player.connected = false;
      addLog(room, "system", `${player.nickname} 퇴실.`);
      socket.leave(room.code);
      touchRoom(room);
      emitRoom(room);
    }
    socketToPlayer.delete(socket.id);
    reply?.({ ok: true });
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
    emitRoom(room);
  });
});

httpServer.listen(port, () => {
  console.log(`KICE arena server listening on http://localhost:${port}`);
});
