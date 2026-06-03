import type { ItemId, PlayerPublic, ProblemPublic, RoomPublic } from "../../../../shared/game";
import { AnswerPanel } from "./AnswerPanel";
import { ItemDock } from "./ItemDock";
import { ProblemNav } from "./ProblemNav";

export function ProblemSheet({
  room,
  ownPlayer,
  currentProblem,
  covered,
  memeActive,
  inputLocked,
  hardLocked,
  answer,
  setAnswer,
  feedback,
  itemNotice,
  submit,
  selectedItem,
  setSelectedItem,
  useItem
}: {
  room: RoomPublic;
  ownPlayer: PlayerPublic;
  currentProblem: ProblemPublic;
  covered: boolean;
  memeActive: boolean;
  inputLocked: boolean;
  hardLocked: boolean;
  answer: string;
  setAnswer: (answer: string) => void;
  feedback: string;
  itemNotice: string;
  submit: (selectedAnswer?: string) => Promise<void>;
  selectedItem: ItemId | null;
  setSelectedItem: (itemId: ItemId | null) => void;
  useItem: (itemId: ItemId, targetPlayerId: string) => Promise<void>;
}) {
  return (
    <div className="exam-sheet problem-sheet single-question-sheet">
      <div className="problem-focus-head">
        <div>
          <span>{room.exam.title}</span>
          <strong>{currentProblem.number}번</strong>
        </div>
        <ItemDock room={room} ownPlayer={ownPlayer} selectedItem={selectedItem} setSelectedItem={setSelectedItem} useItem={useItem} />
        <em>난도 {currentProblem.difficulty}</em>
      </div>
      <div className={`problem-image-wrap ${covered ? "covered" : ""}`}>
        <img src={currentProblem.imageUrl} alt={`${currentProblem.sourceNumber ?? currentProblem.number}번 문제`} />
        {covered && <div className="cover-effect">문제 가리기 발동</div>}
        {memeActive && (
          <div className="meme-effect">
            <img src="/exams/meme-slots/placeholder.svg" alt="방해 짤 슬롯" />
          </div>
        )}
      </div>
      <AnswerPanel currentProblem={currentProblem} answer={answer} setAnswer={setAnswer} inputLocked={inputLocked} feedback={feedback} submit={submit} />
      {itemNotice && <div className="item-toast">{itemNotice}</div>}
      <ProblemNav problems={room.exam.problems} currentProblem={currentProblem} hardLocked={hardLocked} ownPlayer={ownPlayer} room={room} />
    </div>
  );
}
