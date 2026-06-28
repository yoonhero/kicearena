import type { Pool } from "pg";
import type { Server, Socket } from "socket.io";
import type {
    ArenaLog,
    ExamManifest,
    ProblemManifest,
    RoomMode,
    RoomPublic,
    ServerResponse,
} from "../shared/game.js";
import { createServerMetrics } from "./serverMetrics.js";
import type {
    RoomSocketCleanupPayload,
    SocketPlayerRef,
    SocketSpectatorRef,
} from "./socketPresence.js";
import type { PlayerState, RoomState } from "./types.js";

export type RoomPublicReply = (response: ServerResponse<RoomPublic>) => void;

export type SocketHandlerContext = {
    io: Server;
    rooms: Map<string, RoomState>;
    socketToPlayer: Map<string, SocketPlayerRef>;
    socketToSpectator: Map<string, SocketSpectatorRef>;
    serverMetrics: ReturnType<typeof createServerMetrics>;
    getExamById: () => Map<string, ExamManifest>;
    getExamCatalogPool: () => Pool | null;
    campaignAuthCookieName: string;
    campaignAuthSecret: string;
    activeRoomCount: () => Promise<number>;
    findLatestEventRoom: (
        examId: string,
        statuses: RoomPublic["status"][],
    ) => Promise<RoomState | null>;
    findReusableEventRoom: (examId: string) => Promise<RoomState | null>;
    getPersistedRoom: (code: string) => Promise<RoomState | null>;
    withRoomMutation: <T>(code: string, callback: () => Promise<T>) => Promise<T>;
    makeAvailableCode: () => Promise<string>;
    makeId: () => string;
    makeSocketToken: () => string;
    readPositiveSeconds: (value: unknown, fallback: number, min: number, max: number) => number;
    isCurrentPlayerSocket: (
        player: PlayerState | undefined,
        ref: SocketPlayerRef | undefined,
    ) => player is PlayerState;
    addLog: (room: RoomState, kind: ArenaLog["kind"], message: string) => void;
    touchRoom: (room: RoomState) => void;
    publicRoom: (room: RoomState) => RoomPublic;
    emitRoom: (room: RoomState) => RoomPublic;
    finishRoom: (room: RoomState, reason?: string) => RoomPublic | null;
    getProblem: (room: RoomState, problemId: string) => ProblemManifest | undefined;
    cleanupRoomSocketsAcrossCluster: (payload: RoomSocketCleanupPayload) => void;
    clearLocalSocketPlayer: (socketId: string) => void;
    clearLocalSocketSpectator: (socketId: string) => void;
    setSocketPlayer: (socket: Socket, ref: SocketPlayerRef) => void;
    setSocketSpectator: (socket: Socket, ref: SocketSpectatorRef) => void;
    closeLobbyRoom: (room: RoomState) => void;
    closeRoomIfNoConnectedPlayers: (room: RoomState) => boolean;
    removePlayerFromRoom: (room: RoomState, player: PlayerState) => void;
    shouldRateLimit: (socketId: string, eventName: string, minIntervalMs: number) => boolean;
    rateLimitMs: {
        ready: number;
        problemSet: number;
        answerSubmit: number;
        itemUse: number;
        revealNext: number;
    };
    replyAfterRoomCommit: <TResponse>(
        reply: ((response: TResponse) => void) | undefined,
        response: TResponse,
    ) => void;
    roomGuards: {
        maxNicknameLength: number;
        maxActiveRooms: number;
        minTimeLimitSec: number;
        maxTimeLimitSec: number;
    };
    normalizeRoomMode: (mode: unknown) => RoomMode;
    maxPlayersForRoomMode: (mode: RoomMode) => number;
    itemEnabledForRoomMode: (mode: RoomMode, requested: boolean) => boolean;
};
