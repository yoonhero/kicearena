import { DoorOpen, Eye, LogIn, Ticket, UserRound } from "lucide-react";
import { useMemo } from "react";
import type { GymEventSummary } from "../../../shared/game";

type PendingEventAction = { eventId: string; action: "register" | "spectate" } | null;
type EventDisplay = GymEventSummary & {
    startLabel: string;
    statusLabel: string;
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
            events.map((event) => {
                const startsAt = event.startsAt ? new Date(event.startsAt) : null;
                return {
                    ...event,
                    startLabel: startsAt
                        ? startsAt.toLocaleString("ko-KR", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                          })
                        : "상시 오픈",
                    statusLabel: event.status === "upcoming" ? "예정" : "오픈",
                };
            }),
        [events],
    );

    if (inviteMode) {
        return (
            <main className="gym-layout">
                <section className="gym-entry-panel">
                    <div className="gym-kicker">
                        <Ticket size={16} />
                        초대 시험실
                    </div>
                    <h1>{inviteRoomCode}</h1>
                    <label className="gym-field">
                        <span>응시 이름</span>
                        <input
                            value={nickname}
                            onChange={(event) => setNickname(event.target.value)}
                            maxLength={6}
                        />
                    </label>
                    <div className="gym-actions">
                        <button
                            type="button"
                            onClick={() => void joinInviteRoom()}
                            disabled={joiningInvite}
                        >
                            <LogIn size={18} />
                            {joiningInvite ? "입장 중" : "시험실 입장"}
                        </button>
                        <button type="button" className="ghost" onClick={exitInviteMode}>
                            <DoorOpen size={18} />
                            나가기
                        </button>
                    </div>
                    {error && <p className="error-text">{error}</p>}
                </section>
            </main>
        );
    }

    return (
        <main className="gym-layout">
            <section className="gym-entry-panel">
                <div className="gym-kicker">
                    <Ticket size={16} />
                    초대 시험
                </div>
                <h1>시험 입장 정보</h1>
                <div className="gym-account-row">
                    <label className="gym-field">
                        <span>초대 계정</span>
                        <input
                            value={accountId}
                            onChange={(event) =>
                                setAccountId(event.target.value.trim().toLowerCase())
                            }
                            placeholder="invited-user"
                        />
                    </label>
                    <label className="gym-field">
                        <span>초대 코드</span>
                        <input
                            value={registrationInviteCode}
                            onChange={(event) =>
                                setRegistrationInviteCode(event.target.value.trim())
                            }
                            placeholder="invite-code"
                        />
                    </label>
                    <label className="gym-field">
                        <span>응시 이름</span>
                        <input
                            value={nickname}
                            onChange={(event) => setNickname(event.target.value)}
                            maxLength={6}
                        />
                    </label>
                </div>
            </section>

            <section className="gym-event-list" aria-label="운영자가 연 이벤트">
                {displayEvents.length === 0 ? (
                    <div className="gym-empty">현재 운영자가 연 이벤트가 없습니다.</div>
                ) : (
                    displayEvents.map((event) => (
                        <EventRow
                            key={event.id}
                            event={event}
                            accountId={accountId}
                            inviteCode={registrationInviteCode}
                            registerForEvent={registerForEvent}
                            spectateEvent={spectateEvent}
                            pendingEventAction={pendingEventAction}
                        />
                    ))
                )}
            </section>
            {error && <p className="gym-error error-text">{error}</p>}
        </main>
    );
}

function EventRow({
    event,
    accountId,
    inviteCode,
    registerForEvent,
    spectateEvent,
    pendingEventAction,
}: {
    event: EventDisplay;
    accountId: string;
    inviteCode: string;
    registerForEvent: (eventId: string, inviteCode: string) => Promise<void>;
    spectateEvent: (eventId: string) => Promise<void>;
    pendingEventAction: PendingEventAction;
}) {
    const pendingThisEvent = pendingEventAction?.eventId === event.id;
    const registerDisabled =
        !accountId || !inviteCode || event.status !== "open" || Boolean(pendingEventAction);
    const disabledReason = !accountId
        ? "초대 계정을 입력하면 시험에 입장할 수 있습니다."
        : !inviteCode
          ? "초대 코드를 입력하면 시험에 입장할 수 있습니다."
          : event.status !== "open"
            ? "아직 입장이 열리지 않았습니다."
            : pendingEventAction
              ? "처리 중입니다."
              : undefined;

    return (
        <article className="gym-event-row">
            <div>
                <span className={`gym-event-status ${event.status}`}>{event.statusLabel}</span>
                <h2>{event.title}</h2>
                <p>{event.subtitle}</p>
                <dl>
                    <div>
                        <dt>시작</dt>
                        <dd>{event.startLabel}</dd>
                    </div>
                    <div>
                        <dt>문항</dt>
                        <dd>{event.problemCount}개</dd>
                    </div>
                    <div>
                        <dt>등록</dt>
                        <dd>초대 전용</dd>
                    </div>
                </dl>
            </div>
            <div className="gym-event-actions">
                <button
                    type="button"
                    className="primary"
                    onClick={() => void registerForEvent(event.id, inviteCode)}
                    disabled={registerDisabled}
                >
                    <UserRound size={18} />
                    {pendingThisEvent && pendingEventAction?.action === "register"
                        ? "입장 중"
                        : "초대 코드로 입장"}
                </button>
                <button
                    type="button"
                    className="secondary"
                    onClick={() => void spectateEvent(event.id)}
                    disabled={Boolean(pendingEventAction)}
                >
                    <Eye size={18} />
                    {pendingThisEvent && pendingEventAction?.action === "spectate"
                        ? "불러오는 중"
                        : "문제 미리보기"}
                </button>
                {disabledReason && <p className="gym-action-hint">{disabledReason}</p>}
            </div>
        </article>
    );
}
