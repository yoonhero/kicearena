import { Save, Undo2 } from "lucide-react";
import type { ProblemManifest } from "../../../../shared/game";
import type { AdminEditorModel } from "./useAdminEditor";

export function AdminProblemEditor({ editor }: { editor: AdminEditorModel }) {
    const { state, setters, actions } = editor;
    const {
        selectedExam,
        selectedProblem,
        form,
        bodyCheck,
        pointCheck,
        sourceMetaCheck,
        uploadingAsset,
    } = state;

    return (
        <section className="admin-editor">
            <div className="admin-section-head">
                <span>{selectedProblem ? `${selectedProblem.number}번` : "문제 선택"}</span>
                <strong>{state.isDirty ? "저장 필요" : (selectedProblem?.id ?? "")}</strong>
            </div>
            {form && (
                <>
                    <EditorStateStrip editor={editor} />
                    <label>
                        <span>제목</span>
                        <input
                            value={form.title}
                            onChange={(event) => actions.updateForm("title", event.target.value)}
                        />
                    </label>
                    <AnswerGrid editor={editor} />
                    <div
                        className={`admin-markup-editor ${state.assetDragging || uploadingAsset ? "drag-active" : ""}`}
                    >
                        <BodyToolrow editor={editor} />
                        <textarea
                            ref={state.bodyEditorRef}
                            value={form.bodyMarkup}
                            onChange={(event) =>
                                actions.updateForm("bodyMarkup", event.target.value)
                            }
                            onDragEnter={actions.handleBodyDragOver}
                            onDragOver={actions.handleBodyDragOver}
                            onDragLeave={() => setters.setAssetDragging(false)}
                            onDrop={(event) => void actions.handleBodyDrop(event)}
                            spellCheck={false}
                            placeholder={
                                form.answerKind === "choice"
                                    ? "문제 본문을 입력하세요. 선택지는 위의 선택지 버튼으로 추가합니다."
                                    : "문제 본문을 입력하세요. 수식, 도표, 조건은 위 버튼으로 추가합니다."
                            }
                        />
                    </div>
                    {(!bodyCheck.ok || !pointCheck.ok || !sourceMetaCheck.ok || uploadingAsset) && (
                        <div className="admin-validation-strip">
                            {!bodyCheck.ok && <span className="invalid">{bodyCheck.error}</span>}
                            {!pointCheck.ok && <span className="invalid">{pointCheck.error}</span>}
                            {!sourceMetaCheck.ok && (
                                <span className="invalid">{sourceMetaCheck.error}</span>
                            )}
                            {uploadingAsset && <span className="valid">업로드 중</span>}
                        </div>
                    )}
                    <div className="admin-editor-actions">
                        <button
                            type="button"
                            className="secondary-btn"
                            onClick={actions.resetForm}
                            disabled={!state.isDirty}
                        >
                            <Undo2 size={16} /> 되돌리기
                        </button>
                        <button
                            type="button"
                            className="primary-btn"
                            onClick={actions.saveProblem}
                            disabled={!state.canSave || !state.isDirty}
                        >
                            <Save size={16} /> 문제 저장
                        </button>
                    </div>
                </>
            )}
            {!form && selectedExam && (
                <p className="admin-empty-copy">
                    아직 문항이 없습니다. 왼쪽 문항 추가 버튼으로 첫 문항을 만들 수 있습니다.
                </p>
            )}
            {state.error && <p className="error-text">{state.error}</p>}
            {state.status && <p className="admin-status">{state.status}</p>}
        </section>
    );
}

function EditorStateStrip({ editor }: { editor: AdminEditorModel }) {
    const { state } = editor;
    const { form, bodyCheck, pointCheck } = state;
    if (!form) return null;

    return (
        <div className="admin-edit-state-strip" aria-label="편집 상태">
            <span>
                <b>선택</b>
                {state.selectedExam?.title ?? "-"}
            </span>
            <span>
                <b>유형</b>
                {form.answerKind === "choice" ? "객관식" : "단답형"}
            </span>
            <span className={state.canSave ? "valid" : "invalid"}>
                <b>검증</b>
                {state.canSave ? "저장 가능" : bodyCheck.error || pointCheck.error || "필수값 확인"}
            </span>
            <span className={state.isDirty ? "dirty" : "clean"}>
                <b>상태</b>
                {state.isDirty ? "수정중" : "저장됨"}
            </span>
        </div>
    );
}

