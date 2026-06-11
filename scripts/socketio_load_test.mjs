import { io } from "socket.io-client";
import { performance } from "node:perf_hooks";

const TARGET = process.env.TARGET ?? "https://kice.mmeme.org";
const EXAM_ID = process.env.EXAM_ID ?? "kice-2026-june-math-geometry";
const ROOMS = Number(process.env.ROOMS ?? 1);
const PLAYERS_PER_ROOM = Number(process.env.PLAYERS_PER_ROOM ?? 200);
const MODE = process.env.MODE ?? "contest";
const ANSWERS = Number(process.env.ANSWERS ?? 1);
const ACK_TIMEOUT_MS = Number(process.env.ACK_TIMEOUT_MS ?? 20_000);
const JOIN_BATCH_SIZE = Number(process.env.JOIN_BATCH_SIZE ?? 120);
const SUBMIT_BATCH_SIZE = Number(process.env.SUBMIT_BATCH_SIZE ?? 10);
const BATCH_PAUSE_MS = Number(process.env.BATCH_PAUSE_MS ?? 250);
const POST_START_WAIT_MS = Number(process.env.POST_START_WAIT_MS ?? 500);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stats = {
  connectOk: 0,
  connectFail: 0,
  disconnects: 0,
  roomUpdates: 0,
  acks: new Map(),
  failures: []
};
const clients = [];

const getLatencyBucket = (event) => {
  if (!stats.acks.has(event)) stats.acks.set(event, []);
  return stats.acks.get(event);
};

const percentile = (nums, p) => {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

const summarizeLatencies = () =>
  Object.fromEntries(
    [...stats.acks.entries()].map(([event, nums]) => [
      event,
      {
        count: nums.length,
        avg: Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length),
        p50: Math.round(percentile(nums, 0.5)),
        p95: Math.round(percentile(nums, 0.95)),
        p99: Math.round(percentile(nums, 0.99)),
        max: Math.round(Math.max(...nums))
      }
    ])
  );

const makeSocket = (label) => {
  const socket = io(TARGET, {
    transports: ["websocket"],
    reconnection: false,
    timeout: ACK_TIMEOUT_MS
  });
  const client = {
    label,
    socket,
    roomCode: "",
    problemId: "",
    latestRoom: null
  };
  clients.push(client);

  socket.on("connect", () => {
    stats.connectOk += 1;
  });
  socket.on("connect_error", (error) => {
    stats.connectFail += 1;
    stats.failures.push(`${label} connect_error: ${error.message}`);
  });
  socket.on("disconnect", () => {
    stats.disconnects += 1;
  });
  socket.on("room:update", (room) => {
    client.latestRoom = room;
    stats.roomUpdates += 1;
  });

  return client;
};

const waitConnect = async (client) => {
  if (client.socket.connected) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${client.label} connect timeout`)), ACK_TIMEOUT_MS);
    client.socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    client.socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
};

const emitAck = async (client, event, payload) => {
  const start = performance.now();
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${client.label} ${event} ack timeout`)), ACK_TIMEOUT_MS);
    const done = (res) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) client.socket.emit(event, done);
    else client.socket.emit(event, payload, done);
  });
  getLatencyBucket(event).push(performance.now() - start);
  if (!response?.ok) {
    throw new Error(`${client.label} ${event} failed: ${response?.error ?? "unknown error"}`);
  }
  return response.data;
};

