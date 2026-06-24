import { useCallback, useEffect, useMemo, useState } from "react";
import type { CampaignUserPublic } from "../../shared/campaign";
import {
    type ExamPublic,
    type GymEventSummary,
    type PlayerPublic,
    type RoomPublic,
} from "../../shared/game";
import { AppLoading, AppRoutes } from "./components/AppRoutes";
import { useReferralGateState } from "./hooks/useReferralGateState";
import {
    getScreen,
    readInviteCode,
    readReferralCode,
    readSitePage,
    writeClipboard,
} from "./lib/appFlow";
import { entrantNickname, readStoredCampaignUser } from "./lib/campaignSession";
import { sitePathForPage, type SitePage } from "./lib/siteRoutes";
import { usePracticeRoomFlow } from "./hooks/usePracticeRoomFlow";

type PendingEventAction = { eventId: string; action: "register" | "spectate" } | null;
type SocketModule = typeof import("./lib/socket");

const needsSpectatorFallback = (
    event: GymEventSummary | undefined,
    verifiedCampaignUser: CampaignUserPublic | null,
) =>
    Boolean(
        event &&
        !verifiedCampaignUser &&
        (event.status !== "ended" || !isPreliminaryEvent(event)) &&
        (event.registration !== "open" || !isPreliminaryEvent(event)),
    );

const isPreliminaryEvent = (event: Pick<GymEventSummary, "id" | "title">) =>
    event.id === "preliminary-day" || event.title.includes("예비소집일");

const emitWithAck = async <T,>(event: string, payload?: unknown) => {
    const socketModule: SocketModule = await import("./lib/socket");
    return socketModule.emitWithAck<T>(event, payload);
};

