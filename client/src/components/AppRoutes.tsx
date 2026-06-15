import type { CampaignUserPublic, ReferralLocationVerification } from "../../../shared/campaign";
import type { ExamPublic, PlayerPublic, RoomPublic, GymEventSummary } from "../../../shared/game";
import { ArenaScreen } from "../screens/ArenaScreen";
import { EventHomeScreen } from "../screens/EventHomeScreen";
import { LobbyScreen } from "../screens/LobbyScreen";
import { ResultsScreen } from "../screens/ResultsScreen";
import { SpectatorProblemScreen } from "../screens/SpectatorProblemScreen";
import { ReferralSchoolGate } from "./ReferralSchoolGate";

export type AppScreen = "home" | "lobby" | "arena" | "results" | "spectator";

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
    needsReferralGate: boolean;
    referralCode: string;
    referralVerification: ReferralLocationVerification | null;
    completeReferralGate: (verification: ReferralLocationVerification) => void;
    exitReferralGate: () => void;
    events: GymEventSummary[];
    campaignUser: CampaignUserPublic | null;
    hasReferralVerification: boolean;
    nickname: string;
    setNickname: (nickname: string) => void;
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
                <EventHomeScreen
                    events={props.events}
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
                />
            )}

            {props.screen === "spectator" && props.spectatorExam && (
                <SpectatorProblemScreen exam={props.spectatorExam} onBack={props.exitSpectator} />
            )}

            {props.screen === "lobby" && props.room && (
                <LobbyScreen
                    room={props.room}
                    ownPlayer={props.ownPlayer}
                    copyCode={props.copyCode}
                    copied={props.copied}
                    copyInviteLink={props.copyInviteLink}
                    copiedLink={props.copiedLink}
                    leaveRoom={props.leaveRoom}
                />
            )}

            {props.screen === "arena" && props.room && props.ownPlayer && (
                <ArenaScreen
                    room={props.room}
                    ownPlayer={props.ownPlayer}
                    onLeave={props.leaveRoom}
                />
            )}

            {props.screen === "results" && props.room && (
                <ResultsScreen
                    room={props.room}
                    ownPlayer={props.ownPlayer}
                    onLeave={props.leaveRoom}
                />
            )}
        </div>
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
