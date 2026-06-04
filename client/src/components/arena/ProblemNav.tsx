import type React from "react";
import { useMemo } from "react";
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
  const solvedProblemIds = useMemo(
    () => new Set(ownPlayer.submissions.filter((submission) => submission.correct).map((submission) => submission.problemId)),
    [ownPlayer.submissions]
  );
  const roomSolvedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of room.players) {
      const playerSolved = new Set(player.submissions.filter((submission) => submission.correct).map((submission) => submission.problemId));
      for (const problemId of playerSolved) counts.set(problemId, (counts.get(problemId) ?? 0) + 1);
    }
    return counts;
  }, [room.players]);

  return (
    <nav className="problem-nav">
      {problems.map((problem) => {
        const solved = solvedProblemIds.has(problem.id);
        const solvedByRoom = roomSolvedCounts.get(problem.id) ?? 0;
        const solveRate = room.players.length === 0 ? 0 : Math.round((solvedByRoom / room.players.length) * 100);
        const disabled = hardLocked && problem.difficulty < 4;
        return (
          <button
            key={problem.id}
            className={[problem.id === currentProblem.id ? "active" : "", solved ? "solved" : ""].filter(Boolean).join(" ")}
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
