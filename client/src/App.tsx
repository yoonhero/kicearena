import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ROOM_GUARDRAILS, type ExamSummary, type PlayerPublic, type RoomPublic } from "../../shared/game";
import { ArenaScreen } from "./screens/ArenaScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { emitWithAck, ROOM_SESSION_KEY, socket } from "./lib/socket";

type Screen = "home" | "lobby" | "arena" | "results";
type SavedRoomSession = {
  code: string;
  playerId: string;
};

const readInviteCode = () => new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
const defaultFreezeForTimeLimit = (timeLimitMin: number) => Math.max(0, Math.min(timeLimitMin, Math.round(timeLimitMin / 2)));

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

export function App() {
  const inviteCode = useMemo(readInviteCode, []);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState(100);
  const [freezeBeforeMin, setFreezeBeforeMin] = useState(10);
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState(inviteCode);
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [joiningInvite, setJoiningInvite] = useState(false);
  const rejoinAttempted = useRef(false);

  const resetRoomSession = useCallback((nextRoomCode = "") => {
    window.localStorage.removeItem(ROOM_SESSION_KEY);
    setRoom(null);
    setOwnPlayerId("");
    setRoomCode(nextRoomCode);
    rejoinAttempted.current = false;
  }, []);

  useEffect(() => {
    fetch("/api/exams")
      .then((res) => res.json())
      .then((data: ExamSummary[]) => {
        setExams(data);
        const firstExam = data[0];
        const firstTimeLimitMin = Math.max(1, Math.round((firstExam?.timeLimitSec ?? 100 * 60) / 60));
        setSelectedExamId(firstExam?.id ?? "");
        setTimeLimitMin(firstTimeLimitMin);
        setFreezeBeforeMin(defaultFreezeForTimeLimit(firstTimeLimitMin));
      })
      .catch(() => setError("서버의 시험 목록을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    const onRoomUpdate = (nextRoom: RoomPublic) => {
      setRoom(nextRoom);
      if (ownPlayerId && !nextRoom.players.some((player) => player.id === ownPlayerId)) {
        resetRoomSession("");
      }
    };
    const onRoomRemoved = () => resetRoomSession("");
    socket.on("room:update", onRoomUpdate);
    socket.on("player:you", setOwnPlayerId);
    socket.on("room:kicked", onRoomRemoved);
    socket.on("room:closed", onRoomRemoved);
    const tryRejoin = async () => {
      if (rejoinAttempted.current) return;
      const raw = window.localStorage.getItem(ROOM_SESSION_KEY);
      if (!raw) return;
      rejoinAttempted.current = true;
      let saved: SavedRoomSession | null = null;
      try {
        saved = JSON.parse(raw) as SavedRoomSession;
      } catch {
        window.localStorage.removeItem(ROOM_SESSION_KEY);
        rejoinAttempted.current = false;
      }
      if (!saved?.code || !saved.playerId) {
        rejoinAttempted.current = false;
        return;
      }
      if (inviteCode && saved.code !== inviteCode) {
        window.localStorage.removeItem(ROOM_SESSION_KEY);
        rejoinAttempted.current = false;
        return;
      }
      const response = await emitWithAck<RoomPublic>("room:rejoin", saved);
      if (!response.ok || !response.data) {
        window.localStorage.removeItem(ROOM_SESSION_KEY);
        rejoinAttempted.current = false;
        return;
      }
      setRoom(response.data);
      setRoomCode(response.data.code);
    };
    socket.on("connect", tryRejoin);
    if (socket.connected) void tryRejoin();
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
    window.localStorage.setItem(ROOM_SESSION_KEY, JSON.stringify({ code: room.code, playerId: ownPlayerId } satisfies SavedRoomSession));
  }, [room?.code, ownPlayerId]);

  const ownPlayer = useMemo<PlayerPublic | null>(() => {
    if (!room) return null;
    return room.players.find((player) => player.id === ownPlayerId) ?? null;
  }, [room, ownPlayerId]);

  const screen: Screen = !room ? "home" : room.status === "lobby" ? "lobby" : room.status === "finished" ? "results" : "arena";
  const isInviteMode = screen === "home" && Boolean(inviteCode);

  const leaveRoom = async () => {
    await emitWithAck("room:leave", {});
    resetRoomSession("");
  };

  const createRoom = async () => {
    setError("");
    const maxTimeLimitMin = Math.round(ROOM_GUARDRAILS.maxTimeLimitSec / 60);
    const safeTimeLimitMin = Number.isFinite(timeLimitMin) ? Math.min(maxTimeLimitMin, Math.max(1, Math.round(timeLimitMin))) : 100;
    const safeFreezeBeforeMin = Number.isFinite(freezeBeforeMin) ? Math.max(0, Math.min(Math.round(freezeBeforeMin), safeTimeLimitMin)) : 10;
    const response = await emitWithAck<RoomPublic>("room:create", {
      examId: selectedExamId,
      nickname,
      timeLimitSec: safeTimeLimitMin * 60,
      freezeBeforeSec: safeFreezeBeforeMin * 60,
      itemEnabled: true
    });
    if (!response.ok || !response.data) {
      setError(response.error ?? "방 생성 실패");
      return;
    }
    setRoom(response.data);
    setRoomCode(response.data.code);
  };

  const joinRoom = async () => {
    setError("");
    const response = await emitWithAck<RoomPublic>("room:join", {
      code: roomCode,
      nickname
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

  return (
    <div className="app-shell">
      {screen === "home" && (
        <HomeScreen
          exams={exams}
          selectedExamId={selectedExamId}
          setSelectedExamId={setSelectedExamId}
          timeLimitMin={timeLimitMin}
          setTimeLimitMin={setTimeLimitMin}
          freezeBeforeMin={freezeBeforeMin}
          setFreezeBeforeMin={setFreezeBeforeMin}
          nickname={nickname}
          setNickname={setNickname}
          roomCode={roomCode}
          setRoomCode={setRoomCode}
          createRoom={createRoom}
          joinRoom={joinRoom}
          joinInviteRoom={joinInviteRoom}
          inviteMode={isInviteMode}
          inviteRoomCode={inviteCode}
          joiningInvite={joiningInvite}
          error={error}
        />
      )}

      {screen === "lobby" && room && (
        <LobbyScreen room={room} ownPlayer={ownPlayer} copyCode={copyCode} copied={copied} copyInviteLink={copyInviteLink} copiedLink={copiedLink} leaveRoom={leaveRoom} />
      )}

      {screen === "arena" && room && ownPlayer && <ArenaScreen room={room} ownPlayer={ownPlayer} onLeave={leaveRoom} />}

      {screen === "results" && room && <ResultsScreen room={room} ownPlayer={ownPlayer} onLeave={leaveRoom} />}
    </div>
  );
}
