import { useEffect } from "react";
import type { ItemId, PlayerPublic, ProblemPublic, RoomPublic } from "../../../../shared/game";
import { AnswerPanel } from "./AnswerPanel";
import { ItemDock } from "./ItemDock";
import { ProblemNav } from "./ProblemNav";

type WebkitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const playAuraMinusCue = () => {
  const AudioContextCtor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) return undefined;

  const context = new AudioContextCtor();
  const master = context.createGain();
  const now = context.currentTime;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
  master.connect(context.destination);

  const playTone = (delay: number, frequency: number, duration: number, type: OscillatorType) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now + delay);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + delay + duration);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.38, now + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + duration + 0.04);
  };

  const playNoise = (delay: number, duration: number) => {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1700, now + delay);
    gain.gain.setValueAtTime(0.12, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now + delay);
  };

  void context.resume();
  playTone(0, 196, 0.18, "sawtooth");
  playTone(0.16, 146.83, 0.18, "square");
  playTone(0.32, 220, 0.2, "sawtooth");
  playTone(0.58, 98, 0.34, "square");
  playNoise(0.1, 0.18);
  playNoise(0.48, 0.22);

  const closeTimer = window.setTimeout(() => {
    void context.close();
  }, 1500);

  return () => {
    window.clearTimeout(closeTimer);
    void context.close();
  };
};

export function ProblemSheet({
  room,
  ownPlayer,
  currentProblem,
  covered,
  problemRotated,
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
  problemRotated: boolean;
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

  useEffect(() => {
    if (!auraEffect) return undefined;
    return playAuraMinusCue();
  }, [auraEffect?.expiresAt]);

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
      <div className={`problem-image-wrap ${covered ? "covered" : ""} ${problemRotated ? "rotated" : ""}`}>
        <img src={currentProblem.imageUrl} alt={`${currentProblem.sourceNumber ?? currentProblem.number}번 문제`} />
        {covered && <div className="cover-effect">문제 가리기 발동</div>}
        {problemRotated && <div className="rotate-effect">문제지 회전중</div>}
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
            <div className="aura-scanline" aria-hidden="true" />
            <div className="aura-shorts-frame">
              <span className="aura-platform">SHORTS</span>
              <span className="aura-live">LIVE</span>
              <div className="aura-skull" aria-hidden="true">
                <span className="aura-eye left" />
                <span className="aura-eye right" />
                <span className="aura-nose" />
                <span className="aura-teeth" />
              </div>
              <div className="aura-score-stack">
                <small>AURA CHECK FAILED</small>
                <strong>아우라 -100</strong>
                <b>-100</b>
              </div>
              <em>{auraEffect.sourceName}의 공격</em>
              <i>skull beat playing</i>
              <div className="aura-beat-meter" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
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
