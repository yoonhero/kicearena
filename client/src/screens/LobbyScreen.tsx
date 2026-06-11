import { Copy, Crown, Flag, Link, LogOut, Play, UserX, Users } from "lucide-react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { emitWithAck } from "../lib/socket";
import { socket } from "../lib/socket";

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
  const allReady = room.players.every((player) => player.ready);
  const kickPlayer = async (targetPlayerId: string) => {
    await emitWithAck<RoomPublic>("room:kick", { targetPlayerId });
  };
  return (
    <main className="lobby-layout">
      <section className="exam-sheet lobby-sheet">
        <div className="exam-head">
          <span>수험번호 확인</span>
          <strong>{room.exam.title}</strong>
        </div>
        <div className="room-code">
          <span>방 코드</span>
          <button onClick={copyCode} title="방 코드 복사">
            {room.code}
            <Copy size={18} />
          </button>
          {copied && <em>복사됨</em>}
          <button className="invite-link-btn" onClick={copyInviteLink} title="초대 링크 복사">
            <Link size={18} />
            링크
          </button>
          {copiedLink && <em>링크 복사됨</em>}
        </div>
        <div className="problem-preview-grid">
          {room.exam.problems.map((problem) => (
            <span key={problem.id}>
              {problem.number}
              <small>{problem.pointValue}점</small>
            </span>
          ))}
        </div>
        <div className="lobby-attendance">
          <div className="attendance-head">
            <h2>
              <Users size={20} />
              입실 현황
            </h2>
            <span>{room.players.length}/{room.maxPlayers}명 · {room.mode === "contest" ? "콘테스트" : "캐주얼"}</span>
          </div>
          <div className="player-list">
            {room.players.map((player) => (
              <div key={player.id} className="player-chip">
                <span>{player.nickname}</span>
                {player.id === room.hostId && <Crown size={15} />}
                <em>{player.ready ? "준비" : "대기"}</em>
                {isHost && player.id !== room.hostId && (
                  <button type="button" className="kick-player-btn" onClick={() => void kickPlayer(player.id)} title={`${player.nickname} 추방`} aria-label={`${player.nickname} 추방`}>
                    <UserX size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="lobby-actions">
            {!isHost && (
              <button className="primary-btn" onClick={() => socket.emit("player:ready", { ready: !ownPlayer?.ready })}>
                <Flag size={18} />
                {ownPlayer?.ready ? "준비 취소" : "준비 완료"}
              </button>
            )}
            {isHost && (
              <button className="primary-btn" disabled={!allReady} onClick={() => socket.emit("room:start")}>
                <Play size={18} />
                타종
              </button>
            )}
            <button className="secondary-btn lobby-leave-btn" type="button" onClick={() => void leaveRoom()}>
              <LogOut size={18} />
              나가기
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
