export type AnswerKind = "choice" | "short";
export type RoomStatus = "lobby" | "playing" | "finished";
export type RoomMode = "casual" | "contest";
export const ITEM_IDS = [
    "cover",
    "rotateProblem",
    "hardFirst",
    "meme",
    "penLock",
    "bannedSong",
    "auraMinus",
    "adviceNote",
] as const;
export type ItemId = (typeof ITEM_IDS)[number];
export type DebuffId = "blur" | "slowInput" | "hideAssist";

export type ProblemBodyBlock =
    | { kind: "paragraph"; text: string; inlineMath?: string[] }
    | { kind: "displayMath"; latex: string }
    | { kind: "choices"; choices: string[] }
    | { kind: "diagram"; src: string; alt: string; caption?: string }
    | { kind: "note"; text: string };

const isStringArray = (value: unknown) =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

export const isProblemBodyBlock = (value: unknown): value is ProblemBodyBlock => {
    if (!value || typeof value !== "object") return false;
    const block = value as Record<string, unknown>;

    if (block.kind === "paragraph") {
        return (
            typeof block.text === "string" &&
            (block.inlineMath === undefined || isStringArray(block.inlineMath))
        );
    }
    if (block.kind === "displayMath") {
        return typeof block.latex === "string";
    }
    if (block.kind === "choices") {
        return isStringArray(block.choices);
    }
    if (block.kind === "diagram") {
        return (
            typeof block.src === "string" &&
            typeof block.alt === "string" &&
            (block.caption === undefined || typeof block.caption === "string")
        );
    }
    if (block.kind === "note") {
        return typeof block.text === "string";
    }
    return false;
};

export const isProblemBody = (value: unknown): value is ProblemBodyBlock[] =>
    Array.isArray(value) && value.every(isProblemBodyBlock);

export interface ProblemManifest {
    id: string;
    number: number;
    title: string;
    answerKind: AnswerKind;
    answer: string;
    difficulty: 1 | 2 | 3 | 4 | 5;
    pointValue?: number;
    image?: string;
    body?: ProblemBodyBlock[];
    text?: string;
    sourceNumber?: number;
    sourcePage?: number;
    bbox?: [number, number, number, number];
    section?: string;
    captureQuality?: CaptureQuality;
}

export interface ExamManifest {
    id: string;
    title: string;
    subtitle: string;
    timeLimitSec: number;
    releaseAt?: string;
    captureSummary?: CaptureSummary;
    problems: ProblemManifest[];
}

export interface ExamSummary {
    id: string;
    title: string;
    subtitle: string;
    timeLimitSec: number;
    problemCount: number;
}

export type GymEventStatus = "upcoming" | "open";

export interface GymEventSummary extends ExamSummary {
    startsAt: string | null;
    status: GymEventStatus;
    registration: "invite-only" | "open";
    spectatorAllowed: true;
}

export interface ProblemPublic {
    id: string;
    number: number;
    title: string;
    answerKind: AnswerKind;
    difficulty: 1 | 2 | 3 | 4 | 5;
    pointValue: number;
    imageUrl?: string;
    body?: ProblemBodyBlock[];
    text?: string;
    sourceNumber?: number;
    sourcePage?: number;
    bbox?: [number, number, number, number];
    section?: string;
    captureQuality?: CaptureQuality;
}

export interface ExamPublic extends ExamSummary {
    captureSummary?: CaptureSummary;
    problems: ProblemPublic[];
}

export interface CaptureQuality {
    score: number;
    usable: boolean;
    warnings: string[];
}

export interface CaptureSummary {
    mode: string;
    problemCount: number;
    averageScore: number;
    warningCount: number;
    unusableProblems: number[];
}

export type ItemCategory = "problemDisruptor" | "inputDisruptor" | "attentionDisruptor" | "social";
export type ItemEffectKind =
    | "screenCover"
    | "problemRotate"
    | "hardProblemGate"
    | "memeOverlay"
    | "inputLock"
    | "bannedSong"
    | "auraOverlay"
    | "adviceNote";
