export type AnswerKind = "choice" | "short";
export type RoomStatus = "lobby" | "playing" | "finished";
export type ItemId = "cover" | "hardFirst" | "meme" | "penLock" | "bannedSong" | "auraMinus" | "adviceNote";
export type DebuffId = "blur" | "slowInput" | "hideAssist";

export interface ProblemManifest {
  id: string;
  number: number;
  title: string;
  answerKind: AnswerKind;
  answer: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  pointValue?: number;
  image: string;
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

export interface ProblemPublic {
  id: string;
  number: number;
  title: string;
  answerKind: AnswerKind;
  difficulty: 1 | 2 | 3 | 4 | 5;
  pointValue: number;
  imageUrl: string;
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

export interface ItemDefinition {
  id: ItemId;
  name: string;
  shortName: string;
  durationMs: number;
  description: string;
}

export interface ItemAward {
  itemId: ItemId;
  reason: "lucky" | "difficulty" | "firstTry" | "comeback";
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  cover: {
    id: "cover",
    name: "눈가리기",
    shortName: "눈가림",
    durationMs: 10000,
    description: "대상의 문제 위에 시험지 조각 오버레이를 띄웁니다."
  },
  hardFirst: {
    id: "hardFirst",
    name: "어려운 문제부터 풀어랏",
    shortName: "고난도",
    durationMs: 15000,
    description: "쉬운 문제 이동을 잠시 막고 고난도 문제를 추천합니다."
  },
  meme: {
    id: "meme",
    name: "현우진 짤 투척",
    shortName: "현우진짤",
    durationMs: 8000,
    description: "대상 화면에 서버에 등록된 방해 이미지를 잠시 표시합니다."
  },
  penLock: {
    id: "penLock",
    name: "펜 압수",
    shortName: "펜압수",
    durationMs: 5000,
    description: "대상의 답안 입력을 짧게 비활성화합니다."
  },
  bannedSong: {
    id: "bannedSong",
    name: "수능 금지곡 듣기",
    shortName: "금지곡",
    durationMs: 15000,
    description: "대상 화면에 수능 금지곡 iframe을 15초 동안 띄웁니다."
  },
  auraMinus: {
    id: "auraMinus",
    name: "아우라 -100",
    shortName: "아우라",
    durationMs: 6000,
    description: "대상 화면에 세로 쇼츠식 아우라 -100 놀림 효과를 띄웁니다."
  },
  adviceNote: {
    id: "adviceNote",
    name: "훈수쪽지",
    shortName: "쪽지",
    durationMs: 15000,
    description: "내가 맞힌 문제를 아직 못 맞힌 대상에게 한 줄 편지를 보냅니다."
  }
};

export interface ActiveEffect {
  id: ItemId | DebuffId;
  label: string;
  sourceName: string;
  expiresAt: number;
  message?: string;
  problemNumber?: number;
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
  effects: ActiveEffect[];
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
  maxActiveRooms: 200
} as const;

export const normalizeAnswer = (value: string) => value.trim().replace(/\s+/g, "").toLowerCase();

export const WRONG_ANSWER_PENALTY_MS = 20 * 60 * 1000;

export const getProblemPointValue = (problem: Pick<ProblemManifest, "difficulty" | "pointValue" | "text">) => {
  if (typeof problem.pointValue === "number" && Number.isFinite(problem.pointValue) && problem.pointValue > 0) {
    return Math.round(problem.pointValue);
  }
  const fromText = problem.text?.match(/\[(\d+)점\]/)?.[1];
  if (fromText) return Number(fromText);
  return problem.difficulty >= 4 ? 4 : problem.difficulty >= 2 ? 3 : 2;
};
