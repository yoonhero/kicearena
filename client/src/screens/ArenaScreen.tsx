import { useState } from "react";
import { ITEM_DEFINITIONS, type ItemAward, type ItemId, type PlayerPublic, type RoomPublic } from "../../../shared/game";
import { useCountdown } from "../hooks/useCountdown";
import { emitWithAck } from "../lib/socket";
import { ArenaTopbar } from "../components/arena/ArenaTopbar";
import { ProblemSheet } from "../components/arena/ProblemSheet";
import { RankingsScreen } from "./RankingsScreen";

export function ArenaScreen({ room, ownPlayer }: { room: RoomPublic; ownPlayer: PlayerPublic }) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [itemNotice, setItemNotice] = useState("");
  const [selectedItem, setSelectedItem] = useState<ItemId | null>(null);
  const [view, setView] = useState<"problem" | "rankings">("problem");
  const timeLeft = useCountdown(room);
  const currentProblem = room.exam.problems.find((problem) => problem.id === ownPlayer.currentProblemId) ?? room.exam.problems[0];
  const hasEffect = (id: string) => ownPlayer.effects.some((effect) => effect.id === id && effect.expiresAt > Date.now());
  const hardLocked = hasEffect("hardFirst");
  const inputLocked = hasEffect("penLock") || hasEffect("slowInput");
  const covered = hasEffect("cover") || hasEffect("blur");
  const solvedCount = ownPlayer.scoreBreakdown.solved;

  const submit = async (selectedAnswer = answer) => {
    setFeedback("");
    setItemNotice("");
    const response = await emitWithAck<{ correct: boolean; itemAwarded: ItemId | null; itemAwards?: ItemAward[] }>("answer:submit", {
      problemId: currentProblem.id,
      answer: selectedAnswer
    });
    if (!response.ok) {
      setFeedback(response.error ?? "제출 실패");
      return;
    }
    if (response.data?.correct) {
      const awards = response.data.itemAwards ?? (response.data.itemAwarded ? [{ itemId: response.data.itemAwarded, reason: "lucky" as const }] : []);
      const awardNames = awards.map((award) => ITEM_DEFINITIONS[award.itemId].name);
      setFeedback(awardNames.length > 0 ? `정답. ${awardNames.join(", ")} 획득.` : "정답. 이번엔 아이템 없음.");
      setItemNotice(awardNames.length > 0 ? `${awardNames.join(" + ")} 지급` : "");
    } else {
      setFeedback(currentProblem.answerKind === "choice" ? "오답. 5지선다는 재시도할 수 없습니다." : "오답. 정답 시 오답 페널티 +20분.");
    }
    setAnswer("");
  };

  const useItem = async (itemId: ItemId, targetPlayerId: string) => {
    const target = room.players.find((player) => player.id === targetPlayerId);
    let message = "";
    if (itemId === "adviceNote") {
      const draft = window.prompt("쪽지 내용", "이 문제 아직 못 풀었어?");
      if (draft === null) return;
      message = draft;
    }
    const response = await emitWithAck("item:use", { itemId, targetPlayerId, message });
    setSelectedItem(null);
    if (!response.ok) {
      setFeedback(response.error ?? "아이템 사용 실패");
      return;
    }
    setFeedback(`${ITEM_DEFINITIONS[itemId].name} -> ${target?.nickname ?? "대상"}`);
  };

  const endExamEarly = async () => {
    const response = await emitWithAck<RoomPublic>("room:end", {});
    if (!response.ok) {
      setFeedback(response.error ?? "시험 종료 실패");
    }
  };

  if (view === "rankings") {
    return <RankingsScreen room={room} ownPlayer={ownPlayer} onBack={() => setView("problem")} />;
  }

  return (
    <main className="arena-layout">
      <section className="paper-zone">
        <div className="arena-workspace">
          <ArenaTopbar
            room={room}
            ownPlayer={ownPlayer}
            solvedCount={solvedCount}
            timeLeft={timeLeft}
            showRankings={() => setView("rankings")}
            endExamEarly={() => void endExamEarly()}
          />
          <ProblemSheet
            room={room}
            ownPlayer={ownPlayer}
            currentProblem={currentProblem}
            covered={covered}
            memeActive={hasEffect("meme")}
            inputLocked={inputLocked}
            hardLocked={hardLocked}
            answer={answer}
            setAnswer={setAnswer}
            feedback={feedback}
            itemNotice={itemNotice}
            submit={submit}
            selectedItem={selectedItem}
            setSelectedItem={setSelectedItem}
            useItem={useItem}
          />
        </div>
      </section>
    </main>
  );
}
