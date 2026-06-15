import { DoorOpen, Eye, LogIn, UserRound } from "lucide-react";
import { useMemo } from "react";
import {
    DEFAULT_SNU_REFERRAL_CODE,
    type CampaignUserPublic,
    type ReferralLocationVerification,
} from "../../../shared/campaign";
import type { GymEventSummary } from "../../../shared/game";
import { SavedAdmissionTicket } from "./SavedAdmissionTicket";

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
    isLoggedIn: boolean,
    hasOpenEvent: boolean,
) => {
    if (hasReferralVerification && isLoggedIn) return "응시표 저장 완료";
    if (!hasReferralVerification) return hasOpenEvent ? "공개 관전 가능" : "인증 전";
    return "등록 정보 없음";
};

export function EventHomeScreen({
    events,
    campaignUser,
    referralVerification,
    hasReferralVerification,
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
    campaignUser: CampaignUserPublic | null;
    referralVerification: ReferralLocationVerification | null;
    hasReferralVerification: boolean;
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
    };
    const hasOpenEvent = displayEvents.some((event) => event.status === "open");
    const entrantStatus = getEntrantStatus(
        hasReferralVerification,
        entrantState.isLoggedIn,
        hasOpenEvent,
    );
    const nextEvent = displayEvents[0];
    const hasSavedTicket = Boolean(campaignUser || referralVerification);

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

                {hasSavedTicket && (
                    <SavedAdmissionTicket
                        campaignUser={campaignUser}
                        entrantStatus={entrantStatus}
                        referralVerification={referralVerification}
                    />
                )}

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
                {!hasSavedTicket && <AdmissionIssueSlip />}
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

function AdmissionIssueSlip() {
    const href = `/?c=${DEFAULT_SNU_REFERRAL_CODE}`;
    return (
        <section className="gym-admission-slip" aria-label="응시표 발급 안내">
            <div>
                <span>응시표 없음</span>
                <strong>추천 링크에서 위치 인증 후 자동 발급됩니다.</strong>
            </div>
            <a className="gym-secondary-action" href={href}>
                서울대 인증 링크
            </a>
        </section>
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
            hint: "응시표가 없으면 관전만 가능합니다.",
        };
    }
    if (!entrantState.isLoggedIn) {
        return {
            canRegister: false,
            canSpectate: true,
            hint: "추천 링크에서 발급된 응시표로 참가합니다.",
        };
    }
    return {
        canRegister: true,
        canSpectate: true,
        hint: "저장된 추천 등록 정보로 참가합니다.",
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
                {access.canRegister && (
                    <button
                        type="button"
                        className="gym-primary-action"
                        onClick={() => void registerForEvent(event.id)}
                        disabled={actionLocked}
                    >
                        <UserRound size={18} />
                        {pendingThisEvent && pendingEventAction?.action === "register"
                            ? "응시 중"
                            : "대회 참가"}
                    </button>
                )}
                {access.canSpectate && (
                    <button
                        type="button"
                        className={
                            access.canRegister ? "gym-secondary-action" : "gym-primary-action"
                        }
                        onClick={() => void spectateEvent(event.id)}
                        disabled={actionLocked}
                    >
                        <Eye size={18} />
                        {pendingThisEvent && pendingEventAction?.action === "spectate"
                            ? "관전 입장 중"
                            : "관전 입장"}
                    </button>
                )}
                {!access.canSpectate && (
                    <button type="button" className="gym-secondary-action" disabled>
                        공개 전
                    </button>
                )}
                <p className="gym-action-hint">{access.hint}</p>
            </div>
        </article>
    );
}
