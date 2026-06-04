import type { RoomStatus } from "./game.js";

export interface RoomMetricInput {
  status: RoomStatus;
  endsAt: number | null;
  createdAt: number;
  lastActivityAt: number;
  playerCount: number;
  connectedPlayerCount: number;
}

export interface RoomTtlConfig {
  emptyLobbyMs: number;
  disconnectedLobbyMs: number;
  finishedMs: number;
}

export interface RuntimeMetricSummary {
  roomCount: number;
  activeRoomCount: number;
  statusCounts: Record<RoomStatus, number>;
  totalPlayers: number;
  connectedPlayers: number;
  disconnectedPlayers: number;
  roomExpirySeconds: {
    avg: number;
    max: number;
  };
  playingRoomTimeRemainingSeconds: {
    avg: number;
    max: number;
  };
}

const summarizeSeconds = (values: number[]) => ({
  avg: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
  max: values.length === 0 ? 0 : Math.max(...values)
});

const roomExpiryDeadline = (room: RoomMetricInput, now: number, ttl: RoomTtlConfig) => {
  if (room.status === "playing" && room.endsAt !== null) return room.endsAt;
  if (room.status === "finished") return room.lastActivityAt + ttl.finishedMs;
  if (room.status === "lobby" && room.playerCount === 0) return room.createdAt + ttl.emptyLobbyMs;
  if (room.status === "lobby" && room.connectedPlayerCount === 0) return room.lastActivityAt + ttl.disconnectedLobbyMs;
  return null;
};

export const summarizeRoomMetrics = (rooms: RoomMetricInput[], now: number, ttl: RoomTtlConfig): RuntimeMetricSummary => {
  const statusCounts: Record<RoomStatus, number> = {
    lobby: 0,
    playing: 0,
    finished: 0
  };
  let totalPlayers = 0;
  let connectedPlayers = 0;
  const expirySeconds: number[] = [];
  const playingTimeRemainingSeconds: number[] = [];

  for (const room of rooms) {
    statusCounts[room.status] += 1;
    totalPlayers += room.playerCount;
    connectedPlayers += room.connectedPlayerCount;

    const expiryDeadline = roomExpiryDeadline(room, now, ttl);
    if (expiryDeadline !== null) expirySeconds.push(Math.max(0, (expiryDeadline - now) / 1000));

    if (room.status === "playing" && room.endsAt !== null) {
      playingTimeRemainingSeconds.push(Math.max(0, (room.endsAt - now) / 1000));
    }
  }

  return {
    roomCount: rooms.length,
    activeRoomCount: rooms.filter((room) => room.status !== "finished").length,
    statusCounts,
    totalPlayers,
    connectedPlayers,
    disconnectedPlayers: Math.max(0, totalPlayers - connectedPlayers),
    roomExpirySeconds: summarizeSeconds(expirySeconds),
    playingRoomTimeRemainingSeconds: summarizeSeconds(playingTimeRemainingSeconds)
  };
};
