import { KeyRound, Megaphone, RefreshCw } from "lucide-react";
import { useAdminEditor } from "./useAdminEditor";
import { AdminExamSidebar } from "./AdminExamSidebar";
import { AdminProblemList } from "./AdminProblemList";
import { AdminProblemEditor } from "./AdminProblemEditor";
import { AdminPreviewPanel } from "./AdminPreviewPanel";
import { examFreezeBeforeSec } from "../../../../shared/game";

export function AdminEditorScreen() {
    const editor = useAdminEditor();
    const { state, setters, actions } = editor;
    const selectedExam = state.selectedExam;
    const selectedProblem = state.selectedProblem;

    return (
        <main className="admin-shell">
            <header className="admin-topbar">
                <div>
                    <span>관리실</span>
                    <strong>문제지 운영</strong>
                </div>
                <label>
                    <span>관리자 토큰</span>
                    <input
                        type="password"
                        value={state.token}
                        onChange={(event) => setters.setToken(event.target.value)}
                        placeholder="X-Admin-Token"
                    />
                </label>
                <button type="button" className="secondary-btn" onClick={actions.saveToken}>
                    <KeyRound size={16} /> 토큰 저장
                </button>
                <a className="secondary-btn" href="/admin/campaign">
                    <Megaphone size={16} /> 캠페인
                </a>
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={actions.loadExams}
                    disabled={state.loading}
                >
                    <RefreshCw size={16} /> 새로고침
                </button>
            </header>

            <section className="admin-context-strip" aria-label="현재 편집 상태">
                <div>
                    <b>선택 문제지</b>
                    <strong>{selectedExam?.title ?? "문제지 없음"}</strong>
                    <span>
                        {selectedExam
                            ? `${selectedExam.problems.length}문항 · ${
                                  selectedExam.active ? "공개" : "비공개"
                              }`
                            : "먼저 문제지를 선택하세요."}
                    </span>
                </div>
                <div>
                    <b>대회 시간</b>
                    <strong>{selectedExam ? formatMinutes(selectedExam.timeLimitSec) : "-"}</strong>
                    <span>{selectedExam ? freezeSummary(selectedExam) : "설정 대기"}</span>
                </div>
                <div>
                    <b>선택 문항</b>
                    <strong>{selectedProblem ? `${selectedProblem.number}번` : "문항 없음"}</strong>
                    <span>
                        {selectedProblem
                            ? `${selectedProblem.title} · ${
                                  selectedProblem.answerKind === "choice" ? "객관식" : "단답형"
                              }`
                            : "문항을 추가하거나 선택하세요."}
                    </span>
                </div>
                <div className={state.error ? "needs-attention" : state.isDirty ? "dirty" : ""}>
                    <b>작업 상태</b>
                    <strong>
                        {state.error ? "확인 필요" : state.isDirty ? "저장 필요" : "정상"}
                    </strong>
                    <span>{state.error || state.status || "변경 사항이 저장되어 있습니다."}</span>
                </div>
            </section>

            <section className="admin-layout">
                <AdminExamSidebar editor={editor} />
                <AdminProblemList editor={editor} />
                <AdminProblemEditor editor={editor} />
                <AdminPreviewPanel editor={editor} />
            </section>
        </main>
    );
}

const formatMinutes = (seconds: number) => `${Math.round(seconds / 60)}분`;

const freezeSummary = (exam: { timeLimitSec: number; freezeBeforeSec?: number }) => {
    const freezeBeforeSec = examFreezeBeforeSec(exam);
    if (freezeBeforeSec === 0) return "순위표 프리즈 없음";
    const startMin = Math.max(0, Math.round((exam.timeLimitSec - freezeBeforeSec) / 60));
    return `${startMin}분부터 순위표 프리즈`;
};
