import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
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
  type ItemId,
  type PlayerPublic,
  type ProblemManifest,
  type RoomPublic,
  type ServerResponse,
  type StandingPublic,
  normalizeAnswer
} from "../shared/game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const examsDir = path.join(__dirname, "exams");
const port = Number(process.env.PORT ?? 3001);

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
  players: Map<string, PlayerState>;
  logs: ArenaLog[];
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true
  }
});

const rooms = new Map<string, RoomState>();
const socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();

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

const makeStandings = (room: RoomState, players: PlayerPublic[] = [...room.players.values()]): StandingPublic[] =>
  players
    .map((player) => {
      const lastAcceptedAt =
        player.submissions
          .filter((submission) => submission.correct)
          .reduce<number | null>((latest, submission) => (latest === null || submission.submittedAt > latest ? submission.submittedAt : latest), null);
      return {
        playerId: player.id,
        nickname: player.nickname,
        score: player.score,
        solved: player.scoreBreakdown.solved,
        lastAcceptedAt
      };
    })
    .sort((a, b) => b.score - a.score || b.solved - a.solved || (a.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER) - (b.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER));

const isScoreboardFrozen = (room: RoomState) =>
  room.status === "playing" && room.scoreboardFrozenAt !== null && Date.now() >= room.scoreboardFrozenAt;

const maybeFreezeScoreboard = (room: RoomState) => {
  if (!isScoreboardFrozen(room) || room.frozenStandings.length > 0) return;
  room.frozenStandings = makeStandings(room);
  addLog(room, "system", `종료 ${Math.round(room.freezeBeforeSec / 60)}분 전. 순위표가 비공개 처리되었습니다.`);
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
  frozenStandings: room.frozenStandings,
  players: [...room.players.values()].map(({ socketId: _socketId, ...player }) => ({
    ...player,
    effects: player.effects.filter((effect) => effect.expiresAt > Date.now())
  })),
  logs: room.logs
});

const emitRoom = (room: RoomState) => {
  maybeFreezeScoreboard(room);
  io.to(room.code).emit("room:update", publicRoom(room));
};

const cleanupEffects = (room: RoomState) => {
  const now = Date.now();
  for (const player of room.players.values()) {
    player.effects = player.effects.filter((effect) => effect.expiresAt > now);
  }
};

const randomItem = (): ItemId => {
  const ids = Object.keys(ITEM_DEFINITIONS) as ItemId[];
  return ids[Math.floor(Math.random() * ids.length)];
};

const maybeAwardItem = (): ItemId | null => (Math.random() < 0.45 ? randomItem() : null);

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
  room.status = "finished";
  addLog(room, "system", "채점 완료. 성적통지표를 배부합니다.");
  addLog(room, "system", reason);
  emitRoom(room);
};

setInterval(() => {
  for (const room of rooms.values()) {
    cleanupEffects(room);
    if (isFinished(room)) finishRoom(room);
    else emitRoom(room);
  }
}, 1000);

const scoreForAccepted = (room: RoomState, problem: ProblemManifest, acceptedAt: number) => {
  const startedAt = room.startedAt ?? acceptedAt;
  const elapsedSec = Math.max(0, Math.floor((acceptedAt - startedAt) / 1000));
  const remainingRatio = Math.max(0, Math.min(1, (room.timeLimitSec - elapsedSec) / room.timeLimitSec));
  const difficultyBonus = problem.difficulty * 20;
  const timeBonus = Math.round(80 * remainingRatio);
  return 100 + difficultyBonus + timeBonus;
};

app.use("/exams", express.static(examsDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, exams: exams.length });
});