export type ItemTargetPolicy = "opponent" | "eligibleUnsolved";
export type ItemDuplicatePolicy = "blockWhileActive" | "refresh";

export interface ItemLifecycle {
    acquire: "award";
    activate: "instant";
    durationMs: number;
    cooldownMs: number;
    target: ItemTargetPolicy;
    duplicate: ItemDuplicatePolicy;
    cancellation: "expire";
}

export interface ItemDefinition {
    id: ItemId;
    name: string;
    shortName: string;
    category: ItemCategory;
    effectKind: ItemEffectKind;
    lifecycle: ItemLifecycle;
    description: string;
    payload?: {
        message?: {
            prompt: string;
            defaultText: string;
            maxLength: number;
        };
    };
}

export interface ItemAward {
    itemId: ItemId;
    reason: "lucky" | "difficulty" | "firstTry" | "comeback";
}

export type ItemCooldowns = Partial<Record<ItemId, number>>;

const itemLifecycle = (
    durationMs: number,
    target: ItemTargetPolicy = "opponent",
    duplicate: ItemDuplicatePolicy = "blockWhileActive",
    cooldownMs = 0,
): ItemLifecycle => ({
    acquire: "award",
    activate: "instant",
    durationMs,
    cooldownMs,
    target,
    duplicate,
    cancellation: "expire",
});

type ItemDefinitionFor<TItemId extends ItemId> = Omit<ItemDefinition, "id"> & { id: TItemId };

const defineItems = <TItems extends { [TItemId in ItemId]: ItemDefinitionFor<TItemId> }>(
    items: TItems,
) => items;

export const ITEM_DEFINITIONS = defineItems({
    cover: {
        id: "cover",
        name: "눈가리기",
        shortName: "눈가림",
        category: "problemDisruptor",
        effectKind: "screenCover",
        lifecycle: itemLifecycle(10000),
        description: "대상의 문제 위에 시험지 조각 오버레이를 띄웁니다.",
    },
    rotateProblem: {
        id: "rotateProblem",
        name: "문제지 돌리기",
        shortName: "회전",
        category: "problemDisruptor",
        effectKind: "problemRotate",
        lifecycle: itemLifecycle(9000),
        description: "대상의 문제 이미지를 잠시 기울여 풀이 리듬을 흔듭니다.",
    },
    hardFirst: {
        id: "hardFirst",
        name: "어려운 문제부터 풀어랏",
        shortName: "고난도",
        category: "problemDisruptor",
        effectKind: "hardProblemGate",
        lifecycle: itemLifecycle(15000),
        description: "쉬운 문제 이동을 잠시 막고 고난도 문제를 추천합니다.",
    },
    meme: {
        id: "meme",
        name: "현우진 짤 투척",
        shortName: "현우진짤",
        category: "attentionDisruptor",
        effectKind: "memeOverlay",
        lifecycle: itemLifecycle(8000),
        description: "대상 화면에 서버에 등록된 방해 이미지를 잠시 표시합니다.",
    },
    penLock: {
        id: "penLock",
        name: "펜 압수",
        shortName: "펜압수",
        category: "inputDisruptor",
        effectKind: "inputLock",
        lifecycle: itemLifecycle(5000),
        description: "대상의 답안 입력을 짧게 비활성화합니다.",
    },
    bannedSong: {
        id: "bannedSong",
        name: "수능 금지곡 듣기",
        shortName: "금지곡",
        category: "attentionDisruptor",
        effectKind: "bannedSong",
        lifecycle: itemLifecycle(15000),
        description: "대상 화면에 수능 금지곡 iframe을 15초 동안 띄웁니다.",
    },
    auraMinus: {
        id: "auraMinus",
        name: "아우라 -100",
        shortName: "아우라",
        category: "attentionDisruptor",
        effectKind: "auraOverlay",
        lifecycle: itemLifecycle(6000),
        description: "대상 화면에 세로 쇼츠식 아우라 -100 놀림 효과를 띄웁니다.",
    },
    adviceNote: {
        id: "adviceNote",
        name: "훈수쪽지",
        shortName: "쪽지",
        category: "social",
        effectKind: "adviceNote",
        lifecycle: itemLifecycle(15000, "eligibleUnsolved", "refresh"),
        description: "내가 맞힌 문제를 아직 못 맞힌 대상에게 한 줄 편지를 보냅니다.",
        payload: {
            message: {
                prompt: "쪽지 내용",
                defaultText: "이 문제 아직 못 풀었어?",
                maxLength: 72,
            },
        },
    },
});

