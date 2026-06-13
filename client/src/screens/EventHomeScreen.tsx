import { DoorOpen, Eye, LogIn, Ticket, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { CampaignUserPublic } from "../../../shared/campaign";
import type { GymEventSummary } from "../../../shared/game";

type PendingEventAction = { eventId: string; action: "register" | "spectate" } | null;
type EventDisplay = GymEventSummary & {
    startLabel: string;
    statusLabel: string;
    durationLabel: string;
};
type EventAccess = {
    canRegister: boolean;
    canSpectate: boolean;
    hint: string;
};
type EntrantState = {
    hasReferralVerification: boolean;
    isLoggedIn: boolean;
    hasNickname: boolean;
};

const formatEventStart = (startsAt: string | null) => {
    if (!startsAt) return "상시 공개";
    return new Date(startsAt).toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const getEntrantStatus = (
    hasReferralVerification: boolean,
    entryReady: boolean,
    hasOpenEvent: boolean,
) => {
    if (entryReady) return "추천 인증 완료";
    if (!hasReferralVerification) return hasOpenEvent ? "공개 관전 가능" : "인증 전";
    return hasOpenEvent ? "공개 관전 가능" : "입장 전";
};

const getLoginPrompt = (
    campaignUser: CampaignUserPublic | null,
    hasReferralVerification: boolean,
) => {
    if (campaignUser) return `${campaignUser.school.name} 인증 계정`;
    if (hasReferralVerification) return "인증 후 발급된 계정으로 로그인하세요.";
    return "추천 링크에서 위치 인증을 먼저 완료하세요.";
};

const isLoginDisabled = ({
    hasReferralVerification,
    accountId,
    password,
    campaignUser,
}: {
    hasReferralVerification: boolean;
    accountId: string;
    password: string;
    campaignUser: CampaignUserPublic | null;
}) => !hasReferralVerification || !accountId.trim() || password.length < 8 || Boolean(campaignUser);

export function EventHomeScreen({
    events,
    accountId,
    setAccountId,
    campaignUser,
    hasReferralVerification,
    loginCampaignAccount,
    nickname,
    setNickname,
    inviteMode,
    inviteRoomCode,
    joinInviteRoom,
    joiningInvite,
    exitInviteMode,
    registerForEvent,
    spectateEvent,
    pendingEventAction,
    error,
}: {
    events: GymEventSummary[];
    accountId: string;
    setAccountId: (accountId: string) => void;
    campaignUser: CampaignUserPublic | null;
    hasReferralVerification: boolean;
    loginCampaignAccount: (username: string, password: string) => Promise<void>;
    nickname: string;
    setNickname: (nickname: string) => void;
    inviteMode: boolean;
    inviteRoomCode: string;
    joinInviteRoom: () => Promise<void>;
    joiningInvite: boolean;
    exitInviteMode: () => void;
    registerForEvent: (eventId: string) => Promise<void>;
    spectateEvent: (eventId: string) => Promise<void>;
    pendingEventAction: PendingEventAction;
    error: string;
}) {
    const [password, setPassword] = useState("");
    const displayEvents = useMemo<EventDisplay[]>(
        () =>
            events.map((event) => ({
                ...event,
                startLabel: formatEventStart(event.startsAt),
                statusLabel: event.status === "upcoming" ? "예정" : "공개",
                durationLabel: `${Math.round(event.timeLimitSec / 60)}분`,
            })),
        [events],
    );
    const entrantState = {
        hasReferralVerification,
        isLoggedIn: Boolean(campaignUser),
        hasNickname: Boolean(nickname.trim()),
    };
    const entryReady =
        entrantState.hasReferralVerification && entrantState.isLoggedIn && entrantState.hasNickname;
    const hasOpenEvent = displayEvents.some((event) => event.status === "open");
    const entrantStatus = getEntrantStatus(hasReferralVerification, entryReady, hasOpenEvent);
    const loginPrompt = getLoginPrompt(campaignUser, hasReferralVerification);
    const loginDisabled = isLoginDisabled({
        hasReferralVerification,
        accountId,
        password,
        campaignUser,
    });
    const nextEvent = displayEvents[0];

    if (inviteMode) {
        return (
            <main className="gym-layout gym-invite-layout">
                <section className="gym-exam-cover gym-invite-ticket">
                    <CoverHead marker="초대 시험실" page="1" />
                    <div className="gym-cover-title">
                        <span>제 2 교시</span>
                        <em>2026학년도 KICE ARENA 문제지</em>
                        <h1>수학 영역</h1>
                        <strong>{inviteRoomCode}</strong>
                    </div>
                    <div className="gym-omr-block" aria-label="초대 시험실 입장 정보">
                        <label className="gym-omr-field">
                            <span>성명</span>
                            <input
                                value={nickname}
                                onChange={(event) => setNickname(event.target.value)}
                                maxLength={6}
                                placeholder="응시 이름"
                            />
                        </label>
                        <div className="gym-ticket-actions">
                            <button
                                type="button"
                                className="gym-primary-action"
                                onClick={() => void joinInviteRoom()}
                                disabled={!nickname.trim() || joiningInvite}
                            >
                                <LogIn size={18} />
                                {joiningInvite ? "입장 중" : "시험실 입장"}
                            </button>
                            <button
                                type="button"
                                className="gym-secondary-action"
                                onClick={exitInviteMode}
                            >
                                <DoorOpen size={18} />
                                나가기
                            </button>
                        </div>
                    </div>
                    {error && <p className="gym-error error-text">{error}</p>}
                </section>
            </main>
        );
    }

    return (
        <main className="gym-layout">
            <section className="gym-exam-cover">
                <CoverHead marker="모의평가 대회" page="1" />
                <div className="gym-cover-title">
                    <span>제 2 교시</span>
                    <em>2026학년도 KICE ARENA 문제지</em>
                    <h1>수학 영역</h1>
                    <strong>{nextEvent?.statusLabel ?? "대기"}</strong>
                </div>

                <section className="gym-event-list" aria-label="예정 대회">
                    <div className="gym-section-label">
                        <span>시험 일정</span>
                        <strong>{displayEvents.length}건</strong>
                    </div>
                    {displayEvents.length === 0 ? (
                        <div className="gym-empty">현재 공개된 대회 일정이 없습니다.</div>
                    ) : (
                        displayEvents.map((event, index) => (
                            <EventRow
                                key={event.id}
                                event={event}
                                featured={index === 0}
                                entrantState={entrantState}
                                registerForEvent={registerForEvent}
                                spectateEvent={spectateEvent}
                                pendingEventAction={pendingEventAction}
                            />
                        ))
                    )}
                </section>
                <section className="gym-omr-block" aria-label="응시자 정보">
                    <div className="gym-omr-heading">
                        <Ticket size={17} />
                        <span>입장 정보</span>
                        <strong>{entrantStatus}</strong>
                    </div>
                    <div className="gym-omr-grid">
                        <label className="gym-omr-field">
                            <span>계정</span>
                            <input
                                value={accountId}
                                onChange={(event) =>
                                    setAccountId(event.target.value.trim().toLowerCase())
                                }
                                placeholder="계정"
                            />
                        </label>
                        <label className="gym-omr-field">
                            <span>비밀번호</span>
                            <input
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder={campaignUser ? "로그인 완료" : "계정 비밀번호"}
                                type="password"
                            />
                        </label>
                        <label className="gym-omr-field">
                            <span>성명</span>
                            <input
                                value={nickname}
                                onChange={(event) => setNickname(event.target.value)}
                                maxLength={6}
                                placeholder="응시 이름"
                            />
                        </label>
                    </div>
                    <div className="gym-login-row">
                        <span>{loginPrompt}</span>
                        <button
                            type="button"
                            className="gym-secondary-action"
                            disabled={loginDisabled}
                            onClick={() => void loginCampaignAccount(accountId, password)}
                        >
                            <LogIn size={18} />
                            {campaignUser ? "로그인 완료" : "로그인"}
                        </button>
                    </div>
                </section>
                {error && <p className="gym-error error-text">{error}</p>}
            </section>
        </main>
    );
}

function CoverHead({ marker, page }: { marker: string; page: string }) {
    return (
        <div className="gym-cover-head">
            <span>{marker}</span>
            <strong>{page}</strong>
        </div>
    );
}

function getEventAccess({
    event,
    entrantState,
}: {
    event: EventDisplay;
    entrantState: EntrantState;
}): EventAccess {
    if (event.status !== "open") {
        return {
            canRegister: false,
            canSpectate: false,
            hint: "공개 시간이 되면 참가와 관전이 열립니다.",
        };
    }
    if (!entrantState.hasReferralVerification) {
        return {
            canRegister: false,
            canSpectate: true,
            hint: "추천 위치 인증 전에는 관전만 가능합니다.",
        };
    }
    if (!entrantState.isLoggedIn) {
        return {
            canRegister: false,
            canSpectate: true,
            hint: "추천 인증 계정으로 로그인한 사용자만 참가할 수 있습니다.",
        };
    }
    if (!entrantState.hasNickname) {
        return {
            canRegister: false,
            canSpectate: true,
            hint: "성명을 입력하면 참가할 수 있습니다.",
        };
    }
    return {
        canRegister: true,
        canSpectate: true,
        hint: "인증된 학교 정보로 참가합니다.",
    };
}

function EventRow({
    event,
    featured,
    entrantState,
    registerForEvent,
    spectateEvent,
    pendingEventAction,
}: {
    event: EventDisplay;
    featured: boolean;
    entrantState: EntrantState;
    registerForEvent: (eventId: string) => Promise<void>;
    spectateEvent: (eventId: string) => Promise<void>;
    pendingEventAction: PendingEventAction;
}) {
    const pendingThisEvent = pendingEventAction?.eventId === event.id;
    const access = getEventAccess({ event, entrantState });
    const actionLocked = Boolean(pendingEventAction);
    const registerActionClass = access.canRegister ? "gym-primary-action" : "gym-secondary-action";
    const spectatorActionClass =
        access.canSpectate && !access.canRegister ? "gym-primary-action" : "gym-secondary-action";

    return (
        <article
            className={`gym-event-row ${featured ? "featured" : ""} ${
                access.canSpectate ? "is-open" : "is-upcoming"
            }`}
        >
            <div className="gym-event-main">
                <span className={`gym-event-status ${event.status}`}>{event.statusLabel}</span>
                <h2>{event.title}</h2>
                <p>{event.subtitle}</p>
                <dl>
                    <div>
                        <dt>시작</dt>
                        <dd>{event.startLabel}</dd>
                    </div>
                    <div>
                        <dt>시간</dt>
                        <dd>{event.durationLabel}</dd>
                    </div>
                    <div>
                        <dt>문항</dt>
                        <dd>{event.problemCount}문항</dd>
                    </div>
                </dl>
            </div>
            <div className="gym-event-actions">
                <button
                    type="button"
                    className={registerActionClass}
                    onClick={() => void registerForEvent(event.id)}
                    disabled={!access.canRegister || actionLocked}
                >
                    <UserRound size={18} />
                    {pendingThisEvent && pendingEventAction?.action === "register"
                        ? "응시 중"
                        : "참가 등록"}
                </button>
                <button
                    type="button"
                    className={spectatorActionClass}
                    onClick={() => void spectateEvent(event.id)}
                    disabled={!access.canSpectate || actionLocked}
                >
                    <Eye size={18} />
                    {pendingThisEvent && pendingEventAction?.action === "spectate"
                        ? "관전 입장 중"
                        : "관전하기"}
                </button>
                <p className="gym-action-hint">{access.hint}</p>
            </div>
        </article>
    );
}
