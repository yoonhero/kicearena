import { LogOut } from "lucide-react";
import type { PlayerPublic, RoomPublic } from "../../../shared/game";
import { formatPenalty, formatReportDate } from "../lib/format";
import { makeReportMetric } from "../lib/report";

export function FinalReportView({
  room,
  ownPlayer,
  players,
  onLeave
}: {
  room: RoomPublic;
  ownPlayer: PlayerPublic | null;
  players: PlayerPublic[];
  onLeave: () => Promise<void>;
}) {
  return (
    <main className="results-layout">
      <section className="exam-sheet result-sheet final-report-sheet">
        <div className="report-watermark" aria-hidden="true">
          <div className="release-stamp">공개</div>
        </div>
        <div className="exam-head final-report-head">
          <span>채점 완료</span>
          <strong>성적통지표</strong>
        </div>
        <div className="score-report-title">
          <strong>{formatReportDate()} 시행 성적통지표</strong>
          <em>{room.exam.title}</em>
        </div>
        <div className="final-report-actions">
          <span>{ownPlayer ? `${ownPlayer.nickname} 성적 확인 완료` : "성적 확인 완료"}</span>
          <button className="leave-report-btn" type="button" onClick={() => void onLeave()}>
            <LogOut size={18} />
            시험실 나가기
          </button>
        </div>
        <div className="final-report-table">
          <div className="final-report-row final-report-row-head">
            <span>등급</span>
            <span>성명</span>
            <span>표준점수</span>
            <span>원점수</span>
            <span>페널티</span>
            <span>정답 문항</span>
          </div>
          {players.map((player) => {
            const metric = makeReportMetric(players, player.score);
            return (
              <div key={player.id} className={`final-report-row ${ownPlayer?.id === player.id ? "me" : ""}`}>
                <span>{metric.grade}</span>
                <strong>{player.nickname}</strong>
                <em>{metric.standardScore}</em>
                <em>{player.score}</em>
                <em>{formatPenalty(player.penaltyMs)}</em>
                <span>{player.scoreBreakdown.solved}/{room.exam.problemCount}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
