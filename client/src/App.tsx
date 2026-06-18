import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignUserPublic } from "../../shared/campaign";
import {
    type ExamPublic,
    type GymEventSummary,
    type PlayerPublic,
    type RoomPublic,
} from "../../shared/game";
import { AppLoading, AppRoutes, type AppScreen } from "./components/AppRoutes";
import { useReferralGateState } from "./hooks/useReferralGateState";
import { entrantNickname, readStoredCampaignUser } from "./lib/campaignSession";
import { emitWithAck, ROOM_SESSION_KEY, socket } from "./lib/socket";

type SavedRoomSession = {
    code: string;
    playerId: string;
};
type RoomLookup = {
    exists: boolean;
    status?: RoomPublic["status"];
    playerCount?: number;
};
type PendingEventAction = { eventId: string; action: "register" | "spectate" } | null;

const readInviteCode = () =>
    new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
const REJOIN_CONNECT_TIMEOUT_MS = 2500;

const writeClipboard = async (text: string) => {
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

const readSavedRoomSession = (): SavedRoomSession | null => {
    const raw = window.localStorage.getItem(ROOM_SESSION_KEY);
    if (!raw) return null;
    try {
        const saved = JSON.parse(raw) as SavedRoomSession;
        return saved?.code && saved.playerId ? saved : null;
    } catch {
        return null;
    }
};

const waitForSocketConnection = () =>
    new Promise<boolean>((resolve) => {
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

const getScreen = (
    room: RoomPublic | null,
    spectatorExam: ExamPublic | null,
    ownPlayerId: string,
): AppScreen => {
    if (!room && spectatorExam) return "spectator";
    if (!room) return "home";
    if (room.status === "lobby") return "lobby";
    if (room.status === "finished") return "results";
    if (!room.players.some((player) => player.id === ownPlayerId)) return "rankings";
    return "arena";
};

export function App() {
    const [inviteCode, setInviteCode] = useState(readInviteCode);
    const [events, setEvents] = useState<GymEventSummary[]>([]);
    const [spectatorExam, setSpectatorExam] = useState<ExamPublic | null>(null);
    const [campaignUser] = useState<CampaignUserPublic | null>(readStoredCampaignUser);
    const [nickname, setNickname] = useState("");
    const [roomCode, setRoomCode] = useState(inviteCode);
    const [room, setRoom] = useState<RoomPublic | null>(null);
    const [ownPlayerId, setOwnPlayerId] = useState("");
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [joiningInvite, setJoiningInvite] = useState(false);
    const [pendingEventAction, setPendingEventAction] = useState<PendingEventAction>(null);
    const [loadingInitialRoom, setLoadingInitialRoom] = useState(true);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [eventsUnavailable, setEventsUnavailable] = useState(false);
    const rejoinAttempted = useRef(false);

    const resetRoomSession = useCallback((nextRoomCode = "") => {
        window.localStorage.removeItem(ROOM_SESSION_KEY);
        setRoom(null);
        setOwnPlayerId("");
        setRoomCode(nextRoomCode);
        rejoinAttempted.current = false;
    }, []);

    const clearRoomView = useCallback((nextRoomCode = "") => {
        setRoom(null);
        setOwnPlayerId("");
        setRoomCode(nextRoomCode);
    }, []);

    useEffect(() => {
        fetch("/api/events")
            .then((res) => {
                if (!res.ok) throw new Error(`events:${res.status}`);
                return res.json();
            })
            .then((data: GymEventSummary[]) => {
                setEvents(data);
                setEventsUnavailable(false);
            })
            .catch((error) => {
                setEventsUnavailable(true);
                console.warn("Failed to load gym events", error);
            })
            .finally(() => setEventsLoaded(true));
    }, []);

    useEffect(() => {
        const onRoomUpdate = (nextRoom: RoomPublic) => {
            setRoom((current) =>
                current && current.code === nextRoom.code && current.version > nextRoom.version
                    ? current
                    : nextRoom,
            );
            if (ownPlayerId && !nextRoom.players.some((player) => player.id === ownPlayerId)) {
                resetRoomSession("");
            }
        };
        const onRoomRemoved = () => resetRoomSession("");
        socket.on("room:update", onRoomUpdate);
        socket.on("player:you", setOwnPlayerId);
        socket.on("room:kicked", onRoomRemoved);
        socket.on("room:closed", onRoomRemoved);
        const lookupRoom = async (code: string) => {
            const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
            if (!response.ok) return { exists: false } satisfies RoomLookup;
            return (await response.json()) as RoomLookup;
        };
        const tryRejoin = async () => {
            if (rejoinAttempted.current) return;
            rejoinAttempted.current = true;
            let saved = readSavedRoomSession();
            if (saved && inviteCode && saved.code !== inviteCode) {
                window.localStorage.removeItem(ROOM_SESSION_KEY);
                saved = null;
            }
            const lookupCode = inviteCode || saved?.code || "";
            try {
                if (lookupCode) {
                    const lookup = await lookupRoom(lookupCode);
                    if (!lookup.exists) {
                        if (inviteCode) setError("초대된 방이 이미 닫혔습니다.");
                        if (saved) window.localStorage.removeItem(ROOM_SESSION_KEY);
                        return;
                    }
                }
                if (!saved) return;
                const connected = await waitForSocketConnection();
                if (!connected) {
                    setError("이전 방을 확인했지만 서버 연결이 지연되고 있습니다.");
                    return;
                }
                const response = await emitWithAck<RoomPublic>("room:rejoin", saved);
                if (!response.ok || !response.data) {
                    window.localStorage.removeItem(ROOM_SESSION_KEY);
                    return;
                }
                setRoom(response.data);
                setRoomCode(response.data.code);
            } finally {
                setLoadingInitialRoom(false);
            }
        };
        socket.on("connect", tryRejoin);
        void tryRejoin();
        return () => {
            socket.off("room:update", onRoomUpdate);
            socket.off("player:you", setOwnPlayerId);
            socket.off("room:kicked", onRoomRemoved);
            socket.off("room:closed", onRoomRemoved);
            socket.off("connect", tryRejoin);
        };
    }, [inviteCode, ownPlayerId, resetRoomSession]);

    useEffect(() => {
        if (!room?.code || !ownPlayerId) return;
        window.localStorage.setItem(
            ROOM_SESSION_KEY,
            JSON.stringify({ code: room.code, playerId: ownPlayerId } satisfies SavedRoomSession),
        );
    }, [room?.code, ownPlayerId]);

    useEffect(() => {
        if (room?.status !== "playing") return;
        for (const imageUrl of room.exam.problems.flatMap((problem) =>
            problem.imageUrl ? [problem.imageUrl] : [],
        )) {
            const image = new Image();
            image.decoding = "async";
            image.src = imageUrl;
        }
    }, [room?.status, room?.exam.problems]);

    const ownPlayer = useMemo<PlayerPublic | null>(() => {
        if (!room) return null;
        return room.players.find((player) => player.id === ownPlayerId) ?? null;
    }, [room, ownPlayerId]);

    const screen = getScreen(room, spectatorExam, ownPlayerId);
    const isInviteMode = screen === "home" && Boolean(inviteCode);
    const {
        referralCode,
        needsReferralGate,
        hasReferralVerification,
        referralVerification,
        completeReferralGate,
        exitReferralGate,
    } = useReferralGateState(screen);
    const rejoinSavedRoom = async (expectedCode?: string) => {
        const saved = readSavedRoomSession();
        if (!saved || (expectedCode && saved.code !== expectedCode)) return null;
        const connected = await waitForSocketConnection();
        if (!connected) {
            setError("이전 방을 확인했지만 서버 연결이 지연되고 있습니다.");
            return null;
        }
        const response = await emitWithAck<RoomPublic>("room:rejoin", saved);
        if (!response.ok || !response.data) {
            window.localStorage.removeItem(ROOM_SESSION_KEY);
            return null;
        }
        setRoom(response.data);
        setRoomCode(response.data.code);
        return response.data;
    };

    const restoreSavedEventRoom = async (eventId: string) => {
        const restoredRoom = await rejoinSavedRoom();
        if (!restoredRoom) return false;
        if (restoredRoom.exam.id === eventId) return true;
        await emitWithAck("room:leave", {});
        window.localStorage.removeItem(ROOM_SESSION_KEY);
        clearRoomView("");
        return false;
    };

    const leaveRoom = async () => {
        const leavingRoom = room;
        await emitWithAck("room:leave", {});
        if (leavingRoom?.status === "lobby") {
            resetRoomSession("");
            return;
        }
        clearRoomView("");
    };

    const registerForEvent = async (eventId: string) => {
        if (pendingEventAction) return;
        setError("");
        const event = events.find((event) => event.id === eventId);
        if (event?.registration !== "open" && !hasReferralVerification && !campaignUser) {
            await spectateEvent(eventId);
            return;
        }
        setPendingEventAction({ eventId, action: "register" });
        try {
            if (await restoreSavedEventRoom(eventId)) return;
            const response = await emitWithAck<RoomPublic>("event:register", {
                eventId,
                nickname: campaignUser
                    ? entrantNickname(campaignUser)
                    : referralVerification?.nickname || "예비응시자",
                referralVerification: campaignUser ? undefined : referralVerification ?? undefined,
            });
            if (!response.ok || !response.data) {
                setError(response.error ?? "등록 실패");
                return;
            }
            setRoom(response.data);
            setRoomCode(response.data.code);
        } finally {
            setPendingEventAction(null);
        }
    };

    const spectateEvent = async (eventId: string) => {
        if (pendingEventAction) return;
        setError("");
        setPendingEventAction({ eventId, action: "spectate" });
        try {
            const response = await emitWithAck<RoomPublic>("event:spectate", {
                eventId,
            });
            if (!response.ok || !response.data) {
                setError(response.error ?? "관전 입장 실패");
                return;
            }
            setSpectatorExam(null);
            setRoom(response.data);
            setRoomCode(response.data.code);
        } catch (_error) {
            setError("관전 입장 실패");
        } finally {
            setPendingEventAction(null);
        }
    };

    const joinRoom = async () => {
        setError("");
        const code = roomCode.trim().toUpperCase();
        const restoredRoom = await rejoinSavedRoom(code);
        if (restoredRoom) return;
        const response = await emitWithAck<RoomPublic>("room:join", {
            code,
            nickname,
        });
        if (!response.ok || !response.data) {
            setError(response.error ?? "입장 실패");
            return;
        }
        setRoom(response.data);
    };

    const joinInviteRoom = async () => {
        if (joiningInvite) return;
        setJoiningInvite(true);
        try {
            await joinRoom();
        } finally {
            setJoiningInvite(false);
        }
    };

    const exitInviteMode = () => {
        setError("");
        setJoiningInvite(false);
        setInviteCode("");
        setRoomCode("");
        const url = new URL(window.location.href);
        url.searchParams.delete("room");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    };

    const copyCode = async () => {
        if (!room) return;
        await writeClipboard(room.code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    };

    const copyInviteLink = async () => {
        if (!room) return;
        const url = new URL(window.location.href);
        url.search = "";
        url.hash = "";
        url.searchParams.set("room", room.code);
        await writeClipboard(url.toString());
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 1200);
    };

    if (loadingInitialRoom || !eventsLoaded) {
        return (
            <AppLoading
                inviteCode={inviteCode}
                needsReferralGate={needsReferralGate}
                referralCode={referralCode}
                completeReferralGate={completeReferralGate}
                exitReferralGate={exitReferralGate}
            />
        );
    }

    return (
        <AppRoutes
            screen={screen}
            needsReferralGate={needsReferralGate}
            referralCode={referralCode}
            completeReferralGate={completeReferralGate}
            exitReferralGate={exitReferralGate}
            events={events}
            eventsUnavailable={eventsUnavailable}
            campaignUser={campaignUser}
            referralVerification={referralVerification}
            hasReferralVerification={hasReferralVerification}
            nickname={nickname}
            setNickname={setNickname}
            joinInviteRoom={joinInviteRoom}
            inviteMode={isInviteMode}
            inviteCode={inviteCode}
            joiningInvite={joiningInvite}
            exitInviteMode={exitInviteMode}
            registerForEvent={registerForEvent}
            spectateEvent={spectateEvent}
            pendingEventAction={pendingEventAction}
            spectatorExam={spectatorExam}
            exitSpectator={() => setSpectatorExam(null)}
            room={room}
            ownPlayer={ownPlayer}
            copyCode={copyCode}
            copied={copied}
            copyInviteLink={copyInviteLink}
            copiedLink={copiedLink}
            leaveRoom={leaveRoom}
            error={error}
        />
    );
}
