import {
    ChevronLeft,
    ChevronRight,
    Eye,
    EyeOff,
    Plus,
    Save,
    Search,
    Settings2,
} from "lucide-react";
import { examFreezeBeforeSec } from "../../../../shared/game";
import type { AdminEditorModel } from "./useAdminEditor";

export function AdminProblemList({ editor }: { editor: AdminEditorModel }) {
    const { state, setters, actions } = editor;
    const {
        selectedExam,
        examSettings,
        settingsOpen,
        settingsCheck,
        isExamSettingsDirty,
        filteredProblems,
        selectedProblem,
        selectedProblemIndex,
        problemQuery,
    } = state;

    return (
        <section className="admin-problem-list">
            <div className="admin-section-head">
                <span>선택 문제지</span>
                <strong>{selectedExam ? (selectedExam.active ? "공개" : "비공개") : ""}</strong>
            </div>
            {selectedExam && examSettings && (
                <>
                    <div className="admin-selected-exam">
                        <strong>{selectedExam.title}</strong>
                        <span>{selectedExam.subtitle}</span>
                    </div>
                    <div className="admin-exam-rule-strip" aria-label="문제지 운영 규칙">
                        <span>
                            <b>문항</b>
                            {selectedExam.problems.length}
                        </span>
                        <span>
                            <b>제한</b>
                            {formatMinutes(selectedExam.timeLimitSec)}
                        </span>
                        <span>
                            <b>프리즈</b>
                            {freezeLabel(selectedExam)}
                        </span>
                    </div>
                    <div className="admin-exam-quick-actions">
                        <button
                            type="button"
                            className={`admin-visibility-btn ${
                                examSettings.active ? "published" : ""
                            }`}
                            onClick={actions.toggleSelectedExamActive}
                        >
                            {examSettings.active ? <Eye size={16} /> : <EyeOff size={16} />}
                            {examSettings.active ? "공개 중" : "비공개"}
                        </button>
                        <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => setters.setSettingsOpen((current) => !current)}
                        >
                            <Settings2 size={16} /> {settingsOpen ? "설정 닫기" : "시험지 설정"}
                        </button>
                    </div>
                </>
            )}
            {selectedExam && examSettings && settingsOpen && (
                <section className="admin-exam-settings">
                    <div className="admin-body-builder-head">
                        <span>운영 규칙</span>
                        <strong>{settingsCheck.ok ? "저장 가능" : settingsCheck.error}</strong>
                    </div>
                    <label>
                        <span>제목</span>
                        <input
                            value={examSettings.title}
                            onChange={(event) =>
                                actions.updateExamSettings("title", event.target.value)
                            }
                        />
                    </label>
                    <label>
                        <span>설명</span>
                        <input
                            value={examSettings.subtitle}
                            onChange={(event) =>
                                actions.updateExamSettings("subtitle", event.target.value)
                            }
                        />
                    </label>
                    <div className="admin-time-settings-row">
                        <label>
                            <span>제한 시간(분)</span>
                            <input
                                value={examSettings.timeLimitMin}
                                onChange={(event) =>
                                    actions.updateExamSettings("timeLimitMin", event.target.value)
                                }
                                inputMode="numeric"
                            />
                        </label>
                        <label>
                            <span>순위표 프리즈(분 전)</span>
                            <input
                                value={examSettings.freezeBeforeMin}
                                onChange={(event) =>
                                    actions.updateExamSettings(
                                        "freezeBeforeMin",
                                        event.target.value,
                                    )
                                }
                                inputMode="numeric"
                            />
                        </label>
                    </div>
                    <label>
                        <span>대회 시작</span>
                        <input
                            type="datetime-local"
                            value={examSettings.releaseAt}
                            onChange={(event) =>
                                actions.updateExamSettings("releaseAt", event.target.value)
                            }
                        />
                    </label>
                    <button
                        type="button"
                        className="primary-btn"
                        onClick={() => void actions.saveExamSettings()}
                        disabled={!settingsCheck.ok || !isExamSettingsDirty}
                    >
                        <Save size={16} /> 설정 저장
                    </button>
                </section>
            )}
            <div className="admin-section-head admin-subsection-head">
                <span>문항</span>
                <strong>
                    {filteredProblems.length}/{selectedExam?.problems.length ?? 0}
                </strong>
            </div>
            <button
                type="button"
                className="secondary-btn admin-add-problem-btn"
                onClick={() => void actions.createProblem()}
                disabled={!selectedExam}
            >
                <Plus size={16} /> 새 문항
            </button>
            <label className="admin-search">
                <span>검색</span>
                <div>
                    <Search size={16} />
                    <input
                        value={problemQuery}
                        onChange={(event) => setters.setProblemQuery(event.target.value)}
                        placeholder="번호, 제목, 정답, id"
                    />
                </div>
            </label>
            <div className="admin-problem-nav">
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => actions.selectProblemOffset(-1)}
                    disabled={selectedProblemIndex <= 0}
                >
                    <ChevronLeft size={16} /> 이전
                </button>
                <span>
                    {selectedProblemIndex >= 0
                        ? `${selectedProblemIndex + 1}/${selectedExam?.problems.length ?? 0}`
                        : "-"}
                </span>
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => actions.selectProblemOffset(1)}
                    disabled={
                        !selectedExam || selectedProblemIndex >= selectedExam.problems.length - 1
                    }
                >
                    다음 <ChevronRight size={16} />
                </button>
            </div>
            <div className="admin-problem-table">
                <div className="admin-problem-row head">
                    <span>번호</span>
                    <span>제목</span>
                    <span>유형</span>
                </div>
                {filteredProblems.map((problem) => (
                    <button
                        key={problem.id}
                        type="button"
                        className={`admin-problem-row ${problem.id === selectedProblem?.id ? "selected" : ""}`}
                        onClick={() => setters.setSelectedProblemId(problem.id)}
                    >
                        <span>{problem.number}</span>
                        <span>{problem.title}</span>
                        <span>
                            {problem.answerKind === "choice" ? "객관식" : "단답형"} ·{" "}
                            {problem.difficulty}
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}

const formatMinutes = (seconds: number) => `${Math.round(seconds / 60)}분`;

const freezeLabel = (exam: { timeLimitSec: number; freezeBeforeSec?: number }) => {
    const freezeBeforeSec = examFreezeBeforeSec(exam);
    if (freezeBeforeSec === 0) return "없음";
    const startMin = Math.max(0, Math.round((exam.timeLimitSec - freezeBeforeSec) / 60));
    return `${startMin}분부터`;
};
