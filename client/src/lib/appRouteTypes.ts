import type { CampaignUserPublic, ReferralLocationVerification } from "../../../shared/campaign";
import type {
    ExamPublic,
    ExamSummary,
    GymEventSummary,
    PlayerPublic,
    RoomPublic,
} from "../../../shared/game";
import type { SitePage } from "./siteRoutes";

export type AppScreen = "home" | "lobby" | "arena" | "rankings" | "results" | "spectator";

export type AppRoutesProps = {
    screen: AppScreen;
    page: SitePage;
    setPage: (page: SitePage) => void;
    needsReferralGate: boolean;
    referralCode: string;
    referralVerification: ReferralLocationVerification | null;
    completeReferralGate: (verification: ReferralLocationVerification) => void;
    exitReferralGate: () => void;
    events: GymEventSummary[];
    eventsUnavailable: boolean;
    campaignUser: CampaignUserPublic | null;
    setCampaignUser: (user: CampaignUserPublic) => void;
    hasReferralVerification: boolean;
    nickname: string;
    setNickname: (nickname: string) => void;
    exams: ExamSummary[];
    selectedExamId: string;
    setSelectedExamId: (id: string) => void;
    timeLimitMin: number;
    setTimeLimitMin: (value: number) => void;
    freezeBeforeMin: number;
    setFreezeBeforeMin: (value: number) => void;
    itemEnabled: boolean;
    setItemEnabled: (enabled: boolean) => void;
    roomCode: string;
    setRoomCode: (value: string) => void;
    createRoom: () => Promise<void>;
    joinRoom: () => Promise<void>;
    joinInviteRoom: () => Promise<void>;
    inviteMode: boolean;
    inviteCode: string;
    joiningInvite: boolean;
    exitInviteMode: () => void;
    registerForEvent: (eventId: string) => Promise<void>;
    spectateEvent: (eventId: string) => Promise<void>;
    pendingEventAction: { eventId: string; action: "register" | "spectate" } | null;
    spectatorExam: ExamPublic | null;
    exitSpectator: () => void;
    room: RoomPublic | null;
    ownPlayer: PlayerPublic | null;
    copyCode: () => Promise<void>;
    copied: boolean;
    copyInviteLink: () => Promise<void>;
    copiedLink: boolean;
    leaveRoom: () => Promise<void>;
    error: string;
};