function AnswerGrid({ editor }: { editor: AdminEditorModel }) {
    const { state, actions } = editor;
    const { form } = state;
    if (!form) return null;

    return (
        <div className="admin-editor-grid">
            <div className="admin-field">
                <span>정답 유형</span>
                <div className="admin-segmented" role="group" aria-label="정답 유형">
                    {(["choice", "short"] as const).map((answerKind) => (
                        <button
                            key={answerKind}
                            type="button"
                            className={form.answerKind === answerKind ? "selected" : ""}
                            onClick={() => actions.updateAnswerKind(answerKind)}
                        >
                            {answerKind === "choice" ? "객관식" : "단답형"}
                        </button>
                    ))}
                </div>
            </div>
            <AnswerField editor={editor} />
            <DifficultyField editor={editor} />
            <label>
                <span>점수</span>
                <input
                    value={form.pointValue}
                    onChange={(event) => actions.updateForm("pointValue", event.target.value)}
                    placeholder="auto"
                />
            </label>
        </div>
    );
}

function AnswerField({ editor }: { editor: AdminEditorModel }) {
    const { state, actions } = editor;
    const { form } = state;
    if (!form) return null;

    return (
        <label className={form.answerKind === "choice" ? "admin-choice-answer" : ""}>
            <span>정답</span>
            {form.answerKind === "choice" ? (
                <div className="admin-answer-picks" role="group" aria-label="객관식 정답">
                    {state.choicesForAnswer.map((_, index) => {
                        const answer = String(index + 1);
                        return (
                            <button
                                key={answer}
                                type="button"
                                className={form.answer === answer ? "selected" : ""}
                                onClick={() => actions.updateForm("answer", answer)}
                            >
                                {answer}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <input
                    value={form.answer}
                    onChange={(event) => actions.updateForm("answer", event.target.value)}
                />
            )}
        </label>
    );
}

function DifficultyField({ editor }: { editor: AdminEditorModel }) {
    const { state, actions } = editor;
    const { form } = state;
    if (!form) return null;

    return (
        <div className="admin-field">
            <span>난도</span>
            <div className="admin-difficulty-picks" role="group" aria-label="난도">
                {[1, 2, 3, 4, 5].map((difficulty) => (
                    <button
                        key={difficulty}
                        type="button"
                        className={form.difficulty === difficulty ? "selected" : ""}
                        onClick={() => actions.updateForm("difficulty", difficulty)}
                    >
                        {difficulty}
                    </button>
                ))}
            </div>
        </div>
    );
}

function BodyToolrow({ editor }: { editor: AdminEditorModel }) {
    const { state, actions } = editor;
    const form = state.form as { answerKind: ProblemManifest["answerKind"] };

    return (
        <div className="admin-body-toolrow">
            <span>본문</span>
            <div>
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => actions.insertBodyMarkup("::math x^2+1")}
                >
                    수식
                </button>
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => actions.insertBodyMarkup("::svg diagrams/graph.svg | 도표")}
                >
                    도표
                </button>
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => actions.insertBodyMarkup("::source 12 | 3 | 공통")}
                >
                    원본
                </button>
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => actions.insertBodyMarkup("::bbox 10, 20, 110, 180")}
                >
                    bbox
                </button>
                <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => actions.insertBodyMarkup("::note 조건")}
                >
                    조건
                </button>
                {form.answerKind === "choice" && (
                    <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => actions.insertBodyMarkup("::choice 1")}
                    >
                        선택지
                    </button>
                )}
            </div>
        </div>
    );
}
