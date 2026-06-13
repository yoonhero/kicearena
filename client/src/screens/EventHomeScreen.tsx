import { DoorOpen, Eye, LogIn, Ticket, UserRound } from "lucide-react";
import { useMemo } from "react";
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
    hasAccount: boolean;
    hasInvite: boolean;
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

export function EventHomeScreen({
    events,
    accountId,
    setAccountId,
    registrationInviteCode,
    setRegistrationInviteCode,
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
    registrationInviteCode: string;
    setRegistrationInviteCode: (inviteCode: string) => void;
    nickname: string;
    setNickname: (nickname: string) => void;
    inviteMode: boolean;
    inviteRoomCode: string;
    joinInviteRoom: () => Promise<void>;
    joiningInvite: boolean;
    exitInviteMode: () => void;
    registerForEvent: (eventId: string, inviteCode: string) => Promise<void>;
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
        hasAccount: Boolean(accountId.trim()),
        hasInvite: Boolean(registrationInviteCode.trim()),
        hasNickname: Boolean(nickname.trim()),
    };
    const entryReady =
        entrantState.hasAccount && entrantState.hasInvite && entrantState.hasNickname;
    const hasOpenEvent = displayEvents.some((event) => event.status === "open");
    const entrantStatus = entryReady ? "응시 가능" : hasOpenEvent ? "관전 가능" : "입장 전";
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
                        displayEvents.map((event) => (
                            <EventRow
                                key={event.id}
                                event={event}
                                entrantState={entrantState}
                                inviteCode={registrationInviteCode}
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
                        <span>응시자 정보</span>
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
                                placeholder="초대 계정"
                            />
                        </label>
                        <label className="gym-omr-field">
                            <span>초대 코드</span>
                            <input
                                value={registrationInviteCode}
                                onChange={(event) =>
                                    setRegistrationInviteCode(event.target.value.trim())
                                }
                                placeholder="초대 코드"
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
    if (!entrantState.hasAccount || !entrantState.hasInvite) {
        return {
            canRegister: false,
            canSpectate: true,
            hint: "초대 정보가 없으면 관전만 가능합니다.",
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
        hint: "저장된 초대 정보로 참가합니다.",
    };
}

function EventRow({
    event,
    entrantState,
    inviteCode,
    registerForEvent,
    spectateEvent,
    pendingEventAction,
}: {
    event: EventDisplay;
    entrantState: EntrantState;
    inviteCode: string;
    registerForEvent: (eventId: string, inviteCode: string) => Promise<void>;
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
        <article className={`gym-event-row ${access.canSpectate ? "is-open" : "is-upcoming"}`}>
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
                    onClick={() => void registerForEvent(event.id, inviteCode)}
                    disabled={!access.canRegister || actionLocked}
                >
                    <UserRound size={18} />
                    {pendingThisEvent && pendingEventAction?.action === "register"
                        ? "응시 중"
                        : "시험 응시"}
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
                        : "관전 입장"}
                </button>
                <p className="gym-action-hint">{access.hint}</p>
            </div>
        </article>
    );
}