const waitForRoomStatus = async (client, status) => {
  if (client.latestRoom?.status === status) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${client.label} room status ${status} timeout`)), ACK_TIMEOUT_MS);
    const handler = (room) => {
      if (room.status !== status) return;
      clearTimeout(timer);
      client.socket.off("room:update", handler);
      resolve();
    };
    client.socket.on("room:update", handler);
  });
};

const runInBatches = async (tasks, batchSize, pauseMs) => {
  for (let index = 0; index < tasks.length; index += batchSize) {
    await Promise.all(tasks.slice(index, index + batchSize).map((task) => task()));
    if (index + batchSize < tasks.length) await sleep(pauseMs);
  }
};

const createRoom = async (roomIndex) => {
  const client = makeSocket(`room${roomIndex}-host`);
  await waitConnect(client);
  const room = await emitAck(client, "room:create", {
    examId: EXAM_ID,
    nickname: `h${roomIndex}`.slice(0, 6),
    timeLimitSec: 60,
    freezeBeforeSec: 0,
    itemEnabled: MODE !== "contest",
    mode: MODE
  });
  client.roomCode = room.code;
  client.problemId = room.exam.problems[0].id;
  client.latestRoom = room;
  return {
    host: client,
    code: room.code,
    firstProblemId: room.exam.problems[0].id
  };
};

const joinPlayer = async (room, roomIndex, playerIndex) => {
  const client = makeSocket(`r${roomIndex}-p${playerIndex}`);
  await waitConnect(client);
  const joinedRoom = await emitAck(client, "room:join", {
    code: room.code,
    nickname: `p${roomIndex}${String(playerIndex).padStart(2, "0")}`.slice(0, 6)
  });
  client.roomCode = room.code;
  client.problemId = joinedRoom.exam.problems[0].id;
  client.latestRoom = joinedRoom;
};

const submitAnswer = async (client) => {
  if (!client.socket.connected || !client.problemId) return;
  for (let answerIndex = 0; answerIndex < ANSWERS; answerIndex += 1) {
    await emitAck(client, "answer:submit", {
      problemId: client.problemId,
      answer: "1",
      idempotencyKey: `${client.label}-${answerIndex}`
    });
  }
};

const startedAt = performance.now();
const rooms = [];

try {
  for (let roomIndex = 0; roomIndex < ROOMS; roomIndex += 1) {
    rooms.push(await createRoom(roomIndex));
  }

  const joinTasks = [];
  for (let roomIndex = 0; roomIndex < rooms.length; roomIndex += 1) {
    for (let playerIndex = 1; playerIndex < PLAYERS_PER_ROOM; playerIndex += 1) {
      joinTasks.push(() =>
        joinPlayer(rooms[roomIndex], roomIndex, playerIndex).catch((error) => {
          stats.failures.push(error.message);
        })
      );
    }
  }
  await runInBatches(joinTasks, JOIN_BATCH_SIZE, BATCH_PAUSE_MS);

  for (const room of rooms) room.host.socket.emit("room:start");
  await Promise.all(
    rooms.map((room) =>
      waitForRoomStatus(room.host, "playing").catch((error) => {
        stats.failures.push(error.message);
      })
    )
  );
  await sleep(POST_START_WAIT_MS);

  const submitTasks = clients
    .filter((client) => client.socket.connected)
    .map((client) => () =>
      submitAnswer(client).catch((error) => {
        stats.failures.push(error.message);
      })
    );
  await runInBatches(submitTasks, SUBMIT_BATCH_SIZE, BATCH_PAUSE_MS);

  await sleep(500);
} finally {
  for (const client of clients) client.socket.disconnect();
  await sleep(500);
}

const elapsedMs = performance.now() - startedAt;
console.log(
  JSON.stringify(
    {
      target: TARGET,
      examId: EXAM_ID,
      requested: {
        rooms: ROOMS,
        playersPerRoom: PLAYERS_PER_ROOM,
        mode: MODE,
        totalSockets: ROOMS * PLAYERS_PER_ROOM,
        answersPerPlayer: ANSWERS
      },
      elapsedMs: Math.round(elapsedMs),
      connected: {
        ok: stats.connectOk,
        failed: stats.connectFail,
        disconnected: stats.disconnects
      },
      roomUpdatesReceived: stats.roomUpdates,
      ackLatencyMs: summarizeLatencies(),
      failureCount: stats.failures.length,
      failures: stats.failures.slice(0, 30)
    },
    null,
    2
  )
);
