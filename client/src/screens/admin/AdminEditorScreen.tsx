import { KeyRound, Megaphone, RefreshCw } from "lucide-react";
import { useAdminEditor } from "./useAdminEditor";
import { AdminExamSidebar } from "./AdminExamSidebar";
import { AdminProblemList } from "./AdminProblemList";
import { AdminProblemEditor } from "./AdminProblemEditor";
import { AdminPreviewPanel } from "./AdminPreviewPanel";

export function AdminEditorScreen() {
    const editor = useAdminEditor();
    const { state, setters, actions } = editor;

    return (
        <main className="admin-shell">
            <header className="admin-topbar">
                <div>
                    <span>관리실</span>
                    <strong>문제지 편집</strong>
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

            <section className="admin-layout">
                <AdminExamSidebar editor={editor} />
                <AdminProblemList editor={editor} />
                <AdminProblemEditor editor={editor} />
                <AdminPreviewPanel editor={editor} />
            </section>
        </main>
    );
}
