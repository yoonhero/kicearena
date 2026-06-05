import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Grid2X2 } from "lucide-react";
import type { ItemId, PlayerPublic, ProblemPublic, RoomPublic } from "../../../../shared/game";
import { isTallProblemImage } from "../../../../shared/problemLayout";
import { socket } from "../../lib/socket";
import { AnswerPanel } from "./AnswerPanel";
import { ItemDock } from "./ItemDock";
import { ProblemContent } from "./ProblemContent";
import { ProblemNav } from "./ProblemNav";

type ProblemAnswerState = "correct" | "wrong" | "unanswered";

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
  const [tallProblem, setTallProblem] = useState(false);
  const [problemPickerOpen, setProblemPickerOpen] = useState(false);
  const bannedSongActive = ownPlayer.effects.some((effect) => effect.id === "bannedSong" && effect.expiresAt > Date.now());
  const auraEffect = ownPlayer.effects.find((effect) => effect.id === "auraMinus" && effect.expiresAt > Date.now());
  const adviceEffect = ownPlayer.effects.find((effect) => effect.id === "adviceNote" && effect.expiresAt > Date.now());
  const currentIndex = room.exam.problems.findIndex((problem) => problem.id === currentProblem.id);
  const isProblemLocked = (problem: ProblemPublic) => hardLocked && problem.difficulty < 4;
  const previousProblem = useMemo(() => findAdjacentProblem(room.exam.problems, currentIndex, -1, isProblemLocked), [currentIndex, hardLocked, room.exam.problems]);
  const nextProblem = useMemo(() => findAdjacentProblem(room.exam.problems, currentIndex, 1, isProblemLocked), [currentIndex, hardLocked, room.exam.problems]);
  const currentSubmission = ownPlayer.submissions.find((submission) => submission.problemId === currentProblem.id);
  const answerState: ProblemAnswerState = currentSubmission?.correct ? "correct" : currentSubmission ? "wrong" : "unanswered";
  const answeredProblemCount = useMemo(() => new Set(ownPlayer.submissions.map((submission) => submission.problemId)).size, [ownPlayer.submissions]);
  const showProblemPicker = problemPickerOpen || answeredProblemCount >= room.exam.problemCount;

  useEffect(() => {
    setTallProblem(false);
  }, [currentProblem.id]);

  useEffect(() => {
    if (!auraEffect) return undefined;
    return playAuraMinusCue();
  }, [auraEffect?.expiresAt]);

  return (
    <div className="exam-sheet problem-sheet single-question-sheet">
      <div className={`problem-focus-head answer-${answerState}`}>
        <div>
          <span>{room.exam.title}</span>
          <strong>
            {currentProblem.number}번
            {answerState !== "unanswered" && <GradeMark state={answerState} />}
          </strong>
        </div>
        <ItemDock room={room} ownPlayer={ownPlayer} selectedItem={selectedItem} setSelectedItem={setSelectedItem} useItem={useItem} />
        <em>{currentProblem.pointValue}점</em>
      </div>
      <div className={`problem-image-wrap ${covered ? "covered" : ""} ${problemRotated ? "rotated" : ""} ${tallProblem ? "tall-problem" : ""}`}>
        {currentProblem.body?.length ? (
          <ProblemContent problem={currentProblem} />
        ) : (
          <img
            src={currentProblem.imageUrl}
            alt={`${currentProblem.sourceNumber ?? currentProblem.number}번 문제`}
            onLoad={(event) => {
              const image = event.currentTarget;
              setTallProblem(isTallProblemImage(image.naturalWidth, image.naturalHeight));
            }}
          />
        )}
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
      <div className="problem-command-strip">
        <button type="button" disabled={!previousProblem} onClick={() => previousProblem && socket.emit("problem:set", { problemId: previousProblem.id })} aria-label="이전 문제">
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className={answerState !== "unanswered" ? `next-problem-cue ${answerState}` : ""}
          disabled={!nextProblem}
          onClick={() => nextProblem && socket.emit("problem:set", { problemId: nextProblem.id })}
          aria-label="다음 문제"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <AnswerPanel
        currentProblem={currentProblem}
        answer={answer}
        setAnswer={setAnswer}
        inputLocked={inputLocked}
        submittedAnswer={currentSubmission?.answer ?? null}
        feedback={feedback}
        submit={submit}
      />
      {itemNotice && <div className="item-toast">{itemNotice}</div>}
      <div className="problem-picker-toggle-row">
        <button type="button" className="problem-picker-toggle" aria-expanded={showProblemPicker} onClick={() => setProblemPickerOpen((open) => !open)}>
          <Grid2X2 size={15} />
          문제 선택
        </button>
      </div>
      {showProblemPicker && <ProblemNav problems={room.exam.problems} currentProblem={currentProblem} hardLocked={hardLocked} ownPlayer={ownPlayer} room={room} />}
    </div>
  );
}

function GradeMark({ state }: { state: Exclude<ProblemAnswerState, "unanswered"> }) {
  const label = state === "correct" ? "정답" : "오답";
  const filterId = state === "correct" ? "grade-rough-correct" : "grade-rough-wrong";

  return (
    <i className={`grade-mark-ink ${state}`} aria-label={label}>
      <svg viewBox="0 0 180 118" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} x="-18%" y="-18%" width="136%" height="136%">
            <feTurbulence type="fractalNoise" baseFrequency="0.22 0.86" numOctaves="3" seed={state === "correct" ? 8 : 13} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.15" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        {state === "correct" ? (
          <g>
            <path
              className="grade-stroke grade-stroke-base"
              pathLength={1}
              d="M27 60 C18 34 44 15 83 13 C126 11 160 30 160 58 C160 88 126 105 82 104 C39 103 16 84 27 60"
            />
            <path
              className="grade-stroke grade-stroke-edge"
              filter={`url(#${filterId})`}
              pathLength={1}
              d="M27 60 C18 34 44 15 83 13 C126 11 160 30 160 58 C160 88 126 105 82 104 C39 103 16 84 27 60"
            />
            <path
              className="grade-stroke grade-stroke-pressure"
              pathLength={1}
              d="M31 62 C24 39 48 20 84 18 C123 16 153 31 155 58 C157 85 126 99 84 99 C45 99 25 83 31 62"
            />
          </g>
        ) : (
          <g>
            <path className="grade-stroke grade-stroke-base" pathLength={1} d="M18 101 C47 73 88 42 153 14" />
            <path className="grade-stroke grade-stroke-edge" filter={`url(#${filterId})`} pathLength={1} d="M18 101 C47 73 88 42 153 14" />
            <path className="grade-stroke grade-stroke-pressure" pathLength={1} d="M27 96 C59 68 94 42 145 20" />
          </g>
        )}
      </svg>
    </i>
  );
}

function findAdjacentProblem(problems: ProblemPublic[], currentIndex: number, direction: -1 | 1, locked: (problem: ProblemPublic) => boolean) {
  for (let index = currentIndex + direction; index >= 0 && index < problems.length; index += direction) {
    const problem = problems[index];
    if (!locked(problem)) return problem;
  }
  return null;
}
