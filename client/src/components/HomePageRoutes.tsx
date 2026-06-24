import type { ReactNode } from "react";
import { lazy } from "react";
import type { AppRoutesProps } from "../lib/appRouteTypes";
import { isSitePageEnabled, SITE_NAV_ITEMS, type SitePage } from "../lib/siteRoutes";

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
const ProfileScreen = lazy(() =>
    import("../screens/ProfileScreen").then((module) => ({ default: module.ProfileScreen })),
);

export function HomePageRoutes(props: AppRoutesProps) {
    const canUseSignup = Boolean(props.referralVerification?.school?.id);
    const effectivePage = props.page === "signup" && !canUseSignup ? "profile" : props.page;
    const siteNav = props.inviteMode ? null : (
        <SiteNav page={effectivePage} setPage={props.setPage} />
    );

    if (props.inviteMode || effectivePage === "competition") {
        return <HomeContestRoute {...props} siteNav={siteNav} />;
    }
    if (effectivePage === "practice" && isSitePageEnabled("practice")) {
        return <PracticePageRoute {...props} />;
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

function PracticePageRoute(props: AppRoutesProps) {
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

function HomeContestRoute({ siteNav, ...props }: AppRoutesProps & { siteNav: ReactNode }) {
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
            {SITE_NAV_ITEMS.map(({ page: target, label, path }) => (
                <a
                    key={target}
                    className={activePage === target ? "active" : ""}
                    href={path}
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
