import { memo, useCallback, useMemo } from "react";
import { Copy, Crown, Flag, Link, LogOut, Play, UserX, Users } from "lucide-react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { emitWithAck } from "../lib/socket";
import { socket } from "../lib/socket";

const formatMinutes = (seconds: number) => `${Math.round(seconds / 60)}분`;

type LobbyPlayerRowProps = {
  player: PlayerPublic;
  isHostPlayer: boolean;
  canKick: boolean;
  onKick: (targetPlayerId: string) => void;
};

const LobbyPlayerRow = memo(
  function LobbyPlayerRow({ player, isHostPlayer, canKick, onKick }: LobbyPlayerRowProps) {
    const statusLabel = player.connected ? (player.ready ? "준비" : "대기") : "접속 끊김";
    return (
      <div className="player-chip">
        <span>{player.nickname}</span>
        {isHostPlayer && <Crown size={15} aria-label="감독" />}
        <em className={player.ready ? "ready" : undefined}>{statusLabel}</em>
        {canKick && (
          <button type="button" className="kick-player-btn" onClick={() => onKick(player.id)} title={`${player.nickname} 추방`} aria-label={`${player.nickname} 추방`}>
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
    prev.canKick === next.canKick
);

export function LobbyScreen({
  room,
  ownPlayer,
  copyCode,
  copied,
  copyInviteLink,
  copiedLink,
  leaveRoom
}: {
  room: RoomPublic;
  ownPlayer: PlayerPublic | null;
  copyCode: () => void;
  copied: boolean;
  copyInviteLink: () => void;
  copiedLink: boolean;
  leaveRoom: () => Promise<void>;
}) {
  const isHost = ownPlayer?.id === room.hostId;
  const readyCount = useMemo(() => room.players.reduce((count, player) => count + (player.ready ? 1 : 0), 0), [room.players]);
  const allReady = readyCount === room.players.length;
  const totalPoints = useMemo(() => room.exam.problems.reduce((sum, problem) => sum + problem.pointValue, 0), [room.exam.problems]);
  const modeLabel = room.mode === "contest" ? "콘테스트" : "캐주얼";
  const itemLabel = room.itemEnabled ? "아이템 사용" : "아이템 없음";
  const actionStatus = useMemo(
    () =>
      isHost
        ? allReady
          ? "모든 응시자가 준비했습니다."
          : `${readyCount}/${room.players.length}명 준비`
        : ownPlayer?.ready
          ? "감독이 시험을 시작할 수 있습니다."
          : "준비 완료를 누르면 감독이 시작할 수 있습니다.",
    [allReady, isHost, ownPlayer?.ready, readyCount, room.players.length]
  );
  const kickPlayer = useCallback((targetPlayerId: string) => {
    void emitWithAck<RoomPublic>("room:kick", { targetPlayerId });
  }, []);
  const toggleReady = useCallback(() => socket.emit("player:ready", { ready: !ownPlayer?.ready }), [ownPlayer?.ready]);
  const startRoom = useCallback(() => socket.emit("room:start"), []);
  const handleLeave = useCallback(() => {
    void leaveRoom();
  }, [leaveRoom]);
  return (
    <main className="lobby-layout">
      <section className="exam-sheet lobby-sheet">
        <div className="exam-head">
          <span>입실 확인</span>
          <strong>{room.exam.title}</strong>
        </div>
        <div className="room-code">
          <span>시험실</span>
          <button className="room-code-copy-btn" onClick={copyCode} title="시험실 코드 복사" aria-label={`시험실 코드 ${room.code} 복사`}>
            <strong>{room.code}</strong>
            <Copy size={18} />
          </button>
          {copied && <em>복사됨</em>}
          <button className="invite-link-btn" onClick={copyInviteLink} title="초대 링크 복사">
            <Link size={18} />
            초대 링크
          </button>
          {copiedLink && <em>링크 복사됨</em>}
        </div>
        <div className="problem-preview-grid">
          <span>
            {room.exam.problems.length}문항
            <small>총 {totalPoints}점</small>
          </span>
          <span>
            {formatMinutes(room.timeLimitSec)}
            <small>제한 시간</small>
          </span>
          <span>
            {formatMinutes(room.freezeBeforeSec)} 전
            <small>공개 순위 고정</small>
          </span>
          <span>
            {modeLabel}
            <small>{itemLabel}</small>
          </span>
        </div>
        <div className="lobby-attendance">
          <div className="attendance-head">
            <h2>
              <Users size={20} />
              응시자 확인
            </h2>
            <span>{room.players.length}/{room.maxPlayers}명 입실 · {readyCount}명 준비</span>
          </div>
          <div className="player-list">
            {room.players.map((player) => (
              <LobbyPlayerRow key={player.id} player={player} isHostPlayer={player.id === room.hostId} canKick={isHost && player.id !== room.hostId} onKick={kickPlayer} />
            ))}
          </div>
          <div className="lobby-actions">
            <span className="lobby-action-status" aria-live="polite">
              {actionStatus}
            </span>
            {!isHost && (
              <button className="primary-btn" onClick={toggleReady}>
                <Flag size={18} />
                {ownPlayer?.ready ? "준비 취소" : "준비 완료"}
              </button>
            )}
            {isHost && (
              <button className="primary-btn" disabled={!allReady} onClick={startRoom}>
                <Play size={18} />
                시험 시작
              </button>
            )}
            <button className="secondary-btn lobby-leave-btn" type="button" onClick={handleLeave}>
              <LogOut size={18} />
              나가기
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
