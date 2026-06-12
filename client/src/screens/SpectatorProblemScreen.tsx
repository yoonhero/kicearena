import { ArrowLeft, ChevronLeft, ChevronRight, List } from "lucide-react";
import { useMemo, useState } from "react";
import type { ExamPublic, ProblemPublic } from "../../../shared/game";
import { ProblemContent } from "../components/arena/ProblemContent";

export function SpectatorProblemScreen({ exam, onBack }: { exam: ExamPublic; onBack: () => void }) {
  const [currentProblemId, setCurrentProblemId] = useState(exam.problems[0]?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentIndex = Math.max(
    0,
    exam.problems.findIndex((problem) => problem.id === currentProblemId),
  );
  const currentProblem = exam.problems[currentIndex] ?? exam.problems[0];
  const previousProblem = exam.problems[currentIndex - 1];
  const nextProblem = exam.problems[currentIndex + 1];
  const totalPoints = useMemo(
    () => exam.problems.reduce((sum, problem) => sum + problem.pointValue, 0),
    [exam.problems],
  );

  if (!currentProblem) {
    return (
      <main className="spectator-layout">
        <button type="button" className="spectator-back" onClick={onBack}>
          <ArrowLeft size={18} />
          이벤트 목록
        </button>
        <section className="spectator-empty">공개된 문제가 없습니다.</section>
      </main>
    );
  }

  return (
    <main className="spectator-layout">
      <section className="spectator-topbar">
        <button type="button" className="spectator-back" onClick={onBack}>
          <ArrowLeft size={18} />
          이벤트 목록
        </button>
        <div>
          <span>관전 모드</span>
          <strong>{exam.title}</strong>
        </div>
        <em>{exam.problemCount}문항 · {totalPoints}점</em>
      </section>

      <section className="exam-sheet problem-sheet single-question-sheet spectator-sheet">
        <div className="problem-focus-head answer-unanswered">
          <div>
            <span>{exam.subtitle}</span>
            <strong>{currentProblem.number}번</strong>
          </div>
          <em>{currentProblem.pointValue}점</em>
        </div>
        <ProblemPreview problem={currentProblem} />
        <div className="problem-command-strip">
          <button type="button" disabled={!previousProblem} onClick={() => setCurrentProblemId(previousProblem.id)} aria-label="이전 문제">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="problem-picker-toggle" onClick={() => setPickerOpen((open) => !open)} aria-label="문제 선택">
            <List size={18} />
          </button>
          <button type="button" disabled={!nextProblem} onClick={() => setCurrentProblemId(nextProblem.id)} aria-label="다음 문제">
            <ChevronRight size={18} />
          </button>
        </div>
        {pickerOpen && (
          <nav className="spectator-problem-nav" aria-label="관전 문제 선택">
            {exam.problems.map((problem) => (
              <button
                key={problem.id}
                type="button"
                className={problem.id === currentProblem.id ? "active" : ""}
                onClick={() => setCurrentProblemId(problem.id)}
              >
                {problem.number}
              </button>
            ))}
          </nav>
        )}
      </section>
    </main>
  );
}

function ProblemPreview({ problem }: { problem: ProblemPublic }) {
  return (
    <div className="problem-image-wrap spectator-preview">
      {problem.body?.length ? (
        <ProblemContent problem={problem} />
      ) : (
        <img src={problem.imageUrl} alt={`${problem.sourceNumber ?? problem.number}번 문제`} />
      )}
    </div>
  );
}