app.get("/api/exams", (_req, res) => {
  res.json(exams.map(toExamSummary));
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
    const code = payload.code.trim().toUpperCase();
    const room = rooms.get(code);
    const player = room?.players.get(payload.playerId);
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
    socket.emit("player:you", player.id);
    addLog(room, "system", `${player.nickname} 재입실. 기존 수험번호를 복구했습니다.`);
    reply({ ok: true, data: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:create", (payload: { examId: string; nickname: string; timeLimitSec?: number; freezeBeforeSec?: number; itemEnabled: boolean }, reply: (response: ServerResponse<RoomPublic>) => void) => {
    const exam = examById.get(payload.examId);
    if (!exam) {
      reply({ ok: false, error: "등록된 시험을 찾을 수 없습니다." });
      return;
    }

    const nickname = payload.nickname.trim().slice(0, 18);
    if (!nickname) {
      reply({ ok: false, error: "닉네임을 입력하세요." });
      return;
    }

    const timeLimitSec = readPositiveSeconds(payload.timeLimitSec, exam.timeLimitSec, 60, 4 * 60 * 60);
    const freezeBeforeSec = readPositiveSeconds(payload.freezeBeforeSec, 10 * 60, 0, timeLimitSec);
    const code = makeCode();
    const playerId = makeId();
    const firstProblemId = exam.problems[0]?.id ?? "";
    const host: PlayerState = {
      id: playerId,
      socketId: socket.id,
      nickname,
      score: 0,
      scoreBreakdown: { solved: 0, timeBonus: 0, difficultyBonus: 0 },
      ready: true,
      currentProblemId: firstProblemId,
      consecutiveWrong: 0,
      inventory: [],
      effects: [],
      submissions: [],
      connected: true
    };
    const room: RoomState = {
      code,
      hostId: playerId,
      exam,
      status: "lobby",
      timeLimitSec,
      freezeBeforeSec,
      itemEnabled: payload.itemEnabled,
      startedAt: null,
      endsAt: null,
      scoreboardFrozenAt: null,
      frozenStandings: [],
      players: new Map([[playerId, host]]),
      logs: []
    };

    rooms.set(code, room);
    socket.join(code);
    socketToPlayer.set(socket.id, { roomCode: code, playerId });
    socket.emit("player:you", playerId);
    addLog(room, "system", `${nickname} 출제위원장이 방을 열었습니다.`);
    reply({ ok: true, data: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:join", (payload: { code: string; nickname: string }, reply: (response: ServerResponse<RoomPublic>) => void) => {
    const code = payload.code.trim().toUpperCase();
    const room = rooms.get(code);
    const nickname = payload.nickname.trim().slice(0, 18);
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

    const playerId = makeId();
    const player: PlayerState = {
      id: playerId,
      socketId: socket.id,
      nickname,
      score: 0,
      scoreBreakdown: { solved: 0, timeBonus: 0, difficultyBonus: 0 },
      ready: false,
      currentProblemId: room.exam.problems[0]?.id ?? "",
      consecutiveWrong: 0,
      inventory: [],
      effects: [],
      submissions: [],
      connected: true
    };
    room.players.set(playerId, player);
    socket.join(code);
    socketToPlayer.set(socket.id, { roomCode: code, playerId });
    socket.emit("player:you", playerId);
    addLog(room, "system", `${nickname} 입실. 컴싸 확인 완료.`);
    reply({ ok: true, data: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("player:ready", (payload: { ready: boolean }) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    if (!room || !player || room.status !== "lobby") return;
    player.ready = payload.ready;
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
    for (const player of room.players.values()) player.ready = true;
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
      emitRoom(room);
    }
    socketToPlayer.delete(socket.id);
    reply?.({ ok: true });
  });

  socket.on("problem:set", (payload: { problemId: string }) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    if (!room || !player || !getProblem(room, payload.problemId)) return;
    const hasHardLock = player.effects.some((effect) => effect.id === "hardFirst" && effect.expiresAt > Date.now());
    const problem = getProblem(room, payload.problemId);
    if (hasHardLock && problem && problem.difficulty < 4) return;
    player.currentProblemId = payload.problemId;
    emitRoom(room);
  });

  socket.on("answer:submit", (payload: { problemId: string; answer: string }, reply: (response: ServerResponse<{ correct: boolean; itemAwarded: ItemId | null }>) => void) => {
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
    const problem = getProblem(room, payload.problemId);
    if (!problem) {
      reply({ ok: false, error: "문제를 찾을 수 없습니다." });
      return;
    }
    if (player.effects.some((effect) => ["penLock", "slowInput"].includes(effect.id) && effect.expiresAt > Date.now())) {
      reply({ ok: false, error: "지금은 펜이 압수된 상태입니다." });
      return;
    }

    const answer = payload.answer.trim().slice(0, 24);
    if (!answer) {
      reply({ ok: false, error: "답안을 입력하세요." });
      return;
    }
    const acceptedAt = Date.now();
    const correct = normalizeAnswer(answer) === normalizeAnswer(problem.answer);
    const previousCorrect = player.submissions.some((submission) => submission.problemId === problem.id && submission.correct);
    const previousSubmission = player.submissions.find((submission) => submission.problemId === problem.id);
    if (previousCorrect) {
      reply({ ok: false, error: "이미 맞힌 문항입니다." });
      return;
    }
    player.submissions = player.submissions.filter((submission) => submission.problemId !== problem.id);
    const attempts = (previousSubmission?.attempts ?? 0) + 1;
    const scoreAwarded = correct && !previousCorrect ? scoreForAccepted(room, problem, acceptedAt) : 0;
    player.submissions.push({ problemId: problem.id, answer, correct, submittedAt: acceptedAt, scoreAwarded, attempts });

    if (correct) {
      if (!previousCorrect) {
        const difficultyBonus = problem.difficulty * 20;
        player.score += scoreAwarded;
        player.scoreBreakdown.solved += 1;
        player.scoreBreakdown.difficultyBonus += difficultyBonus;
        player.scoreBreakdown.timeBonus += Math.max(0, scoreAwarded - 100 - difficultyBonus);
      }
      player.consecutiveWrong = 0;
      const itemAwarded = room.itemEnabled ? maybeAwardItem() : null;
      if (itemAwarded) player.inventory.push(itemAwarded);
      addLog(
        room,
        "submit",
        `${player.nickname} ${problem.number}번 정답 +${scoreAwarded}점.${itemAwarded ? ` ${ITEM_DEFINITIONS[itemAwarded].name} 획득.` : ""}`
      );
      reply({ ok: true, data: { correct, itemAwarded } });
      emitRoom(room);
      return;
    } else {
      player.consecutiveWrong += 1;
      addLog(room, "submit", `${player.nickname} ${problem.number}번 오답. 연속 ${player.consecutiveWrong}회.`);
      if (player.consecutiveWrong >= 3) {
        const penalty = randomWeakDebuff();
        player.effects.push(penalty);
        player.consecutiveWrong = 0;
        addLog(room, "penalty", `${player.nickname} 연속 오답 벌칙: ${penalty.label}`);
      }
    }

    reply({ ok: true, data: { correct, itemAwarded: null } });
    emitRoom(room);
  });

  socket.on("item:use", (payload: { itemId: ItemId; targetPlayerId: string }, reply: (response: ServerResponse) => void) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) {
      reply({ ok: false, error: "참가자 정보를 찾을 수 없습니다." });
      return;
    }
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    const target = room?.players.get(payload.targetPlayerId);
    const item = ITEM_DEFINITIONS[payload.itemId];
    if (!room || !player || !target || room.status !== "playing" || !item) {
      reply({ ok: false, error: "아이템을 사용할 수 없습니다." });
      return;
    }
    const index = player.inventory.indexOf(payload.itemId);
    if (index === -1) {
      reply({ ok: false, error: "보유하지 않은 아이템입니다." });
      return;
    }
    player.inventory.splice(index, 1);
    target.effects.push({
      id: item.id,
      label: item.name,
      sourceName: player.nickname,
      expiresAt: Date.now() + item.durationMs
    });
    addLog(room, "item", `${player.nickname} -> ${target.nickname}: ${item.name}`);
    reply({ ok: true });
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    const room = rooms.get(ref.roomCode);
    const player = room?.players.get(ref.playerId);
    if (!room || !player) return;
    player.connected = false;
    socketToPlayer.delete(socket.id);
    addLog(room, "system", `${player.nickname} 연결 끊김.`);
    emitRoom(room);
  });
});

httpServer.listen(port, () => {
  console.log(`KICE arena server listening on http://localhost:${port}`);
});
