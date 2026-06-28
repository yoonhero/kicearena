import type { ExamManifest } from "../shared/game.js";
import type { createExamCatalogPool } from "./examDatabase.js";
import { readRoomState } from "./roomDatabase.js";
import type { RoomState } from "./types.js";

const makeCode = (rooms: Map<string, RoomState>): string => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return rooms.has(code) ? makeCode(rooms) : code;
};

export const createRoomCodeFactory = ({
    rooms,
    getPool,
    getExamById,
}: {
    rooms: Map<string, RoomState>;
    getPool: () => ReturnType<typeof createExamCatalogPool> | null;
    getExamById: () => Map<string, ExamManifest>;
}) => {
    const makeAvailableCode = async (): Promise<string> => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const code = makeCode(rooms);
            const pool = getPool();
            if (!pool || !(await readRoomState(pool, code, getExamById()))) return code;
        }
        throw new Error("Unable to allocate a unique room code.");
    };

    return { makeAvailableCode };
};
