import { Eye, EyeOff, Plus } from "lucide-react";
import { makeSlug } from "./adminFormUtils";
import type { AdminEditorModel } from "./useAdminEditor";

export function AdminExamSidebar({ editor }: { editor: AdminEditorModel }) {
    const { state, setters, actions } = editor;
    const { exams, newExam, newExamOpen, selectedExam, createExamCheck } = state;

    return (
        <aside className="admin-exam-list">
            <div className="admin-section-head">
                <span>문제지</span>
                <div className="admin-section-actions">
                    <strong>{exams.length}</strong>
                    <button
                        type="button"
                        className="admin-icon-btn"
                        onClick={() => setters.setNewExamOpen((current) => !current)}
                        aria-label="새 문제지"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>
            {newExamOpen && (
                <section className="admin-new-exam">
                    <div className="admin-body-builder-head">
                        <span>새 문제지</span>
                        <strong>{newExam.active ? "공개" : "비공개"}</strong>
                    </div>
                    <label>
                        <span>ID</span>
                        <input
                            value={newExam.id}
                            onChange={(event) =>
                                actions.updateNewExam("id", makeSlug(event.target.value))
                            }
                            placeholder="mock-exam-2026"
                        />
                    </label>
                    <label>
                        <span>제목</span>
                        <input
                            value={newExam.title}
                            onChange={(event) => {
                                const title = event.target.value;
                                setters.setNewExam((current) => ({
                                    ...current,
                                    title,
                                    id: current.id ? current.id : makeSlug(title),
                                }));
                            }}
                            placeholder="새 문제지"
                        />
                    </label>
                    <label>
                        <span>설명</span>
                        <input
                            value={newExam.subtitle}
                            onChange={(event) =>
                                actions.updateNewExam("subtitle", event.target.value)
                            }
                        />
                    </label>
                    <div className="admin-new-exam-row">
                        <label>
                            <span>제한 시간(분)</span>
                            <input
                                value={newExam.timeLimitMin}
                                onChange={(event) =>
                                    actions.updateNewExam("timeLimitMin", event.target.value)
                                }
                                inputMode="numeric"
                            />
                        </label>
                        <button
                            type="button"
                            className={`admin-visibility-btn ${newExam.active ? "published" : ""}`}
                            onClick={() => actions.updateNewExam("active", !newExam.active)}
                        >
                            {newExam.active ? <Eye size={16} /> : <EyeOff size={16} />}
                            {newExam.active ? "공개" : "비공개"}
                        </button>
                    </div>
                    <label>
                        <span>대회 시작</span>
                        <input
                            type="datetime-local"
                            value={newExam.releaseAt}
                            onChange={(event) =>
                                actions.updateNewExam("releaseAt", event.target.value)
                            }
                        />
                    </label>
                    <button
                        type="button"
                        className="primary-btn"
                        onClick={actions.createExam}
                        disabled={!createExamCheck.ok}
                    >
                        <Plus size={16} /> 문제지 생성
                    </button>
                </section>
            )}
            {exams.map((exam) => (
                <button
                    key={exam.id}
                    type="button"
                    className={exam.id === selectedExam?.id ? "selected" : ""}
                    onClick={() => setters.setSelectedExamId(exam.id)}
                >
                    <strong>{exam.title}</strong>
                    <span>
                        {exam.problems.length}문항 · {exam.active ? "공개" : "비공개"}
                    </span>
                </button>
            ))}
        </aside>
    );
}
