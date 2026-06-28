import type { ProblemBodyBlock, ProblemManifest } from "../../../../shared/game";
import { uploadHeaderFileName } from "./adminFormUtils";
import type { AdminAssetUpload, AdminExam } from "./adminTypes";

type ExamCreatePayload = {
    id: string;
    title: string;
    subtitle: string;
    timeLimitSec: number;
    freezeBeforeSec: number;
    active: boolean;
    releaseAt: string | null;
};

type ExamSettingsPayload = Omit<ExamCreatePayload, "id">;

type ProblemUpdatePayload = {
    title: string;
    answerKind: ProblemManifest["answerKind"];
    answer: string;
    difficulty: number;
    pointValue: number | null;
    sourceNumber: number | null;
    sourcePage: number | null;
    bbox: [number, number, number, number] | null;
    section: string | null;
    body: ProblemBodyBlock[] | null;
};

const authHeaders = (token: string): Record<string, string> =>
    token ? { "X-Admin-Token": token } : {};

const adminErrorMessage = (response: Response, fallback: string) =>
    response.status === 401 || response.status === 403 ? "관리자 권한을 확인하세요." : fallback;

export const fetchAdminExams = async (token: string): Promise<AdminExam[]> => {
    const response = await fetch("/api/admin/exams", { headers: authHeaders(token) });
    if (!response.ok)
        throw new Error(adminErrorMessage(response, "문제지 목록을 불러오지 못했습니다."));
    return (await response.json()) as AdminExam[];
};

export const uploadAdminSvgAsset = async (
    token: string,
    examId: string,
    file: File,
): Promise<AdminAssetUpload> => {
    const response = await fetch(`/api/admin/exams/${encodeURIComponent(examId)}/assets`, {
        method: "POST",
        headers: {
            "Content-Type": "image/svg+xml",
            "X-File-Name": uploadHeaderFileName(file.name),
            ...authHeaders(token),
        },
        body: file,
    });
    if (!response.ok) throw new Error(adminErrorMessage(response, "SVG 업로드 실패"));
    return (await response.json()) as AdminAssetUpload;
};

export const createAdminExam = async (
    token: string,
    payload: ExamCreatePayload,
): Promise<AdminExam> => {
    const response = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(
            response.status === 409
                ? "이미 존재하는 문제지 id입니다."
                : adminErrorMessage(response, "문제지 생성 실패"),
        );
    }
    return (await response.json()) as AdminExam;
};

export const saveAdminExamSettings = async (
    token: string,
    examId: string,
    payload: ExamSettingsPayload,
): Promise<AdminExam> => {
    const response = await fetch(`/api/admin/exams/${encodeURIComponent(examId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(adminErrorMessage(response, "문제지 설정 저장 실패"));
    return (await response.json()) as AdminExam;
};

export const endAdminEvent = async (
    token: string,
    examId: string,
): Promise<{ endedRooms: number }> => {
    const response = await fetch(`/api/admin/events/${encodeURIComponent(examId)}/end`, {
        method: "POST",
        headers: authHeaders(token),
    });
    if (!response.ok) throw new Error(adminErrorMessage(response, "대회 종료 실패"));
    return (await response.json()) as { endedRooms: number };
};

export const createAdminProblem = async (
    token: string,
    examId: string,
): Promise<ProblemManifest> => {
    const response = await fetch(`/api/admin/exams/${encodeURIComponent(examId)}/problems`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
            title: "새 문항",
            answerKind: "short",
            answer: "1",
            difficulty: 1,
            pointValue: null,
            body: [{ kind: "paragraph", text: "" }],
        }),
    });
    if (!response.ok) throw new Error(adminErrorMessage(response, "문항 추가 실패"));
    return (await response.json()) as ProblemManifest;
};

export const saveAdminProblem = async (
    token: string,
    examId: string,
    problemId: string,
    payload: ProblemUpdatePayload,
): Promise<ProblemManifest> => {
    const response = await fetch(
        `/api/admin/exams/${encodeURIComponent(examId)}/problems/${encodeURIComponent(problemId)}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders(token) },
            body: JSON.stringify(payload),
        },
    );
    if (!response.ok) throw new Error(adminErrorMessage(response, "문제 저장 실패"));
    return (await response.json()) as ProblemManifest;
};
