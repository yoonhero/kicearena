import type { CampaignUserPublic, ReferralLocationVerification } from "../../../shared/campaign";
import type { ReactNode } from "react";
import type {
    ExamPublic,
    ExamSummary,
    PlayerPublic,
    RoomPublic,
    GymEventSummary,
} from "../../../shared/game";
import { lazy, Suspense } from "react";
import { ReferralSchoolGate } from "./ReferralSchoolGate";

export type AppScreen = "home" | "lobby" | "arena" | "rankings" | "results" | "spectator";
export type SitePage = "home" | "competition" | "practice" | "profile" | "login" | "signup";

const ArenaScreen = lazy(() =>
    import("../screens/ArenaScreen").then((module) => ({ default: module.ArenaScreen })),
);
const AuthSignupScreen = lazy(() =>
    import("../screens/AuthSignupScreen").then((module) => ({ default: module.AuthSignupScreen })),
);
const EventHomeScreen = lazy(() =>
    import("../screens/EventHomeScreen").then((module) => ({ default: module.EventHomeScreen })),
);
const HomeScreen = lazy(() =>
    import("../screens/HomeScreen").then((module) => ({ default: module.HomeScreen })),
);
const HomeLandingScreen = lazy(() =>
    import("../screens/HomeLandingScreen").then((module) => ({
        default: module.HomeLandingScreen,
    })),
);
const AuthLoginScreen = lazy(() =>
    import("../screens/AuthLoginScreen").then((module) => ({ default: module.AuthLoginScreen })),
);
const LobbyScreen = lazy(() =>
    import("../screens/LobbyScreen").then((module) => ({ default: module.LobbyScreen })),
);
const ProfileScreen = lazy(() =>
    import("../screens/ProfileScreen").then((module) => ({ default: module.ProfileScreen })),
);
const RankingsScreen = lazy(() =>
    import("../screens/RankingsScreen").then((module) => ({ default: module.RankingsScreen })),
);
const ResultsScreen = lazy(() =>
    import("../screens/ResultsScreen").then((module) => ({ default: module.ResultsScreen })),
);
const SpectatorProblemScreen = lazy(() =>
    import("../screens/SpectatorProblemScreen").then((module) => ({
        default: module.SpectatorProblemScreen,
    })),
);

export function AppLoading({
    inviteCode,
    needsReferralGate,
    referralCode,
    completeReferralGate,
    exitReferralGate,
}: {
    inviteCode: string;
    needsReferralGate: boolean;
    referralCode: string;
    completeReferralGate: (verification: ReferralLocationVerification) => void;
    exitReferralGate: () => void;
}) {
    if (needsReferralGate) {
        return (
            <div className="app-shell">
                <ReferralSchoolGate
                    referralCode={referralCode}
                    onVerified={completeReferralGate}
                    onExit={exitReferralGate}
                />
            </div>
        );
    }

    return (
        <div className="app-shell">
            <InitialRoomLoading inviteCode={inviteCode} />
        </div>
    );
}

export function AppRoutes(props: {
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
}) {
    return (
        <div className="app-shell">
            {props.needsReferralGate && (
                <ReferralSchoolGate
                    referralCode={props.referralCode}
                    onVerified={props.completeReferralGate}
                    onExit={props.exitReferralGate}
                />
            )}

            {props.screen === "home" && !props.needsReferralGate && (
                <Suspense fallback={<PageLoading label="페이지 준비 중" />}>
                    <HomePageRoutes {...props} />
                </Suspense>
            )}

            {props.screen === "spectator" && props.spectatorExam && (
                <Suspense fallback={<PageLoading label="문제지 준비 중" />}>
                    <SpectatorProblemScreen
                        exam={props.spectatorExam}
                        onBack={props.exitSpectator}
                    />
                </Suspense>
            )}

            {props.screen === "lobby" && props.room && (
                <Suspense fallback={<PageLoading label="시험실 준비 중" />}>
                    <LobbyScreen
                        room={props.room}
                        ownPlayer={props.ownPlayer}
                        copyCode={props.copyCode}
                        copied={props.copied}
                        copyInviteLink={props.copyInviteLink}
                        copiedLink={props.copiedLink}
                        leaveRoom={props.leaveRoom}
                    />
                </Suspense>
            )}

            {props.screen === "arena" && props.room && props.ownPlayer && (
                <Suspense fallback={<PageLoading label="시험지 준비 중" />}>
                    <ArenaScreen
                        room={props.room}
                        ownPlayer={props.ownPlayer}
                        onLeave={props.leaveRoom}
                    />
                </Suspense>
            )}

            {props.screen === "rankings" && props.room && (
                <Suspense fallback={<PageLoading label="순위표 준비 중" />}>
                    <RankingsScreen
                        room={props.room}
                        ownPlayer={props.ownPlayer}
                        onBack={props.leaveRoom}
                    />
                </Suspense>
            )}

            {props.screen === "results" && props.room && (
                <Suspense fallback={<PageLoading label="성적표 준비 중" />}>
                    <ResultsScreen
                        room={props.room}
                        ownPlayer={props.ownPlayer}
                        onLeave={props.leaveRoom}
                    />
                </Suspense>
            )}
        </div>
    );
}

