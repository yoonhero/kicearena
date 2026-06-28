import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";
import type { ExamManifest, RoomPublic } from "../shared/game.js";
import { latestEventRoom } from "./eventSpectatorRooms.js";
import { KeyedMutex } from "./keyedMutex.js";
import {
    countActiveRoomStates,
    deleteRoomState,
    readRoomState,
    readRoomStates,
    saveRoomState,
} from "./roomDatabase.js";
import type { RoomState } from "./types.js";

type RoomMutationContext = {
    client: PoolClient;
    pendingWrites: Promise<unknown>[];
    afterCommit: Array<() => void>;
};

export const createRoomStore = ({
    rooms,
    getPool,
    getExamById,
    applySocketPresence,
}: {
    rooms: Map<string, RoomState>;
    getPool: () => Pool | null;
    getExamById: () => Map<string, ExamManifest>;
    applySocketPresence: (room: RoomState) => Promise<RoomState>;
}) => {
    const roomMutationStorage = new AsyncLocalStorage<RoomMutationContext>();
    const roomMutationMutex = new KeyedMutex();

    const roomDatabase = () => roomMutationStorage.getStore()?.client ?? getPool();

    const getPersistedRoom = async (code: string) => {
        const db = roomDatabase();
        if (!db) return rooms.get(code) ?? null;
        const persisted = await readRoomState(db, code, getExamById());
        if (!persisted) {
            rooms.delete(code);
            return null;
        }
        const room = await applySocketPresence(persisted);
        rooms.set(code, room);
        return room;
    };

    const withRoomMutation = async <T>(code: string, callback: () => Promise<T>): Promise<T> => {
        const pool = getPool();
        if (!pool) return callback();
        const existingContext = roomMutationStorage.getStore();
        if (existingContext) return callback();
        return roomMutationMutex.run(code, () => withRoomMutationTransaction(code, callback));
    };

    const withRoomMutationTransaction = async <T>(
        code: string,
        callback: () => Promise<T>,
    ): Promise<T> => {
        const client = await getPool()!.connect();
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

    const activeRoomCount = async () => {
        const db = roomDatabase();
        if (db) return countActiveRoomStates(db);
        return [...rooms.values()].filter((room) => room.status !== "finished").length;
    };

    const findReusableEventRoom = async (examId: string) => {
        const db = roomDatabase();
        const candidates = db ? await readRoomStates(db, getExamById()) : [...rooms.values()];
        const room = candidates.find(
            (candidate) =>
                candidate.eventId === examId &&
                candidate.status !== "finished" &&
                candidate.players.size < candidate.maxPlayers,
        );
        return room ? getPersistedRoom(room.code) : null;
    };

    const findLatestEventRoom = async (examId: string, statuses: RoomPublic["status"][]) => {
        const db = roomDatabase();
        const candidates = db ? await readRoomStates(db, getExamById()) : [...rooms.values()];
        const room = latestEventRoom(candidates, examId, statuses);
        return room ? getPersistedRoom(room.code) : null;
    };

    const readEventRooms = async (examId: string, statuses: RoomPublic["status"][]) => {
        const db = roomDatabase();
        const candidates = db ? await readRoomStates(db, getExamById()) : [...rooms.values()];
        const allowedStatuses = new Set(statuses);
        const codes = candidates
            .filter((room) => room.eventId === examId && allowedStatuses.has(room.status))
            .map((room) => room.code);
        const eventRooms: RoomState[] = [];
        for (const code of codes) {
            const room = await getPersistedRoom(code);
            if (room) eventRooms.push(room);
        }
        return eventRooms;
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

    return {
        activeRoomCount,
        afterRoomCommit,
        findLatestEventRoom,
        findReusableEventRoom,
        getPersistedRoom,
        persistRoom,
        readEventRooms,
        removePersistedRoom,
        roomDatabase,
        withRoomMutation,
    };
};
