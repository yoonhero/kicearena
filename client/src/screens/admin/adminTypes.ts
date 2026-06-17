import type { ExamManifest, ProblemManifest } from "../../../../shared/game";

export type AdminExam = ExamManifest & { active: boolean };

export type ProblemForm = {
    title: string;
    answerKind: ProblemManifest["answerKind"];
    answer: string;
    difficulty: number;
    pointValue: string;
    bodyMarkup: string;
};

export type ExamSettingsForm = {
    title: string;
    subtitle: string;
    timeLimitMin: string;
    active: boolean;
    releaseAt: string;
};

export type NewExamForm = ExamSettingsForm & {
    id: string;
};

export type AdminAssetUpload = {
    path: string;
    src: string;
};
