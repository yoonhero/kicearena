import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    Clock,
    Copy,
    Crown,
    Flag,
    Link,
    LogOut,
    Play,
    UserX,
    Users,
} from "lucide-react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { emitWithAck } from "../lib/socket";
import { socket } from "../lib/socket";
import { formatTime } from "../lib/format";

const formatMinutes = (seconds: number) => `${Math.round(seconds / 60)}분`;

type LobbyPlayerRowProps = {
    player: PlayerPublic;
    isHostPlayer: boolean;
    canKick: boolean;
    onKick: (targetPlayerId: string) => void;
};

type LobbyTiming = {
    startsInSec: number;
    isTimedEventWaiting: boolean;
};

type LobbyActionStatus = {
    title: string;
    detail: string;
};

const LobbyPlayerRow = memo(
    function LobbyPlayerRow({ player, isHostPlayer, canKick, onKick }: LobbyPlayerRowProps) {
        const statusLabel = player.connected ? (player.ready ? "준비" : "대기") : "접속 끊김";
        const statusClassName = player.connected
            ? player.ready
                ? "ready"
                : undefined
            : "disconnected";
        return (
            <div className="player-chip">
                <span>{player.nickname}</span>
                {isHostPlayer && <Crown size={15} aria-label="감독" />}
                <em className={statusClassName}>{statusLabel}</em>
                {canKick && (
                    <button
                        type="button"
                        className="kick-player-btn"
                        onClick={() => onKick(player.id)}
                        title={`${player.nickname} 추방`}
                        aria-label={`${player.nickname} 추방`}
                    >
                        <UserX size={15} />
                    </button>
                )}
            </div>
        );
    },
    (prev, next) =>
        prev.player.id === next.player.id &&
        prev.player.nickname === next.player.nickname &&
        prev.player.ready === next.player.ready &&
        prev.player.connected === next.player.connected &&
        prev.isHostPlayer === next.isHostPlayer &&
        prev.canKick === next.canKick,
);

function getLobbyTiming(room: RoomPublic, now: number): LobbyTiming {
    const startsAtMs = room.startsAt ? Date.parse(room.startsAt) : NaN;
    const startsInSec =
        Number.isFinite(startsAtMs) && room.status === "lobby"
            ? Math.max(0, Math.ceil((startsAtMs - now) / 1000))
            : 0;
    return {
        startsInSec,
        isTimedEventWaiting: room.eventRoom && Number.isFinite(startsAtMs) && startsInSec > 0,
    };
}

function getLobbyActionStatus({
    allReady,
    isHost,
    isSpectator,
    isTimedEventWaiting,
    ownPlayer,
    readyCount,
    playerCount,
}: {
    allReady: boolean;
    isHost: boolean;
    isSpectator: boolean;
    isTimedEventWaiting: boolean;
    ownPlayer: PlayerPublic | null;
    readyCount: number;
    playerCount: number;
}): LobbyActionStatus {
    if (isSpectator) {
        return {
            title: "관전 대기 중입니다.",
            detail: "문제 제출 없이 입실 현황과 순위표를 확인할 수 있습니다.",
        };
    }
    if (isTimedEventWaiting) {
        return {
            title: "등록 완료. 공개 시각까지 대기합니다.",
            detail: "시간이 되면 문제지를 한 번에 받아 풀이 화면으로 이동합니다.",
        };
    }
    if (isHost && allReady) {
        return {
            title: "시험을 시작할 수 있습니다.",
            detail: "시작하면 모든 응시자가 문제 풀이 화면으로 이동합니다.",
        };
    }
    if (isHost) {
        return {
            title: `${readyCount}/${playerCount}명 준비`,
            detail: "모든 응시자가 준비하면 시험을 시작할 수 있습니다.",
        };
    }
    if (ownPlayer?.ready) {
        return {
            title: "준비 완료 상태입니다.",
            detail: "감독이 시험을 시작하면 바로 풀이가 시작됩니다.",
        };
    }
    return {
        title: "준비 완료를 눌러주세요.",
        detail: "준비가 끝나야 감독이 시험을 시작할 수 있습니다.",
    };
}

function LobbyCountdown({ timing }: { timing: LobbyTiming }) {
    return (
        <div className="lobby-countdown" aria-live="polite">
            <span>
                <Clock size={18} />
                {timing.isTimedEventWaiting ? "공개까지" : "문제지 배부 대기"}
            </span>
            <strong>{timing.isTimedEventWaiting ? formatTime(timing.startsInSec) : "00:00"}</strong>
            <small>
                {timing.isTimedEventWaiting
                    ? "로비에서 인원과 상태를 확인하며 기다립니다."
                    : "문제를 불러오고 있습니다."}
            </small>
        </div>
    );
}

function LobbyActions({
    actionStatus,
    allReady,
    isHost,
    isTimedEventWaiting,
    ownPlayer,
    onLeave,
    onStart,
    onToggleReady,
}: {
    actionStatus: LobbyActionStatus;
    allReady: boolean;
    isHost: boolean;
    isTimedEventWaiting: boolean;
    ownPlayer: PlayerPublic | null;
    onLeave: () => void;
    onStart: () => void;
    onToggleReady: () => void;
}) {
    return (
        <div className={`lobby-actions ${isHost ? "host-actions" : "examinee-actions"}`}>
            <strong className="lobby-action-title">
                <CheckCircle2 size={18} />
                시작 확인
            </strong>
            <span className="lobby-action-status" aria-live="polite">
                <strong>{actionStatus.title}</strong>
                <span>{actionStatus.detail}</span>
            </span>
            {!isHost && ownPlayer && !isTimedEventWaiting && (
                <button className="primary-btn" onClick={onToggleReady}>
                    <Flag size={18} />
                    {ownPlayer.ready ? "준비 취소" : "준비 완료"}
                </button>
            )}
            {isHost && !isTimedEventWaiting && (
                <button className="primary-btn" disabled={!allReady} onClick={onStart}>
                    <Play size={18} />
                    시험 시작
                </button>
            )}
            <button className="secondary-btn lobby-leave-btn" type="button" onClick={onLeave}>
                <LogOut size={18} />
                나가기
            </button>
        </div>
    );
}

