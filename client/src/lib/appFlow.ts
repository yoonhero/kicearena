import type { ExamPublic, RoomPublic } from "../../../shared/game";
import type { AppScreen, SitePage } from "../components/AppRoutes";

export type SavedRoomSession = {
    code: string;
    playerId: string;
};

export const ROOM_SESSION_KEY = "kice-arena:last-session";
export const REJOIN_CONNECT_TIMEOUT_MS = 2500;

export const readInviteCode = () =>
    new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";

export const readReferralCode = () =>
    new URLSearchParams(window.location.search).get("c")?.trim().toLowerCase() ?? "";

export const readSitePage = (): SitePage => {
    const path = window.location.pathname.replace(/^\/+/, "");
    if (path === "competition" || path === "contest" || path === "compeition") {
        return "competition";
    }
    if (path === "practice") return "practice";
    if (path === "profile") return "profile";
    if (path === "login") return "login";
    return "home";
};

export const writeClipboard = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        return;
    } catch {
        const input = document.createElement("input");
        input.value = text;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.append(input);
        input.select();
        document.execCommand("copy");
        input.remove();
    }
};

export const readSavedRoomSession = (): SavedRoomSession | null => {
    const raw = window.localStorage.getItem(ROOM_SESSION_KEY);
    if (!raw) return null;
    try {
        const saved = JSON.parse(raw) as SavedRoomSession;
        return saved?.code && saved.playerId ? saved : null;
    } catch {
        return null;
    }
};

export const waitForSocketConnection = () =>
    new Promise<boolean>((resolve) => {
        void import("./socket").then(({ socket }) => {
            if (socket.connected) {
                resolve(true);
                return;
            }
            const timeout = window.setTimeout(() => {
                socket.off("connect", onConnect);
                resolve(false);
            }, REJOIN_CONNECT_TIMEOUT_MS);
            const onConnect = () => {
                window.clearTimeout(timeout);
                resolve(true);
            };
            socket.once("connect", onConnect);
        });
    });

export const getScreen = (
    room: RoomPublic | null,
    spectatorExam: ExamPublic | null,
    ownPlayerId: string,
): AppScreen => {
    if (!room && spectatorExam) return "spectator";
    if (!room) return "home";
    if (room.status === "lobby") return "lobby";
    if (room.status === "finished" && !room.players.some((player) => player.id === ownPlayerId)) {
        return "rankings";
    }
    if (room.status === "finished") return "results";
    if (!room.players.some((player) => player.id === ownPlayerId)) return "rankings";
    return "arena";
};
