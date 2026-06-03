import { Send } from "lucide-react";
import type { ProblemPublic } from "../../../../shared/game";

export function AnswerPanel({
  currentProblem,
  answer,
  setAnswer,
  inputLocked,
  feedback,
  submit
}: {
  currentProblem: ProblemPublic;
  answer: string;
  setAnswer: (answer: string) => void;
  inputLocked: boolean;
  feedback: string;
  submit: (selectedAnswer?: string) => Promise<void>;
}) {
  return (
    <div className={`answer-bar ${currentProblem.answerKind === "choice" ? "choice-answer-bar" : ""}`}>
      {currentProblem.answerKind === "choice" ? (
        <div className="choice-submit-panel" aria-label="5지선다 답안 선택">
          <span>답안란</span>
          <div className="choice-buttons">
            {["1", "2", "3", "4", "5"].map((choice) => (
              <button
                key={choice}
                type="button"
                className={answer === choice ? "selected" : ""}
                disabled={inputLocked}
                onClick={() => {
                  setAnswer(choice);
                  void submit(choice);
                }}
                aria-label={`${choice}번 제출`}
              >
                <i>{choice}</i>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <label>
            답안란
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
          <button className="primary-btn" disabled={inputLocked} onClick={() => void submit()}>
            <Send size={18} />
            답안 제출
          </button>
        </>
      )}
      {feedback && <span className="feedback">{feedback}</span>}
    </div>
  );
}
