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
  const bannedSongActive = ownPlayer.effects.some((effect) => effect.id === "bannedSong" && effect.expiresAt > Date.now());
  const auraEffect = ownPlayer.effects.find((effect) => effect.id === "auraMinus" && effect.expiresAt > Date.now());
  const adviceEffect = ownPlayer.effects.find((effect) => effect.id === "adviceNote" && effect.expiresAt > Date.now());

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
        {bannedSongActive && (
          <div className="banned-song-effect">
            <div>
              <strong>수능 금지곡 재생중</strong>
              <span>SHINee - Ring Ding Dong</span>
            </div>
            <iframe
              title="수능 금지곡 Ring Ding Dong"
              src="https://www.youtube-nocookie.com/embed/roughtzsCDI?autoplay=1&start=53&end=68&controls=0&modestbranding=1&rel=0"
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
        {auraEffect && (
          <div className="aura-minus-effect" aria-label="아우라 -100 효과">
            <div className="aura-shorts-frame">
              <span>SHORTS</span>
              <strong>아우라 -100</strong>
              <em>{auraEffect.sourceName}의 공격</em>
              <i>폼 미쳤다</i>
              <b>-100</b>
            </div>
          </div>
        )}
        {adviceEffect && (
          <div className="advice-note-effect">
            <span>{adviceEffect.sourceName}의 훈수쪽지</span>
            <strong>{adviceEffect.problemNumber ? `${adviceEffect.problemNumber}번` : "그 문제"} 아직?</strong>
            <p>{adviceEffect.message}</p>
          </div>
        )}
      </div>
      <AnswerPanel currentProblem={currentProblem} answer={answer} setAnswer={setAnswer} inputLocked={inputLocked} feedback={feedback} submit={submit} />
      {itemNotice && <div className="item-toast">{itemNotice}</div>}
      <ProblemNav problems={room.exam.problems} currentProblem={currentProblem} hardLocked={hardLocked} ownPlayer={ownPlayer} room={room} />
    </div>
  );
}
