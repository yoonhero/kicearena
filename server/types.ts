import type { ArenaLog, ExamManifest, PlayerPublic, RoomPublic, StandingPublic } from "../shared/game.js";

export interface PlayerState extends PlayerPublic {
  socketId: string;
}

export interface RoomState {
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