function PageLoading({ label }: { label: string }) {
    return (
        <main className="initial-room-loading" aria-live="polite">
            <section>
                <span>화면 전환</span>
                <strong>{label}</strong>
                <i />
            </section>
        </main>
    );
}

function HomePageRoutes(props: Parameters<typeof AppRoutes>[0]) {
    const canUseSignup = Boolean(props.referralVerification?.school?.id);
    const effectivePage = props.page === "signup" && !canUseSignup ? "profile" : props.page;
    const siteNav = props.inviteMode ? null : (
        <SiteNav page={effectivePage} setPage={props.setPage} />
    );

    if (props.inviteMode || effectivePage === "competition") {
        return <HomeContestRoute {...props} siteNav={siteNav} />;
    }
    if (effectivePage === "practice") {
        return (
            <HomeScreen
                exams={props.exams}
                selectedExamId={props.selectedExamId}
                setSelectedExamId={props.setSelectedExamId}
                timeLimitMin={props.timeLimitMin}
                setTimeLimitMin={props.setTimeLimitMin}
                freezeBeforeMin={props.freezeBeforeMin}
                setFreezeBeforeMin={props.setFreezeBeforeMin}
                itemEnabled={props.itemEnabled}
                setItemEnabled={props.setItemEnabled}
                nickname={props.nickname}
                setNickname={props.setNickname}
                roomCode={props.roomCode}
                setRoomCode={props.setRoomCode}
                createRoom={props.createRoom}
                joinRoom={props.joinRoom}
                joinInviteRoom={props.joinInviteRoom}
                inviteMode={false}
                inviteRoomCode={props.inviteCode}
                joiningInvite={props.joiningInvite}
                exitInviteMode={props.exitInviteMode}
                error={props.error}
            />
        );
    }
    if (effectivePage === "profile") {
        return (
            <ProfileScreen
                campaignUser={props.campaignUser}
                referralVerification={props.referralVerification}
                goSignup={() => props.setPage("signup")}
                goCompetition={() => props.setPage("competition")}
                siteNav={siteNav}
            />
        );
    }
    if (effectivePage === "signup" && canUseSignup) {
        return (
            <AuthSignupScreen
                referralVerification={props.referralVerification}
                onRegistered={props.setCampaignUser}
                onVerified={(user) => {
                    props.setCampaignUser(user);
                    props.setPage("profile");
                }}
                siteNav={siteNav}
            />
        );
    }
    if (effectivePage === "login") {
        return (
            <AuthLoginScreen
                onLoggedIn={(user) => {
                    props.setCampaignUser(user);
                    props.setPage("profile");
                }}
                siteNav={siteNav}
            />
        );
    }
    return (
        <HomeLandingScreen goCompetition={() => props.setPage("competition")} siteNav={siteNav} />
    );
}

function HomeContestRoute({
    siteNav,
    ...props
}: Parameters<typeof AppRoutes>[0] & { siteNav: ReactNode }) {
    return (
        <EventHomeScreen
            events={props.events}
            eventsUnavailable={props.eventsUnavailable}
            campaignUser={props.campaignUser}
            referralVerification={props.referralVerification}
            hasReferralVerification={props.hasReferralVerification}
            nickname={props.nickname}
            setNickname={props.setNickname}
            joinInviteRoom={props.joinInviteRoom}
            inviteMode={props.inviteMode}
            inviteRoomCode={props.inviteCode}
            joiningInvite={props.joiningInvite}
            exitInviteMode={props.exitInviteMode}
            registerForEvent={props.registerForEvent}
            spectateEvent={props.spectateEvent}
            pendingEventAction={props.pendingEventAction}
            error={props.error}
            siteNav={siteNav}
        />
    );
}

function SiteNav({ page, setPage }: { page: SitePage; setPage: (page: SitePage) => void }) {
    const activePage = page === "signup" ? "profile" : page;

    return (
        <nav className="exam-site-nav" aria-label="주요 메뉴">
            {(
                [
                    ["home", "홈"],
                    ["competition", "대회"],
                    ["practice", "연습"],
                    ["profile", "프로필"],
                    ["login", "로그인"],
                ] as const
            ).map(([target, label]) => (
                <a
                    key={target}
                    className={activePage === target ? "active" : ""}
                    href={target === "home" ? "/" : `/${target}`}
                    aria-current={activePage === target ? "page" : undefined}
                    onClick={(event) => {
                        event.preventDefault();
                        setPage(target);
                    }}
                >
                    {label}
                </a>
            ))}
        </nav>
    );
}

function InitialRoomLoading({ inviteCode }: { inviteCode: string }) {
    return (
        <main className="initial-room-loading" aria-live="polite">
            <section>
                <span>수험표 확인 중</span>
                <strong>{inviteCode ? `${inviteCode} 방 조회` : "기록된 입실 정보 조회"}</strong>
                <i />
            </section>
        </main>
    );
}