export const ITEM_CATALOG = ITEM_IDS.map((itemId) => ITEM_DEFINITIONS[itemId]);

export interface ActiveEffect {
    id: ItemId | DebuffId;
    label: string;
    sourceName: string;
    expiresAt: number;
    message?: string;
    problemNumber?: number;
}

export interface ExpiredEffect extends ActiveEffect {
    clearedAt: number;
}

export interface SubmissionPublic {
    problemId: string;
    answer: string;
    correct: boolean;
    submittedAt: number;
    scoreAwarded: number;
    penaltyMs: number;
    attempts: number;
}

export interface ScoreBreakdown {
    solved: number;
    timeBonus: number;
    difficultyBonus: number;
}

export interface StandingPublic {
    playerId: string;
    nickname: string;
    score: number;
    penaltyMs: number;
    solved: number;
    lastAcceptedAt: number | null;
}

export interface PlayerPublic {
    id: string;
    nickname: string;
    score: number;
    penaltyMs: number;
    scoreBreakdown: ScoreBreakdown;
    ready: boolean;
    currentProblemId: string;
    consecutiveWrong: number;
    inventory: ItemId[];
    itemCooldowns: ItemCooldowns;
    effects: ActiveEffect[];
    expiredEffects: ExpiredEffect[];
    submissions: SubmissionPublic[];
    submissionHistory: SubmissionPublic[];
    connected: boolean;
}

export interface ArenaLog {
    id: string;
    kind: "system" | "submit" | "item" | "penalty";
    message: string;
    createdAt: number;
}

export interface RoomPublic {
    code: string;
    hostId: string;
    exam: ExamPublic;
    mode: RoomMode;
    maxPlayers: number;
    version: number;
    status: RoomStatus;
    timeLimitSec: number;
    freezeBeforeSec: number;
    itemEnabled: boolean;
    startedAt: number | null;
    endsAt: number | null;
    scoreboardFrozen: boolean;
    scoreboardFrozenAt: number | null;
    frozenStandings: StandingPublic[];
    scoreboardRevealCount: number;
    players: PlayerPublic[];
    logs: ArenaLog[];
}

export interface ServerResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: string;
}

export const ROOM_GUARDRAILS = {
    minTimeLimitSec: 60,
    maxTimeLimitSec: 120 * 60,
    defaultFreezeBeforeSec: 10 * 60,
    maxPlayersPerRoom: 60,
    maxContestPlayersPerRoom: 200,
    maxNicknameLength: 6,
    maxActiveRooms: 200,
} as const;

export const normalizeAnswer = (value: string) => value.trim().replace(/\s+/g, "").toLowerCase();

export const WRONG_ANSWER_PENALTY_MS = 20 * 60 * 1000;

export const getProblemPointValue = (
    problem: Pick<ProblemManifest, "difficulty" | "pointValue" | "text">,
) => {
    if (
        typeof problem.pointValue === "number" &&
        Number.isFinite(problem.pointValue) &&
        problem.pointValue > 0
    ) {
        return Math.round(problem.pointValue);
    }
    const fromText = problem.text?.match(/\[(\d+)점\]/)?.[1];
    if (fromText) return Number(fromText);
    return problem.difficulty >= 4 ? 4 : problem.difficulty >= 2 ? 3 : 2;
};
