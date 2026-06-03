export type AnswerKind = "choice" | "short";
export type RoomStatus = "lobby" | "playing" | "finished";
export type ItemId = "mental" | "cover" | "hardFirst" | "meme" | "penLock";
export type DebuffId = "blur" | "slowInput" | "hideAssist";

export interface ProblemManifest {
  id: string;
  number: number;
  title: string;
  answerKind: AnswerKind;
  answer: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  image: string;
  text?: string;
  sourcePage?: number;
  bbox?: [number, number, number, number];
  section?: string;
  content?: ProblemContent;
  math?: MathBlock[];
  renderBlocks?: ProblemRenderBlock[];
}

export interface ExamManifest {
  id: string;
  title: string;
  subtitle: string;
  timeLimitSec: number;
  fonts?: ExamFontAsset[];
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
  imageUrl: string;
  text?: string;
  sourcePage?: number;
  bbox?: [number, number, number, number];
  section?: string;
  content?: ProblemContent;
  math?: MathBlock[];
  renderBlocks?: ProblemRenderBlock[];
}

export interface ExamPublic extends ExamSummary {
  fonts?: ExamFontAssetPublic[];
  problems: ProblemPublic[];
}

export interface ExamFontAsset {
  family: string;
  file: string;
}

export interface ExamFontAssetPublic extends ExamFontAsset {
  url: string;
}

export interface ProblemSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font: string;
  size: number;
  flags: number;
}

export interface ProblemLine {
  x: number;
  y: number;
  width: number;
  height: number;
  spans: ProblemSpan[];
}

export interface ProblemContent {
  width: number;
  height: number;
  lines: ProblemLine[];
}

export interface MathBlock {
  source: string;
  latex: string;
}

export interface ProblemRenderBlock {
  kind: "text" | "math" | "choices";
  text?: string;
  latex?: string;
  choices?: Array<{ label: string; text: string; latex?: string }>;
}

export interface ItemDefinition {
  id: ItemId;
  name: string;
  shortName: string;
  durationMs: number;
  description: string;
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  mental: {
    id: "mental",
    name: "암산 강요",
    shortName: "암산",
    durationMs: 12000,
    description: "대상의 보조 메모 영역을 잠시 숨깁니다."
  },
  cover: {
    id: "cover",
    name: "문제 가리기",
    shortName: "가리기",
    durationMs: 10000,
    description: "문제 위에 시험지 조각 오버레이를 띄웁니다."
  },
  hardFirst: {
    id: "hardFirst",
    name: "어려운 문제부터 풀어라",
    shortName: "고난도",
    durationMs: 15000,
    description: "쉬운 문제 이동을 잠시 막고 고난도 문제를 추천합니다."
  },
  meme: {
    id: "meme",
    name: "현우진 웃긴 짤",
    shortName: "짤폭탄",
    durationMs: 8000,
    description: "서버에 등록된 방해 이미지를 잠시 표시합니다."
  },
  penLock: {
    id: "penLock",
    name: "펜 압수",
    shortName: "펜압수",
    durationMs: 5000,
    description: "대상의 답안 입력을 짧게 비활성화합니다."
  }
};

export interface ActiveEffect {
  id: ItemId | DebuffId;
  label: string;
  sourceName: string;
  expiresAt: number;
}

export interface SubmissionPublic {
  problemId: string;
  answer: string;
  correct: boolean;
  submittedAt: number;
  scoreAwarded: number;
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
  solved: number;
  lastAcceptedAt: number | null;
}

export interface PlayerPublic {
  id: string;
  nickname: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  ready: boolean;
  currentProblemId: string;
  consecutiveWrong: number;
  inventory: ItemId[];
  effects: ActiveEffect[];
  submissions: SubmissionPublic[];
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
  itemEnabled: boolean;
  startedAt: number | null;
  endsAt: number | null;
  scoreboardFrozen: boolean;
  scoreboardFrozenAt: number | null;
  frozenStandings: StandingPublic[];
  players: PlayerPublic[];
  logs: ArenaLog[];
}

export interface ServerResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export const normalizeAnswer = (value: string) => value.trim().replace(/\s+/g, "").toLowerCase();
