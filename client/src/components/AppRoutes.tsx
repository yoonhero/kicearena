import type { ReferralLocationVerification } from "../../../shared/campaign";
import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import type { AppRoutesProps } from "../lib/appRouteTypes";
import { HomePageRoutes } from "./HomePageRoutes";
import { ReferralSchoolGate } from "./ReferralSchoolGate";

const ArenaScreen = lazy(() =>
    import("../screens/ArenaScreen").then((module) => ({ default: module.ArenaScreen })),
);
const LobbyScreen = lazy(() =>
    import("../screens/LobbyScreen").then((module) => ({ default: module.LobbyScreen })),
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

export function AppRoutes(props: AppRoutesProps) {
    const screenRoute = getScreenRoute(props);

    return (
        <div className="app-shell">
            {props.needsReferralGate && (
                <ReferralSchoolGate
                    referralCode={props.referralCode}
                    onVerified={props.completeReferralGate}
                    onExit={props.exitReferralGate}
                />
            )}

            {!props.needsReferralGate && screenRoute && (
                <Suspense fallback={<PageLoading label={screenRoute.loadingLabel} />}>
                    {screenRoute.node}
                </Suspense>
            )}
        </div>
    );
}

function getScreenRoute(props: AppRoutesProps): { loadingLabel: string; node: ReactNode } | null {
    if (props.screen === "home") {
        return { loadingLabel: "페이지 준비 중", node: <HomePageRoutes {...props} /> };
    }
    if (props.screen === "spectator" && props.spectatorExam) {
        return {
            loadingLabel: "문제지 준비 중",
            node: (
                <SpectatorProblemScreen exam={props.spectatorExam} onBack={props.exitSpectator} />
            ),
        };
    }
    if (props.screen === "lobby" && props.room) {
        return {
            loadingLabel: "시험실 준비 중",
            node: (
                <LobbyScreen
                    room={props.room}
                    ownPlayer={props.ownPlayer}
                    copyCode={props.copyCode}
                    copied={props.copied}
                    copyInviteLink={props.copyInviteLink}
                    copiedLink={props.copiedLink}
                    leaveRoom={props.leaveRoom}
                />
            ),
        };
    }
    if (props.screen === "arena" && props.room && props.ownPlayer) {
        return {
            loadingLabel: "시험지 준비 중",
            node: (
                <ArenaScreen
                    room={props.room}
                    ownPlayer={props.ownPlayer}
                    onLeave={props.leaveRoom}
                />
            ),
        };
    }
    if (props.screen === "rankings" && props.room) {
        return {
            loadingLabel: "순위표 준비 중",
            node: (
                <RankingsScreen
                    room={props.room}
                    ownPlayer={props.ownPlayer}
                    onBack={props.leaveRoom}
                />
            ),
        };
    }
    if (props.screen === "results" && props.room) {
        return {
            loadingLabel: "성적표 준비 중",
            node: (
                <ResultsScreen
                    room={props.room}
                    ownPlayer={props.ownPlayer}
                    onLeave={props.leaveRoom}
                />
            ),
        };
    }
    return null;
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
