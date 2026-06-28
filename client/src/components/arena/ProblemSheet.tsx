import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import type { ItemId, PlayerPublic, ProblemPublic, RoomPublic } from "../../../../shared/game";
import { isTallProblemImage } from "../../../../shared/problemLayout";
import { socket } from "../../lib/socket";
import { AnswerPanel } from "./AnswerPanel";
import { GradeMark } from "./GradeMark";
import { ItemDock } from "./ItemDock";
import { ProblemContent } from "./ProblemContent";
import { ProblemNav } from "./ProblemNav";
import { playAuraMinusCue } from "./auraMinusCue";

type ProblemAnswerState = "correct" | "wrong" | "unanswered";

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
    useItem,
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
    const bannedSongActive = ownPlayer.effects.some(
        (effect) => effect.id === "bannedSong" && effect.expiresAt > Date.now(),
    );
    const auraEffect = ownPlayer.effects.find(
        (effect) => effect.id === "auraMinus" && effect.expiresAt > Date.now(),
    );
    const adviceEffect = ownPlayer.effects.find(
        (effect) => effect.id === "adviceNote" && effect.expiresAt > Date.now(),
    );
    const currentIndex = room.exam.problems.findIndex(
        (problem) => problem.id === currentProblem.id,
    );
    const isProblemLocked = (problem: ProblemPublic) => hardLocked && problem.difficulty < 4;
    const previousProblem = useMemo(
        () => findAdjacentProblem(room.exam.problems, currentIndex, -1, isProblemLocked),
        [currentIndex, hardLocked, room.exam.problems],
    );
    const nextProblem = useMemo(
        () => findAdjacentProblem(room.exam.problems, currentIndex, 1, isProblemLocked),
        [currentIndex, hardLocked, room.exam.problems],
    );
    const currentSubmission = ownPlayer.submissions.find(
        (submission) => submission.problemId === currentProblem.id,
    );
    const answerState: ProblemAnswerState = currentSubmission?.correct
        ? "correct"
        : currentSubmission
          ? "wrong"
          : "unanswered";
    const answeredProblemCount = useMemo(
        () => new Set(ownPlayer.submissions.map((submission) => submission.problemId)).size,
        [ownPlayer.submissions],
    );
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
                <ItemDock
                    room={room}
                    ownPlayer={ownPlayer}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                    useItem={useItem}
                />
                <em>{currentProblem.pointValue}점</em>
            </div>
            <div
                className={`problem-image-wrap ${covered ? "covered" : ""} ${problemRotated ? "rotated" : ""} ${tallProblem ? "tall-problem" : ""}`}
            >
                {currentProblem.body?.length ? (
                    <ProblemContent problem={currentProblem} />
                ) : (
                    <img
                        src={currentProblem.imageUrl}
                        alt={`${currentProblem.sourceNumber ?? currentProblem.number}번 문제`}
                        onLoad={(event) => {
                            const image = event.currentTarget;
                            setTallProblem(
                                isTallProblemImage(image.naturalWidth, image.naturalHeight),
                            );
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
                        <strong>
                            {adviceEffect.problemNumber
                                ? `${adviceEffect.problemNumber}번`
                                : "그 문제"}{" "}
                            아직?
                        </strong>
                        <p>{adviceEffect.message}</p>
                    </div>
                )}
            </div>
            <div className="problem-command-strip">
                <button
                    type="button"
                    disabled={!previousProblem}
                    onClick={() =>
                        previousProblem &&
                        socket.emit("problem:set", { problemId: previousProblem.id })
                    }
                    aria-label="이전 문제"
                >
                    <ChevronLeft size={18} />
                </button>
                <button
                    type="button"
                    className="problem-picker-toggle"
                    aria-expanded={showProblemPicker}
                    onClick={() => setProblemPickerOpen((open) => !open)}
                    aria-label="문제 선택"
                >
                    <Menu size={18} />
                </button>
                <button
                    type="button"
                    className={
                        answerState !== "unanswered" ? `next-problem-cue ${answerState}` : ""
                    }
                    disabled={!nextProblem}
                    onClick={() =>
                        nextProblem && socket.emit("problem:set", { problemId: nextProblem.id })
                    }
                    aria-label="다음 문제"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
            {showProblemPicker && (
                <ProblemNav
                    problems={room.exam.problems}
                    currentProblem={currentProblem}
                    hardLocked={hardLocked}
                    ownPlayer={ownPlayer}
                    room={room}
                />
            )}
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
        </div>
    );
}

function findAdjacentProblem(
    problems: ProblemPublic[],
    currentIndex: number,
    direction: -1 | 1,
    locked: (problem: ProblemPublic) => boolean,
) {
    for (
        let index = currentIndex + direction;
        index >= 0 && index < problems.length;
        index += direction
    ) {
        const problem = problems[index];
        if (!locked(problem)) return problem;
    }
    return null;
}