export function App() {
    const [inviteCode, setInviteCode] = useState(readInviteCode);
    const [page, setPageState] = useState<SitePage>(() =>
        readInviteCode() ? "competition" : readReferralCode() ? "signup" : readSitePage(),
    );
    const [events, setEvents] = useState<GymEventSummary[]>([]);
    const [spectatorExam, setSpectatorExam] = useState<ExamPublic | null>(null);
    const [campaignUser, setCampaignUser] = useState<CampaignUserPublic | null>(
        readStoredCampaignUser,
    );
    const [nickname, setNickname] = useState("");
    const [roomCode, setRoomCode] = useState(inviteCode);
    const [room, setRoom] = useState<RoomPublic | null>(null);
    const [ownPlayerId, setOwnPlayerId] = useState("");
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [joiningInvite, setJoiningInvite] = useState(false);
    const [pendingEventAction, setPendingEventAction] = useState<PendingEventAction>(null);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [eventsUnavailable, setEventsUnavailable] = useState(false);
    const practiceRoom = usePracticeRoomFlow({
        emitWithAck,
        nickname,
        roomCode,
        setError,
        setRoom,
        setRoomCode,
    });

    const resetRoomSession = useCallback((nextRoomCode = "") => {
        setRoom(null);
        setOwnPlayerId("");
        setRoomCode(nextRoomCode);
    }, []);

    const clearRoomView = useCallback((nextRoomCode = "") => {
        setRoom(null);
        setOwnPlayerId("");
        setRoomCode(nextRoomCode);
    }, []);

    const setPage = useCallback((nextPage: SitePage) => {
        setPageState(nextPage);
        const path = sitePathForPage(nextPage);
        const url = new URL(window.location.href);
        url.pathname = path;
        if (nextPage !== "signup") url.searchParams.delete("c");
        window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }, []);

    useEffect(() => {
        const onPopState = () =>
            setPageState(
                readInviteCode() ? "competition" : readReferralCode() ? "signup" : readSitePage(),
            );
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    const ownPlayer = useMemo<PlayerPublic | null>(() => {
        if (!room) return null;
        return room.players.find((player) => player.id === ownPlayerId) ?? null;
    }, [room, ownPlayerId]);

    const screen = getScreen(room, spectatorExam, ownPlayerId);
    const shouldLoadEvents = screen === "home" && (page === "competition" || Boolean(inviteCode));

    useEffect(() => {
        if (!shouldLoadEvents || eventsLoaded) return;
        let cancelled = false;
        fetch("/api/events")
            .then((res) => {
                if (!res.ok) throw new Error(`events:${res.status}`);
                return res.json();
            })
            .then((data: GymEventSummary[]) => {
                if (cancelled) return;
                setEvents(data);
                setEventsUnavailable(false);
            })
            .catch((error) => {
                if (cancelled) return;
                setEventsUnavailable(true);
                console.warn("Failed to load gym events", error);
            })
            .finally(() => {
                if (!cancelled) setEventsLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [eventsLoaded, shouldLoadEvents]);

    useEffect(() => {
        let cleanup: (() => void) | undefined;
        let cancelled = false;
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
        void import("./lib/socket").then(({ socket }) => {
            if (cancelled) return;
            socket.on("room:update", onRoomUpdate);
            socket.on("player:you", setOwnPlayerId);
            socket.on("room:kicked", onRoomRemoved);
            socket.on("room:closed", onRoomRemoved);
            cleanup = () => {
                socket.off("room:update", onRoomUpdate);
                socket.off("player:you", setOwnPlayerId);
                socket.off("room:kicked", onRoomRemoved);
                socket.off("room:closed", onRoomRemoved);
            };
        });
        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [ownPlayerId, resetRoomSession]);

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

    const isInviteMode = screen === "home" && Boolean(inviteCode);
    const {
        referralCode,
        needsReferralGate,
        hasReferralVerification,
        referralVerification,
        completeReferralGate,
        exitReferralGate,
    } = useReferralGateState(screen);
    const completeReferralAndSignup = (
        verification: Parameters<typeof completeReferralGate>[0],
    ) => {
        completeReferralGate(verification);
        setPage("signup");
    };
    const exitReferralToCompetition = () => {
        exitReferralGate();
        setPage("competition");
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
        const verifiedCampaignUser = campaignUser?.emailVerified ? campaignUser : null;
        if (needsSpectatorFallback(event, verifiedCampaignUser)) {
            await spectateEvent(eventId);
            return;
        }
        setPendingEventAction({ eventId, action: "register" });
        try {
            const response = await emitWithAck<RoomPublic>("event:register", {
                eventId,
                nickname: verifiedCampaignUser
                    ? entrantNickname(verifiedCampaignUser)
                    : referralVerification?.nickname || "예비응시자",
                referralVerification: verifiedCampaignUser
                    ? undefined
                    : (referralVerification ?? undefined),
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

    const joinInviteRoom = async () => {
        if (joiningInvite) return;
        setJoiningInvite(true);
        try {
            await practiceRoom.joinRoom();
        } finally {
            setJoiningInvite(false);
        }
    };

    const exitInviteMode = () => {
        setError("");
        setJoiningInvite(false);
        setInviteCode("");
        setPageState(readSitePage());
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

    if (shouldLoadEvents && !eventsLoaded) {
        return (
            <AppLoading
                inviteCode={inviteCode}
                needsReferralGate={needsReferralGate}
                referralCode={referralCode}
                completeReferralGate={completeReferralAndSignup}
                exitReferralGate={exitReferralToCompetition}
            />
        );
    }

    return (
        <AppRoutes
            screen={screen}
            page={inviteCode ? "competition" : page}
            setPage={setPage}
            needsReferralGate={needsReferralGate}
            referralCode={referralCode}
            completeReferralGate={completeReferralAndSignup}
            exitReferralGate={exitReferralToCompetition}
            events={events}
            eventsUnavailable={eventsUnavailable}
            campaignUser={campaignUser}
            setCampaignUser={setCampaignUser}
            referralVerification={referralVerification}
            hasReferralVerification={hasReferralVerification}
            nickname={nickname}
            setNickname={setNickname}
            exams={practiceRoom.exams}
            selectedExamId={practiceRoom.selectedExamId}
            setSelectedExamId={practiceRoom.setSelectedExamId}
            timeLimitMin={practiceRoom.timeLimitMin}
            setTimeLimitMin={practiceRoom.setTimeLimitMin}
            freezeBeforeMin={practiceRoom.freezeBeforeMin}
            setFreezeBeforeMin={practiceRoom.setFreezeBeforeMin}
            itemEnabled={practiceRoom.itemEnabled}
            setItemEnabled={practiceRoom.setItemEnabled}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            createRoom={practiceRoom.createRoom}
            joinRoom={practiceRoom.joinRoom}
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
