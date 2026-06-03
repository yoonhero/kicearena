import type React from "react";
import type { PlayerPublic, ProblemPublic, RoomPublic } from "../../../../shared/game";
import { socket } from "../../lib/socket";

export function ProblemNav({
  problems,
  currentProblem,
  hardLocked,
  ownPlayer,
  room
}: {
  problems: ProblemPublic[];
  currentProblem: ProblemPublic;
  hardLocked: boolean;
  ownPlayer: PlayerPublic;
  room: RoomPublic;
}) {
  return (
    <nav className="problem-nav">
      {problems.map((problem) => {
        const solved = ownPlayer.submissions.some((submission) => submission.problemId === problem.id && submission.correct);
        const solvedByRoom = room.players.filter((player) => player.submissions.some((submission) => submission.problemId === problem.id && submission.correct)).length;
        const solveRate = room.players.length === 0 ? 0 : Math.round((solvedByRoom / room.players.length) * 100);
        const disabled = hardLocked && problem.difficulty < 4;
        return (
          <button
            key={problem.id}
            className={problem.id === currentProblem.id ? "active" : solved ? "solved" : ""}
            disabled={disabled}
            onClick={() => socket.emit("problem:set", { problemId: problem.id })}
            title={disabled ? "고난도 문제부터 풀어라 발동 중" : `${problem.number}번 · ${solveRate}% 풀이`}
            style={{ "--solve-rate": `${solveRate}%` } as React.CSSProperties & Record<string, string>}
          >
            <span>{problem.number}</span>
            <em>{solveRate}%</em>
          </button>
        );
      })}
    </nav>
  );
}
