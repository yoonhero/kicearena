import { ProblemContent } from "../../components/arena/ProblemContent";
import type { AdminEditorModel } from "./useAdminEditor";

export function AdminPreviewPanel({ editor }: { editor: AdminEditorModel }) {
    const { state } = editor;
    const { previewProblem, form } = state;

    return (
        <section className="admin-preview">
            <div className="admin-section-head">
                <span>미리보기</span>
                <strong>{previewProblem ? `${previewProblem.number}번` : ""}</strong>
            </div>
            {previewProblem && (
                <div className="admin-preview-paper">
                    <div className="admin-preview-head">
                        <span>{previewProblem.title}</span>
                        <strong>
                            {previewProblem.answerKind === "choice" ? "객관식" : "단답형"} · 정답{" "}
                            {form?.answer ?? ""}
                        </strong>
                    </div>
                    <ProblemContent problem={previewProblem} />
                </div>
            )}
        </section>
    );
}
