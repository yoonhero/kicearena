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
  /**
   * Rooms with a cleanup / finish deadline inside this window are counted as
   * expiring soon. Defaults to 60 seconds so cleanup waves are visible before
   * they become backlog.
   */
  expiringSoonMs?: number;
}

export interface RuntimeMetricSummary {
  roomCount: number;
  activeRoomCount: number;
  statusCounts: Record<RoomStatus, number>;
  totalPlayers: number;
  connectedPlayers: number;
  disconnectedPlayers: number;
  disconnectedPlayerRatio: number;
  playersPerActiveRoom: {
    total: number;
    connected: number;
  };
  emptyLobbyRooms: number;
  disconnectedLobbyRooms: number;
  partiallyDisconnectedRooms: number;
  zombiePlayingRooms: number;
  playerCountMismatchRooms: number;
  expiringSoonRooms: number;
  expiredRooms: number;
  roomExpirySeconds: {
    avg: number;
    max: number;
  };
  roomExpiryOverdueSeconds: {
    avg: number;
    max: number;
  };
  playingRoomTimeRemainingSeconds: {
    avg: number;
    max: number;
  };
  roomDisconnectRiskScore: number;
  roomCleanupPressureScore: number;
}

export interface RuntimeMetricGaugeSample {
  name: string;
  help: string;
  value: number;
  labels?: Record<string, string>;
}

const DEFAULT_EXPIRING_SOON_MS = 60 * 1000;

const summarizeSeconds = (values: number[]) => ({
  avg: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
  max: values.length === 0 ? 0 : Math.max(...values)
});

const ratio = (numerator: number, denominator: number) => (denominator <= 0 ? 0 : numerator / denominator);

const boundedScore = (value: number) => Math.max(0, Math.min(1, value));

const roomExpiryDeadline = (room: RoomMetricInput, ttl: RoomTtlConfig) => {
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
  const expiringSoonMs = ttl.expiringSoonMs ?? DEFAULT_EXPIRING_SOON_MS;
  let totalPlayers = 0;
  let connectedPlayers = 0;
  let emptyLobbyRooms = 0;
  let disconnectedLobbyRooms = 0;
  let partiallyDisconnectedRooms = 0;
  let zombiePlayingRooms = 0;
  let playerCountMismatchRooms = 0;
  let expiringSoonRooms = 0;
  let expiredRooms = 0;
  const expirySeconds: number[] = [];
  const overdueSeconds: number[] = [];
  const playingTimeRemainingSeconds: number[] = [];

  for (const room of rooms) {
    statusCounts[room.status] += 1;
    totalPlayers += room.playerCount;
    connectedPlayers += room.connectedPlayerCount;

    if (room.connectedPlayerCount < 0 || room.playerCount < 0 || room.connectedPlayerCount > room.playerCount) {
      playerCountMismatchRooms += 1;
    }

    if (room.status === "lobby" && room.playerCount === 0) emptyLobbyRooms += 1;
    if (room.status === "lobby" && room.playerCount > 0 && room.connectedPlayerCount === 0) disconnectedLobbyRooms += 1;
    if (room.status !== "finished" && room.connectedPlayerCount > 0 && room.connectedPlayerCount < room.playerCount) {
      partiallyDisconnectedRooms += 1;
    }
    if (room.status === "playing" && room.connectedPlayerCount === 0) zombiePlayingRooms += 1;

    const expiryDeadline = roomExpiryDeadline(room, ttl);
    if (expiryDeadline !== null) {
      const msUntilExpiry = expiryDeadline - now;
      if (msUntilExpiry <= 0) {
        expiredRooms += 1;
        overdueSeconds.push(Math.abs(msUntilExpiry) / 1000);
      } else {
        expirySeconds.push(msUntilExpiry / 1000);
        if (msUntilExpiry <= expiringSoonMs) expiringSoonRooms += 1;
      }
    }

    if (room.status === "playing" && room.endsAt !== null) {
      playingTimeRemainingSeconds.push(Math.max(0, (room.endsAt - now) / 1000));
    }
  }

  const activeRoomCount = rooms.filter((room) => room.status !== "finished").length;
  const disconnectedPlayers = Math.max(0, totalPlayers - connectedPlayers);
  const disconnectRiskNumerator = zombiePlayingRooms + disconnectedLobbyRooms * 0.7 + partiallyDisconnectedRooms * 0.3;
  const cleanupRiskNumerator = expiredRooms + expiringSoonRooms * 0.25;

  return {
    roomCount: rooms.length,
    activeRoomCount,
    statusCounts,
    totalPlayers,
    connectedPlayers,
    disconnectedPlayers,
    disconnectedPlayerRatio: ratio(disconnectedPlayers, totalPlayers),
    playersPerActiveRoom: {
      total: ratio(totalPlayers, activeRoomCount),
      connected: ratio(connectedPlayers, activeRoomCount)
    },
    emptyLobbyRooms,
    disconnectedLobbyRooms,
    partiallyDisconnectedRooms,
    zombiePlayingRooms,
    playerCountMismatchRooms,
    expiringSoonRooms,
    expiredRooms,
    roomExpirySeconds: summarizeSeconds(expirySeconds),
    roomExpiryOverdueSeconds: summarizeSeconds(overdueSeconds),
    playingRoomTimeRemainingSeconds: summarizeSeconds(playingTimeRemainingSeconds),
    roomDisconnectRiskScore: boundedScore(ratio(disconnectRiskNumerator, activeRoomCount)),
    roomCleanupPressureScore: boundedScore(ratio(cleanupRiskNumerator, activeRoomCount))
  };
};

