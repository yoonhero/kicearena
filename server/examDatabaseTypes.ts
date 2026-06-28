import type { QueryResult } from "pg";
import type {
    CaptureQuality,
    CaptureSummary,
    ExamManifest,
    ProblemBodyBlock,
    ProblemManifest,
} from "../shared/game.js";

export interface ExamCatalogDatabase {
    query<T extends object = Record<string, unknown>>(
        text: string,
        values?: unknown[],
    ): Promise<QueryResult<T>>;
}

export type ExamRow = {
    id: string;
    title: string;
    subtitle: string;
    time_limit_sec: number;
    freeze_before_sec: number | null;
    release_at: Date | string | null;
    capture_summary: CaptureSummary | null;
};

export type AdminExamRow = ExamRow & {
    active: boolean;
};

export type ProblemRow = {
    exam_id: string;
    id: string;
    number: number;
    title: string;
    answer_kind: ProblemManifest["answerKind"];
    answer: string;
    difficulty: ProblemManifest["difficulty"];
    point_value: number | null;
    image: string | null;
    body: ProblemBodyBlock[] | null;
    text: string | null;
    source_number: number | null;
    source_page: number | null;
    bbox: [number, number, number, number] | null;
    section: string | null;
    capture_quality: CaptureQuality | null;
};

export type ExamAssetInput = {
    examId: string;
    path: string;
    contentType: string;
    body: Buffer;
};

export type ExamAsset = ExamAssetInput & {
    updatedAt: Date;
};

export type AdminExamManifest = ExamManifest & {
    active: boolean;
};

export type ProblemUpdateInput = {
    title: string;
    answerKind: ProblemManifest["answerKind"];
    answer: string;
    difficulty: ProblemManifest["difficulty"];
    pointValue: number | null;
    body: ProblemBodyBlock[] | null;
    sourceNumber: number | null;
    sourcePage: number | null;
    bbox: [number, number, number, number] | null;
    section: string | null;
};

export type ProblemCreateInput = {
    title: string;
    answerKind: ProblemManifest["answerKind"];
    answer: string;
    difficulty: ProblemManifest["difficulty"];
    pointValue: number | null;
    body: ProblemBodyBlock[] | null;
    sourceNumber?: number | null;
    sourcePage?: number | null;
    bbox?: [number, number, number, number] | null;
    section?: string | null;
};

export type ExamCreateInput = {
    id: string;
    title: string;
    subtitle: string;
    timeLimitSec: number;
    freezeBeforeSec: number;
    active: boolean;
    releaseAt: string | null;
};

export type ExamSettingsUpdateInput = {
    title: string;
    subtitle: string;
    timeLimitSec: number;
    freezeBeforeSec: number;
    active: boolean;
    releaseAt: string | null;
};
