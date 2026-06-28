import { type Dispatch, type DragEvent, type SetStateAction, useRef, useState } from "react";
import { insertMarkupAtRange } from "../adminProblemMarkup";
import { isSvgFile } from "./adminFormUtils";
import { uploadAdminSvgAsset } from "./adminEditorApi";
import type { ProblemForm } from "./adminTypes";

export function useAdminBodyMarkup({
    token,
    selectedExamId,
    setForm,
    setError,
    setStatus,
}: {
    token: string;
    selectedExamId: string | undefined;
    setForm: Dispatch<SetStateAction<ProblemForm | null>>;
    setError: Dispatch<SetStateAction<string>>;
    setStatus: Dispatch<SetStateAction<string>>;
}) {
    const [assetDragging, setAssetDragging] = useState(false);
    const [uploadingAsset, setUploadingAsset] = useState(false);
    const bodyEditorRef = useRef<HTMLTextAreaElement | null>(null);

    const insertBodyMarkup = (markup: string, textarea = bodyEditorRef.current) => {
        let nextCaret = -1;
        setForm((current) => {
            if (!current) return current;
            const inserted = insertMarkupAtRange(
                current.bodyMarkup,
                markup,
                textarea?.selectionStart ?? current.bodyMarkup.length,
                textarea?.selectionEnd ?? textarea?.selectionStart ?? current.bodyMarkup.length,
            );
            nextCaret = inserted.caret;
            return { ...current, bodyMarkup: inserted.value };
        });
        window.requestAnimationFrame(() => {
            if (!bodyEditorRef.current || nextCaret < 0) return;
            bodyEditorRef.current.focus();
            bodyEditorRef.current.setSelectionRange(nextCaret, nextCaret);
        });
    };

    const handleBodyDrop = async (event: DragEvent<HTMLTextAreaElement>) => {
        const files = [...event.dataTransfer.files];
        const file = files.find(isSvgFile);
        if (!file) {
            if (files.length > 0) {
                event.preventDefault();
                setAssetDragging(false);
                setError("SVG 파일만 업로드할 수 있습니다.");
            }
            return;
        }
        event.preventDefault();
        setAssetDragging(false);
        setUploadingAsset(true);
        setError("");
        setStatus("");
        try {
            if (!selectedExamId) throw new Error("문제지를 먼저 선택하세요.");
            const uploaded = await uploadAdminSvgAsset(token, selectedExamId, file);
            const label =
                file.name
                    .replace(/\.svg$/i, "")
                    .replace(/[-_]+/g, " ")
                    .trim() || "도표";
            insertBodyMarkup(`::svg ${uploaded.path} | ${label}`, event.currentTarget);
            setStatus(`${file.name} 업로드됨`);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "SVG 업로드 실패");
        } finally {
            setUploadingAsset(false);
        }
    };

    const handleBodyDragOver = (event: DragEvent<HTMLTextAreaElement>) => {
        if (![...event.dataTransfer.items].some((item) => item.kind === "file")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setAssetDragging(true);
    };

    return {
        assetDragging,
        uploadingAsset,
        bodyEditorRef,
        setAssetDragging,
        insertBodyMarkup,
        handleBodyDrop,
        handleBodyDragOver,
    };
}