export const derivedRuntimeMetricSamples = (summary: RuntimeMetricSummary): RuntimeMetricGaugeSample[] => [
  {
    name: "kice_arena_players_disconnected_ratio",
    help: "Share of tracked players that are currently disconnected. Value range: 0..1.",
    value: summary.disconnectedPlayerRatio
  },
  {
    name: "kice_arena_players_per_active_room",
    help: "Average players per non-finished room by player state.",
    labels: { state: "total" },
    value: summary.playersPerActiveRoom.total
  },
  {
    name: "kice_arena_players_per_active_room",
    help: "Average players per non-finished room by player state.",
    labels: { state: "connected" },
    value: summary.playersPerActiveRoom.connected
  },
  {
    name: "kice_arena_rooms_empty_lobby",
    help: "Lobby rooms with no tracked players. High values point to lobby cleanup pressure.",
    value: summary.emptyLobbyRooms
  },
  {
    name: "kice_arena_rooms_disconnected_lobby",
    help: "Lobby rooms that still have tracked players but no connected players.",
    value: summary.disconnectedLobbyRooms
  },
  {
    name: "kice_arena_rooms_partially_disconnected",
    help: "Active rooms where at least one, but not all, tracked players are disconnected.",
    value: summary.partiallyDisconnectedRooms
  },
  {
    name: "kice_arena_rooms_zombie_playing",
    help: "Playing rooms with no connected players. This is usually a stale game-session signal.",
    value: summary.zombiePlayingRooms
  },
  {
    name: "kice_arena_rooms_player_count_mismatch",
    help: "Rooms whose connected player count is negative, exceeds total players, or total players is negative.",
    value: summary.playerCountMismatchRooms
  },
  {
    name: "kice_arena_rooms_expiring_soon",
    help: "Rooms whose finish or cleanup deadline is inside the expiringSoonMs window.",
    value: summary.expiringSoonRooms
  },
  {
    name: "kice_arena_rooms_expired",
    help: "Rooms whose finish or cleanup deadline has passed but are still present in memory.",
    value: summary.expiredRooms
  },
  {
    name: "kice_arena_room_expiry_overdue_seconds",
    help: "How long expired rooms have remained in memory after their deadline.",
    labels: { stat: "avg" },
    value: summary.roomExpiryOverdueSeconds.avg
  },
  {
    name: "kice_arena_room_expiry_overdue_seconds",
    help: "How long expired rooms have remained in memory after their deadline.",
    labels: { stat: "max" },
    value: summary.roomExpiryOverdueSeconds.max
  },
  {
    name: "kice_arena_room_disconnect_risk_score",
    help: "Weighted active-room disconnect risk score. Value range: 0..1.",
    value: summary.roomDisconnectRiskScore
  },
  {
    name: "kice_arena_room_cleanup_pressure_score",
    help: "Weighted room cleanup pressure score. Value range: 0..1.",
    value: summary.roomCleanupPressureScore
  }
];
