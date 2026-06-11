import { useCallback, useEffect, useRef, useState } from "react";
import { ITEM_DEFINITIONS, type ItemAward, type ItemDefinition, type ItemId, type PlayerPublic, type RoomPublic } from "../../../shared/game";
import { useCountdown } from "../hooks/useCountdown";
import { isEditableShortcutTarget } from "../lib/keyboard";
import { emitWithAck } from "../lib/socket";
import { ArenaTopbar } from "../components/arena/ArenaTopbar";
import { ProblemSheet } from "../components/arena/ProblemSheet";
import { RankingsScreen } from "./RankingsScreen";

export function ArenaScreen({ room, ownPlayer, onLeave }: { room: RoomPublic; ownPlayer: PlayerPublic; onLeave: () => Promise<void> }) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [itemNotice, setItemNotice] = useState("");
  const [selectedItem, setSelectedItem] = useState<ItemId | null>(null);
  const [view, setView] = useState<"problem" | "rankings">("problem");
  const submissionKeyRef = useRef<{ problemId: string; answer: string; key: string } | null>(null);
  const timeLeft = useCountdown(room);
  const currentProblem = room.exam.problems.find((problem) => problem.id === ownPlayer.currentProblemId) ?? room.exam.problems[0];
  const hasEffect = (id: string) => ownPlayer.effects.some((effect) => effect.id === id && effect.expiresAt > Date.now());
  const hardLocked = hasEffect("hardFirst");
  const inputLocked = hasEffect("penLock") || hasEffect("slowInput");
  const covered = hasEffect("cover") || hasEffect("blur");
  const problemRotated = hasEffect("rotateProblem");
  const solvedCount = ownPlayer.scoreBreakdown.solved;
  const currentSubmission = ownPlayer.submissions.find((submission) => submission.problemId === currentProblem.id);
  const makeIdempotencyKey = () => window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const submit = useCallback(async (selectedAnswer = answer) => {
    setFeedback("");
    setItemNotice("");
    const existingKey = submissionKeyRef.current;
    const idempotencyKey =
      existingKey?.problemId === currentProblem.id && existingKey.answer === selectedAnswer
        ? existingKey.key
        : makeIdempotencyKey();
    submissionKeyRef.current = { problemId: currentProblem.id, answer: selectedAnswer, key: idempotencyKey };
    const response = await emitWithAck<{ correct: boolean; itemAwarded: ItemId | null; itemAwards?: ItemAward[] }>("answer:submit", {
      problemId: currentProblem.id,
      answer: selectedAnswer,
      idempotencyKey
    });
    submissionKeyRef.current = null;
    if (!response.ok) {
      setFeedback(response.error ?? "제출 실패");
      return;
    }
    if (response.data?.correct) {
      const awards = response.data.itemAwards ?? (response.data.itemAwarded ? [{ itemId: response.data.itemAwarded, reason: "lucky" as const }] : []);
      const awardNames = awards.map((award) => ITEM_DEFINITIONS[award.itemId].name);
      setFeedback(awardNames.length > 0 ? `${awardNames.join(", ")} 획득.` : "");
      setItemNotice(awardNames.length > 0 ? `${awardNames.join(" + ")} 지급` : "");
    } else {
      setFeedback("정답 시 오답 페널티 +20분.");
    }
    setAnswer("");
  }, [answer, currentProblem.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || isEditableShortcutTarget(event.target)) return;

      const shortcutKey = event.key.toLowerCase();
      if (shortcutKey === "r") {
        event.preventDefault();
        setView((current) => (current === "rankings" ? "problem" : "rankings"));
        return;
      }
      if (shortcutKey === "escape" && view === "rankings") {
        event.preventDefault();
        setView("problem");
        return;
      }
      if (view !== "problem" || selectedItem || inputLocked) return;

      if (currentProblem.answerKind === "choice") {
        const choiceCount = currentProblem.body?.find((block) => block.kind === "choices")?.choices.length ?? 5;
        const chosenByNumber = /^[1-9]$/.test(event.key) ? Number(event.key) : 0;
        if (chosenByNumber >= 1 && chosenByNumber <= choiceCount && !currentSubmission) {
          event.preventDefault();
          setAnswer(event.key);
          return;
        }
        if (event.key === "Enter" && answer && !currentSubmission && !event.repeat) {
          event.preventDefault();
          void submit(answer);
        }
        return;
      }

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        setAnswer((current) => `${current}${event.key}`);
        return;
      }
      if (event.key === "Backspace" && answer) {
        event.preventDefault();
        setAnswer((current) => current.slice(0, -1));
        return;
      }
      if (event.key === "Enter" && answer.trim() && !event.repeat) {
        event.preventDefault();
        void submit(answer);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answer, currentProblem, currentSubmission, inputLocked, selectedItem, submit, view]);

  const useItem = async (itemId: ItemId, targetPlayerId: string) => {
    const target = room.players.find((player) => player.id === targetPlayerId);
    const item: ItemDefinition = ITEM_DEFINITIONS[itemId];
    let message = "";
    if (item.payload?.message) {
      const draft = window.prompt(item.payload.message.prompt, item.payload.message.defaultText);
      if (draft === null) return;
      message = draft;
    }
    const response = await emitWithAck("item:use", { itemId, targetPlayerId, message });
    setSelectedItem(null);
    if (!response.ok) {
      setFeedback(response.error ?? "아이템 사용 실패");
      return;
    }
    setFeedback(`${item.name} -> ${target?.nickname ?? "대상"}`);
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
            leaveRoom={() => void onLeave()}
          />
          <ProblemSheet
            room={room}
            ownPlayer={ownPlayer}
            currentProblem={currentProblem}
            covered={covered}
            problemRotated={problemRotated}
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
