import { ROOM_GUARDRAILS, type RoomMode } from "./game";

export const normalizeRoomMode = (value: unknown): RoomMode =>
    value === "contest" ? "contest" : "casual";

export const maxPlayersForRoomMode = (mode: RoomMode) =>
    mode === "contest"
        ? ROOM_GUARDRAILS.maxContestPlayersPerRoom
        : ROOM_GUARDRAILS.maxPlayersPerRoom;

export const itemEnabledForRoomMode = (mode: RoomMode, requested: boolean) =>
    mode === "contest" ? false : requested;