export function LobbyScreen({
    room,
    ownPlayer,
    copyCode,
    copied,
    copyInviteLink,
    copiedLink,
    leaveRoom,
}: {
    room: RoomPublic;
    ownPlayer: PlayerPublic | null;
    copyCode: () => void;
    copied: boolean;
    copyInviteLink: () => void;
    copiedLink: boolean;
    leaveRoom: () => Promise<void>;
}) {
    const [now, setNow] = useState(Date.now());
    const isHost = ownPlayer?.id === room.hostId;
    const isSpectator = !ownPlayer;
    const timing = getLobbyTiming(room, now);
    const readyCount = useMemo(
        () => room.players.reduce((count, player) => count + (player.ready ? 1 : 0), 0),
        [room.players],
    );
    const allReady = readyCount === room.players.length;
    const totalPoints = useMemo(
        () => room.exam.problems.reduce((sum, problem) => sum + problem.pointValue, 0),
        [room.exam.problems],
    );
    const totalPointLabel = room.exam.problems.length > 0 ? `총 ${totalPoints}점` : "공개 전";
    const modeLabel = room.mode === "contest" ? "콘테스트" : "캐주얼";
    const itemLabel = room.itemEnabled ? "아이템 사용" : "아이템 없음";
    const freezeLabel = `${formatMinutes(room.freezeBeforeSec)} 전`;
    const actionStatus = getLobbyActionStatus({
        allReady,
        isHost,
        isSpectator,
        isTimedEventWaiting: timing.isTimedEventWaiting,
        ownPlayer,
        readyCount,
        playerCount: room.players.length,
    });
    useEffect(() => {
        if (!room.eventRoom || room.status !== "lobby" || !room.startsAt) return undefined;
        const id = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(id);
    }, [room.eventRoom, room.startsAt, room.status]);
    useEffect(() => {
        if (!room.eventRoom || room.status !== "lobby" || !room.startsAt) return;
        const startsAt = Date.parse(room.startsAt);
        if (!Number.isFinite(startsAt) || now < startsAt) return;
        void emitWithAck<RoomPublic>("room:start-if-released", {});
    }, [now, room.eventRoom, room.startsAt, room.status]);
    const kickPlayer = useCallback((targetPlayerId: string) => {
        void emitWithAck<RoomPublic>("room:kick", { targetPlayerId });
    }, []);
    const toggleReady = useCallback(
        () => socket.emit("player:ready", { ready: !ownPlayer?.ready }),
        [ownPlayer?.ready],
    );
    const startRoom = useCallback(() => socket.emit("room:start"), []);
    const handleLeave = useCallback(() => {
        void leaveRoom();
    }, [leaveRoom]);
    return (
        <main className="lobby-layout">
            <section className="exam-sheet lobby-sheet">
                <header className="exam-head">
                    <span>입실 확인</span>
                    <h1>{room.exam.title}</h1>
                </header>
                <div className="room-code">
                    <span>시험실 코드</span>
                    <button
                        className="room-code-copy-btn"
                        onClick={copyCode}
                        title="시험실 코드 복사"
                        aria-label={`시험실 코드 ${room.code} 복사`}
                    >
                        <strong>{room.code}</strong>
                        <Copy size={18} />
                    </button>
                    {copied && <em>코드 복사됨</em>}
                    <button
                        className="invite-link-btn"
                        onClick={copyInviteLink}
                        title="초대 링크 복사"
                    >
                        <Link size={18} />
                        초대 링크 복사
                    </button>
                    {copiedLink && <em>링크 복사됨</em>}
                </div>
                {room.eventRoom && room.status === "lobby" && <LobbyCountdown timing={timing} />}
                <div className="problem-preview-grid" aria-label="시험 설정">
                    <span>
                        <strong>{room.exam.problemCount}문항</strong>
                        <small>{totalPointLabel}</small>
                    </span>
                    <span>
                        <strong>{formatMinutes(room.timeLimitSec)}</strong>
                        <small>제한 시간</small>
                    </span>
                    <span>
                        <strong>{freezeLabel}</strong>
                        <small>공개 순위 고정</small>
                    </span>
                    <span>
                        <strong>{modeLabel}</strong>
                        <small>{itemLabel}</small>
                    </span>
                </div>
                <div className="lobby-attendance">
                    <div className="attendance-head">
                        <h2>
                            <Users size={20} />
                            응시자 확인
                        </h2>
                        <span>
                            {room.players.length}/{room.maxPlayers}명 등록 · 관전{" "}
                            {room.spectatorCount}명 · {readyCount}명 준비
                        </span>
                    </div>
                    <div className="player-list">
                        {room.players.map((player) => (
                            <LobbyPlayerRow
                                key={player.id}
                                player={player}
                                isHostPlayer={player.id === room.hostId}
                                canKick={isHost && player.id !== room.hostId}
                                onKick={kickPlayer}
                            />
                        ))}
                    </div>
                    <LobbyActions
                        actionStatus={actionStatus}
                        allReady={allReady}
                        isHost={isHost}
                        isTimedEventWaiting={timing.isTimedEventWaiting}
                        ownPlayer={ownPlayer}
                        onLeave={handleLeave}
                        onStart={startRoom}
                        onToggleReady={toggleReady}
                    />
                </div>
            </section>
        </main>
    );
}
