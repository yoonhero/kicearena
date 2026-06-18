import { BarChart3, EyeOff, LogOut, ShieldAlert, Trophy } from "lucide-react";
import type { PlayerPublic, RoomPublic } from "../../../../shared/game";
import { formatPenalty } from "../../lib/format";
import { KiceClock } from "../common/KiceClock";

export function ArenaTopbar({
    room,
    ownPlayer,
    solvedCount,
    timeLeft,
    showRankings,
    endExamEarly,
    leaveRoom,
}: {
    room: RoomPublic;
    ownPlayer: PlayerPublic;
    solvedCount: number;
    timeLeft: number;
    showRankings: () => void;
    endExamEarly: () => void;
    leaveRoom: () => void;
}) {
    const isHost = ownPlayer.id === room.hostId;
    return (
        <div className="arena-topbar">
            <KiceClock timeLeft={timeLeft} totalTime={room.timeLimitSec} />
            <div className="compact-stats">
                <span>
                    <Trophy size={15} />
                    {ownPlayer.score}점
                </span>
                <span>페널티 {formatPenalty(ownPlayer.penaltyMs)}</span>
                <span>
                    {solvedCount}/{room.exam.problemCount}
                </span>
                <span>오답 {ownPlayer.consecutiveWrong}</span>
                {room.scoreboardFrozen && (
                    <span className="freeze-chip">
                        <EyeOff size={15} />
                        순위 비공개
                    </span>
                )}
            </div>
            <div className="topbar-actions">
                <button className="status-link ranking-link" onClick={showRankings}>
                    <BarChart3 size={16} />
                    순위표
                </button>
                <button className="status-link" onClick={leaveRoom}>
                    <LogOut size={16} />
                    퇴실
                </button>
                {isHost && (
                    <button className="status-link danger-link" onClick={endExamEarly}>
                        <ShieldAlert size={16} />
                        시험 종료
                    </button>
                )}
            </div>
        </div>
    );
}
