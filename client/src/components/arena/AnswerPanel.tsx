import { Send } from "lucide-react";
import type { ProblemPublic } from "../../../../shared/game";
import { MathHtml } from "../common/MathHtml";

const fallbackChoices = ["1", "2", "3", "4", "5"];

export function AnswerPanel({
    currentProblem,
    answer,
    setAnswer,
    inputLocked,
    submittedAnswer,
    feedback,
    submit,
}: {
    currentProblem: ProblemPublic;
    answer: string;
    setAnswer: (answer: string) => void;
    inputLocked: boolean;
    submittedAnswer?: string | null;
    feedback: string;
    submit: (selectedAnswer?: string) => Promise<void>;
}) {
    const activeChoice = submittedAnswer || answer || "";
    const choiceLocked = inputLocked || Boolean(submittedAnswer);
    const canSubmitChoice =
        currentProblem.answerKind === "choice" && Boolean(answer) && !choiceLocked;
    const canSubmitShortAnswer =
        currentProblem.answerKind !== "choice" && Boolean(answer.trim()) && !inputLocked;
    const choiceTexts =
        currentProblem.body?.find((block) => block.kind === "choices")?.choices ?? fallbackChoices;

    return (
        <div
            className={`answer-bar ${currentProblem.answerKind === "choice" ? "choice-answer-bar" : ""}`}
        >
            {currentProblem.answerKind === "choice" ? (
                <div className="choice-submit-panel" aria-label="5지선다 답안 선택">
                    <div className="choice-buttons">
                        {choiceTexts.map((choiceText, index) => {
                            const choice = String(index + 1);
                            return (
                                <button
                                    key={choice}
                                    type="button"
                                    className={activeChoice === choice ? "selected" : ""}
                                    disabled={choiceLocked}
                                    onClick={() => {
                                        if (choiceLocked) return;
                                        setAnswer(choice);
                                    }}
                                    aria-label={`${choice}번 선택 ${choiceText}`}
                                    aria-pressed={activeChoice === choice}
                                >
                                    <i>{choice}</i>
                                    <span className="choice-option-text">
                                        <MathHtml latex={choiceText} />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        className="primary-btn"
                        disabled={!canSubmitChoice}
                        onClick={() => void submit()}
                    >
                        <Send size={18} />
                        답안 제출
                    </button>
                </div>
            ) : (
                <>
                    <label className="short-answer-card">
                        <span>{currentProblem.number}번 단답형</span>
                        <input
                            value={answer}
                            disabled={inputLocked}
                            onChange={(event) => setAnswer(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") void submit();
                            }}
                            placeholder="숫자"
                        />
                    </label>
                    <button
                        className="primary-btn"
                        disabled={!canSubmitShortAnswer}
                        onClick={() => void submit()}
                    >
                        <Send size={18} />
                        답안 제출
                    </button>
                </>
            )}
            {feedback && (
                <span className="feedback" aria-live="polite">
                    {feedback}
                </span>
            )}
        </div>
    );
}
