import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import {
  BarChart3,
  Copy,
  Crown,
  EyeOff,
  FileText,
  Flag,
  Gamepad2,
  LogIn,
  LogOut,
  Play,
  Send,
  ShieldAlert,
  Trophy,
  Users,
  Zap
} from "lucide-react";
import {
  ITEM_DEFINITIONS,
  type ExamSummary,
  type ItemId,
  type PlayerPublic,
  type ProblemPublic,
  type RoomPublic,
  type ServerResponse,
  type StandingPublic
} from "../../shared/game";
import "./styles.css";

const socket: Socket = io();
const ROOM_SESSION_KEY = "kice-arena:last-session";

type Screen = "home" | "lobby" | "arena" | "results";
type SavedRoomSession = {
  code: string;
  playerId: string;
};
type ReportMetric = {
  standardScore: number;
  percentile: number;
  grade: number;
};

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60).toString().padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const formatElapsed = (startedAt: number | null, timestamp: number | null) => {
  if (!startedAt || !timestamp) return "--:--";
  return formatTime(Math.max(0, Math.floor((timestamp - startedAt) / 1000)));
};

const formatReportDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}. ${month}. ${day}.`;
};

const callback =
  <T,>(resolve: (value: ServerResponse<T>) => void) =>
  (response: ServerResponse<T>) =>
    resolve(response);

const emitWithAck = <T,>(event: string, payload?: unknown) =>
  new Promise<ServerResponse<T>>((resolve) => {
    if (payload === undefined) socket.emit(event, callback(resolve));
    else socket.emit(event, payload, callback(resolve));
  });

function useCountdown(room: RoomPublic | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  if (!room?.endsAt) return room?.timeLimitSec ?? 0;
  return Math.max(0, Math.ceil((room.endsAt - now) / 1000));
}

function App() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState(100);
  const [freezeBeforeMin, setFreezeBeforeMin] = useState(10);
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const rejoinAttempted = useRef(false);

  useEffect(() => {
    fetch("/api/exams")
      .then((res) => res.json())
      .then((data: ExamSummary[]) => {
        setExams(data);
        const firstExam = data[0];
        setSelectedExamId(firstExam?.id ?? "");
        setTimeLimitMin(Math.max(1, Math.round((firstExam?.timeLimitSec ?? 100 * 60) / 60)));
      })
      .catch(() => setError("서버의 시험 목록을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    socket.on("room:update", setRoom);
    socket.on("player:you", setOwnPlayerId);
    const tryRejoin = async () => {
      if (rejoinAttempted.current) return;
      const raw = window.localStorage.getItem(ROOM_SESSION_KEY);
      if (!raw) return;
      rejoinAttempted.current = true;
      let saved: SavedRoomSession | null = null;
      try {
        saved = JSON.parse(raw) as SavedRoomSession;
      } catch {
        window.localStorage.removeItem(ROOM_SESSION_KEY);
        rejoinAttempted.current = false;
      }
      if (!saved?.code || !saved.playerId) {
        rejoinAttempted.current = false;
        return;
      }
      const response = await emitWithAck<RoomPublic>("room:rejoin", saved);
      if (!response.ok || !response.data) {
        window.localStorage.removeItem(ROOM_SESSION_KEY);
        rejoinAttempted.current = false;
        return;
      }
      setRoom(response.data);
      setRoomCode(response.data.code);
    };
    socket.on("connect", tryRejoin);
    if (socket.connected) void tryRejoin();
    return () => {
      socket.off("room:update", setRoom);
      socket.off("player:you", setOwnPlayerId);
      socket.off("connect", tryRejoin);
    };
  }, []);

  useEffect(() => {
    if (!room?.code || !ownPlayerId) return;
    window.localStorage.setItem(ROOM_SESSION_KEY, JSON.stringify({ code: room.code, playerId: ownPlayerId } satisfies SavedRoomSession));
  }, [room?.code, ownPlayerId]);

  const ownPlayer = useMemo(() => {
    if (!room) return null;
    return room.players.find((player) => player.id === ownPlayerId) ?? null;
  }, [room, ownPlayerId]);

  const screen: Screen = !room ? "home" : room.status === "lobby" ? "lobby" : room.status === "finished" ? "results" : "arena";

  const leaveRoom = async () => {
    await emitWithAck("room:leave", {});
    window.localStorage.removeItem(ROOM_SESSION_KEY);
    setRoom(null);
    setOwnPlayerId("");
    setRoomCode("");
    rejoinAttempted.current = false;
  };

  const createRoom = async () => {
    setError("");
    const safeTimeLimitMin = Number.isFinite(timeLimitMin) ? Math.max(1, Math.round(timeLimitMin)) : 100;
    const safeFreezeBeforeMin = Number.isFinite(freezeBeforeMin) ? Math.max(0, Math.min(Math.round(freezeBeforeMin), safeTimeLimitMin)) : 10;
    const response = await emitWithAck<RoomPublic>("room:create", {
      examId: selectedExamId,
      nickname,
      timeLimitSec: safeTimeLimitMin * 60,
      freezeBeforeSec: safeFreezeBeforeMin * 60,
      itemEnabled: true
    });
    if (!response.ok || !response.data) {
      setError(response.error ?? "방 생성 실패");
      return;
    }
    setRoom(response.data);
    setRoomCode(response.data.code);
  };

  const joinRoom = async () => {
    setError("");
    const response = await emitWithAck<RoomPublic>("room:join", {
      code: roomCode,
      nickname
    });
    if (!response.ok || !response.data) {
      setError(response.error ?? "입장 실패");
      return;
    }
    setRoom(response.data);
  };

  const copyCode = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="app-shell">
      {screen === "home" && (
        <HomeScreen
          exams={exams}
          selectedExamId={selectedExamId}
          setSelectedExamId={(id) => {
            setSelectedExamId(id);
            const exam = exams.find((item) => item.id === id);
            if (exam) setTimeLimitMin(Math.max(1, Math.round(exam.timeLimitSec / 60)));
          }}
          timeLimitMin={timeLimitMin}
          setTimeLimitMin={setTimeLimitMin}
          freezeBeforeMin={freezeBeforeMin}
          setFreezeBeforeMin={setFreezeBeforeMin}
          nickname={nickname}
          setNickname={setNickname}
          roomCode={roomCode}
          setRoomCode={setRoomCode}
          createRoom={createRoom}
          joinRoom={joinRoom}
          error={error}
        />
      )}

      {screen === "lobby" && room && (
        <LobbyScreen room={room} ownPlayer={ownPlayer} copyCode={copyCode} copied={copied} />
      )}

      {screen === "arena" && room && ownPlayer && <ArenaScreen room={room} ownPlayer={ownPlayer} />}

      {screen === "results" && room && <ResultsScreen room={room} onLeave={leaveRoom} />}
    </div>
  );
}

function HomeScreen(props: {
  exams: ExamSummary[];
  selectedExamId: string;
  setSelectedExamId: (id: string) => void;
  timeLimitMin: number;
  setTimeLimitMin: (value: number) => void;
  freezeBeforeMin: number;
  setFreezeBeforeMin: (value: number) => void;
  nickname: string;
  setNickname: (value: string) => void;
  roomCode: string;
  setRoomCode: (value: string) => void;
  createRoom: () => void;
  joinRoom: () => void;
  error: string;
}) {
  const nameSlots = 4;
  const nameSyllables = [
    "김",
    "이",
    "박",
    "정",
    "민",
    "준",
    "서",
    "연",
    "현",
    "우",
    "구",
    "동",
    "건"
  ];
  const setNicknameSlot = (slot: number, syllable: string) => {
    const chars = Array.from(props.nickname).slice(0, nameSlots);
    while (chars.length < nameSlots) chars.push("");
    chars[slot] = syllable;
    props.setNickname(chars.join(""));
  };

  return (
    <main className="home-layout">
      <section className="exam-sheet intro-sheet omr-entry-sheet">
        <div className="exam-head cover-head">
          <span>{formatReportDate()} 시행 모의평가</span>
          <strong>1</strong>
        </div>
        <div className="subject-badge">제 2 교시</div>
        <div className="intro-title kice-cover">
          <h1>수학 영역</h1>
          <strong>소수형</strong>
        </div>
        <div className="omr-entry">
          <div className="identity-card">
            <div className="omr-name-maker" aria-label="성명 OMR 입력">
              <div className="omr-maker-head">
                <strong>성명</strong>
                <span>(빈칸없이 왼쪽부터 기재)</span>
              </div>
              <div className="omr-maker-cells" aria-hidden="true">
                {Array.from({ length: nameSlots }, (_, index) => (
                  <span key={index}>{props.nickname[index] ?? ""}</span>
                ))}
              </div>
              {nameSyllables.map((syllable) => (
                <div className="omr-syllable-row" key={syllable}>
                  {Array.from({ length: nameSlots }, (_, slot) => (
                    <button
                      key={`${syllable}-${slot}`}
                      type="button"
                      className={props.nickname[slot] === syllable ? "marked" : ""}
                      onClick={() => setNicknameSlot(slot, syllable)}
                      aria-label={`${slot + 1}번째 글자 ${syllable}`}
                    >
                      <span>{syllable}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="entry-flow-stack">
            <div className="entry-action-panel creator-panel">
              <div className="entry-panel-title">
                <span>방 생성</span>
                <strong>시험지를 고른 뒤 시작</strong>
              </div>
              <div className="omr-field exam-field">
                <span>시험지</span>
                <select value={props.selectedExamId} onChange={(event) => props.setSelectedExamId(event.target.value)}>
                  {props.exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title} · {exam.problemCount}문항
                    </option>
                  ))}
                </select>
              </div>
              <div className="room-option-grid">
                <label className="omr-field">
                  <span>시험 시간(분)</span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={props.timeLimitMin}
                    onChange={(event) => props.setTimeLimitMin(Number.isFinite(event.currentTarget.valueAsNumber) ? event.currentTarget.valueAsNumber : 1)}
                  />
                </label>
                <label className="omr-field">
                  <span>순위 비공개 시작(종료 전 분)</span>
                  <input
                    type="number"
                    min={0}
                    max={props.timeLimitMin}
                    value={props.freezeBeforeMin}
                    onChange={(event) => props.setFreezeBeforeMin(Number.isFinite(event.currentTarget.valueAsNumber) ? event.currentTarget.valueAsNumber : 0)}
                  />
                </label>
              </div>
              <button className="omr-action host-action" onClick={props.createRoom}>
                <Gamepad2 size={18} />
                방 열기
              </button>
            </div>
            <div className="entry-action-panel join-panel">
              <div className="entry-panel-title">
                <span>기존 방 입장</span>
                <strong>방 코드만 입력</strong>
              </div>
              <div className="omr-field code-field">
                <span>방 코드</span>
                <input value={props.roomCode} onChange={(event) => props.setRoomCode(event.target.value.toUpperCase())} placeholder="ABCDE" />
              </div>
              <button className="omr-action join-action" onClick={props.joinRoom}>
                <LogIn size={18} />
                입장
              </button>
            </div>
          </div>
          {props.error && <p className="error-text">{props.error}</p>}
        </div>
      </section>
    </main>
  );
}

function LobbyScreen({
  room,
  ownPlayer,
  copyCode,
  copied
}: {
  room: RoomPublic;
  ownPlayer: PlayerPublic | null;
  copyCode: () => void;
  copied: boolean;
}) {
  const isHost = ownPlayer?.id === room.hostId;
  const allReady = room.players.every((player) => player.ready);
  return (
    <main className="lobby-layout">
      <section className="exam-sheet lobby-sheet">
        <div className="exam-head">
          <span>수험번호 확인</span>
          <strong>{room.exam.title}</strong>
        </div>
        <div className="room-code">
          <span>방 코드</span>
          <button onClick={copyCode} title="방 코드 복사">
            {room.code}
            <Copy size={18} />
          </button>
          {copied && <em>복사됨</em>}
        </div>
        <div className="problem-preview-grid">
          {room.exam.problems.map((problem) => (
            <span key={problem.id}>
              {problem.number}
              <small>난도 {problem.difficulty}</small>
            </span>
          ))}
        </div>
        <div className="lobby-attendance">
          <div className="attendance-head">
            <h2>
              <Users size={20} />
              입실 현황
            </h2>
            <span>{room.players.length}명</span>
          </div>
          <div className="player-list">
            {room.players.map((player) => (
              <div key={player.id} className="player-chip">
                <span>{player.nickname}</span>
                {player.id === room.hostId && <Crown size={15} />}
                <em>{player.ready ? "준비" : "대기"}</em>
              </div>
            ))}
          </div>
          {!isHost && (
            <button className="primary-btn" onClick={() => socket.emit("player:ready", { ready: !ownPlayer?.ready })}>
              <Flag size={18} />
              {ownPlayer?.ready ? "준비 취소" : "준비 완료"}
            </button>
          )}
          {isHost && (
            <button className="primary-btn" disabled={!allReady} onClick={() => socket.emit("room:start")}>
              <Play size={18} />
              타종
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function ArenaScreen({ room, ownPlayer }: { room: RoomPublic; ownPlayer: PlayerPublic }) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [itemNotice, setItemNotice] = useState("");
  const [draggedItem, setDraggedItem] = useState<ItemId | null>(null);
  const [view, setView] = useState<"problem" | "rankings">("problem");
  const timeLeft = useCountdown(room);
  const currentProblem = room.exam.problems.find((problem) => problem.id === ownPlayer.currentProblemId) ?? room.exam.problems[0];
  const hasEffect = (id: string) => ownPlayer.effects.some((effect) => effect.id === id && effect.expiresAt > Date.now());
  const hardLocked = hasEffect("hardFirst");
  const inputLocked = hasEffect("penLock") || hasEffect("slowInput");
  const covered = hasEffect("cover") || hasEffect("blur");
  const solvedCount = ownPlayer.scoreBreakdown.solved;
  const isHost = ownPlayer.id === room.hostId;

  const submit = async (selectedAnswer = answer) => {
    setFeedback("");
    setItemNotice("");
    const response = await emitWithAck<{ correct: boolean; itemAwarded: ItemId | null }>("answer:submit", {
      problemId: currentProblem.id,
      answer: selectedAnswer
    });
    if (!response.ok) {
      setFeedback(response.error ?? "제출 실패");
      return;
    }
    if (response.data?.correct) {
      const awarded = response.data.itemAwarded;
      setFeedback(awarded ? `정답. ${ITEM_DEFINITIONS[awarded].name} 획득.` : "정답. 이번엔 아이템 없음.");
      setItemNotice(awarded ? `${ITEM_DEFINITIONS[awarded].name} 지급` : "");
    } else {
      setFeedback("오답. 연속 오답 조심.");
    }
    setAnswer("");
  };

  const useItem = async (itemId: ItemId, targetPlayerId: string) => {
    const target = room.players.find((player) => player.id === targetPlayerId);
    const response = await emitWithAck("item:use", { itemId, targetPlayerId });
    setDraggedItem(null);
    if (!response.ok) {
      setFeedback(response.error ?? "아이템 사용 실패");
      return;
    }
    setFeedback(`${ITEM_DEFINITIONS[itemId].name} -> ${target?.nickname ?? "대상"}`);
  };

  const endExamEarly = async () => {
    const response = await emitWithAck<RoomPublic>("room:end", {});
    if (!response.ok) {
      setFeedback(response.error ?? "시험 종료 실패");
    }
  };

  if (view === "rankings") {
    return <RankingsScreen room={room} ownPlayer={ownPlayer} onBack={() => setView("problem")} />;
  }

  return (
    <main className="arena-layout">
      <section className="paper-zone">
        <div className="arena-workspace">
          <div className="exam-sheet problem-sheet single-question-sheet">
            <div className="problem-focus-head">
              <div>
                <span>{room.exam.title}</span>
                <strong>{currentProblem.number}번</strong>
              </div>
              <em>난도 {currentProblem.difficulty}</em>
            </div>
            <div className={`problem-image-wrap ${covered ? "covered" : ""}`}>
              <img src={currentProblem.imageUrl} alt={`${currentProblem.sourceNumber ?? currentProblem.number}번 문제`} />
              {covered && <div className="cover-effect">문제 가리기 발동</div>}
              {hasEffect("meme") && (
                <div className="meme-effect">
                  <img src="/exams/meme-slots/placeholder.svg" alt="방해 짤 슬롯" />
                </div>
              )}
            </div>
            <div className={`answer-bar ${currentProblem.answerKind === "choice" ? "choice-answer-bar" : ""}`}>
              {currentProblem.answerKind === "choice" ? (
                <div className="choice-submit-panel" aria-label="5지선다 답안 선택">
                  <span>답안란</span>
                  <div className="choice-buttons">
                    {["1", "2", "3", "4", "5"].map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        className={answer === choice ? "selected" : ""}
                        disabled={inputLocked}
                        onClick={() => {
                          setAnswer(choice);
                          void submit(choice);
                        }}
                        aria-label={`${choice}번 제출`}
                      >
                        <i>{choice}</i>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <label>
                    답안란
                    <input
                      value={answer}
                      disabled={inputLocked}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submit();
                      }}
                      placeholder="숫자"
                    />
                  </label>
                  <button className="primary-btn" disabled={inputLocked} onClick={() => void submit()}>
                    <Send size={18} />
                    답안 제출
                  </button>
                </>
              )}
              {feedback && <span className="feedback">{feedback}</span>}
            </div>
            {itemNotice && <div className="item-toast">{itemNotice}</div>}
            <ProblemNav problems={room.exam.problems} currentProblem={currentProblem} hardLocked={hardLocked} ownPlayer={ownPlayer} room={room} />
          </div>
          <aside className="arena-rail">
            <div className="arena-status">
              <KiceClock timeLeft={timeLeft} totalTime={room.timeLimitSec} />
              <span>
                <Trophy size={16} />
                {ownPlayer.score}점
              </span>
              <span>{solvedCount}/{room.exam.problemCount}문항</span>
              <span>
                <ShieldAlert size={16} />
                오답 {ownPlayer.consecutiveWrong}
              </span>
              {room.scoreboardFrozen && (
                <span className="freeze-chip">
                  <EyeOff size={16} />
                  순위 비공개
                </span>
              )}
              <button className="status-link" onClick={() => setView("rankings")}>
                <BarChart3 size={16} />
                순위표
              </button>
              {isHost && (
                <button className="status-link danger-link" onClick={() => void endExamEarly()}>
                  <ShieldAlert size={16} />
                  조기 종료
                </button>
              )}
            </div>
            <ItemDock
              room={room}
              ownPlayer={ownPlayer}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
              useItem={useItem}
            />
          </aside>
        </div>
      </section>
    </main>
  );
}

function ItemIcon({ itemId, size = 16 }: { itemId: ItemId; size?: number }) {
  if (itemId === "cover") return <EyeOff size={size} />;
  if (itemId === "hardFirst") return <Flag size={size} />;
  if (itemId === "meme") return <FileText size={size} />;
  if (itemId === "penLock") return <ShieldAlert size={size} />;
  return <Zap size={size} />;
}

function KiceClock({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
  const progress = totalTime <= 0 ? 0 : 1 - Math.max(0, Math.min(1, timeLeft / totalTime));
  const minuteRotation = progress * 360;
  const secondRotation = ((totalTime - timeLeft) % 60) * 6;
  return (
    <div className="kice-clock" aria-label={`남은 시간 ${formatTime(timeLeft)}`}>
      <div className="clock-face">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} style={{ "--tick": String(index) } as React.CSSProperties & Record<string, string>} />
        ))}
        <i className="clock-hand minute" style={{ rotate: `${minuteRotation}deg` }} />
        <i className="clock-hand second" style={{ rotate: `${secondRotation}deg` }} />
        <b />
      </div>
      <div className="clock-label">
        <small>한국교육과정평가원</small>
        <strong>{formatTime(timeLeft)}</strong>
      </div>
    </div>
  );
}

function ItemDock({
  room,
  ownPlayer,
  draggedItem,
  setDraggedItem,
  useItem
}: {
  room: RoomPublic;
  ownPlayer: PlayerPublic;
  draggedItem: ItemId | null;
  setDraggedItem: (itemId: ItemId | null) => void;
  useItem: (itemId: ItemId, targetPlayerId: string) => Promise<void>;
}) {
  const targets = [...room.players].sort((a, b) => (a.id === ownPlayer.id ? 1 : b.id === ownPlayer.id ? -1 : a.nickname.localeCompare(b.nickname)));

  const dropItem = (event: React.DragEvent, targetPlayerId: string) => {
    event.preventDefault();
    const itemId = (event.dataTransfer.getData("text/item-id") || draggedItem) as ItemId | null;
    if (!itemId) return;
    void useItem(itemId, targetPlayerId);
  };

  return (
    <section className={`item-dock ${draggedItem ? "dragging" : ""}`}>
      <div className="item-bank" aria-label="보유 아이템">
        <strong>
          <Zap size={16} />
          아이템
        </strong>
        {ownPlayer.inventory.length === 0 ? (
          <span className="empty-inventory">정답 시 확률 지급</span>
        ) : (
          ownPlayer.inventory.map((itemId, index) => {
            const item = ITEM_DEFINITIONS[itemId];
            return (
              <button
                key={`${itemId}-${index}`}
                className={`item-token ${draggedItem === itemId ? "selected" : ""}`}
                draggable
                onClick={() => setDraggedItem(draggedItem === itemId ? null : itemId)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/item-id", itemId);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedItem(itemId);
                }}
                onDragEnd={() => setDraggedItem(null)}
                title={`${item.name}: ${item.description}`}
              >
                <ItemIcon itemId={itemId} />
                <span>{item.shortName}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="target-bank" aria-label="아이템 대상">
        {targets.map((player) => {
          const activeEffects = player.effects.filter((effect) => effect.expiresAt > Date.now());
          return (
            <button
              key={player.id}
              className={`target-chip ${player.id === ownPlayer.id ? "self" : ""}`}
              onDragOver={(event) => {
                if (!draggedItem) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => dropItem(event, player.id)}
              onClick={() => {
                if (!draggedItem) return;
                void useItem(draggedItem, player.id);
              }}
              title={draggedItem ? `${ITEM_DEFINITIONS[draggedItem].name} 사용` : "아이템을 선택하거나 이 닉네임 위로 드래그"}
            >
              <span>{player.nickname}</span>
              {player.id === ownPlayer.id && <small>나</small>}
              {activeEffects.length > 0 && <em>{activeEffects.length}</em>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProblemNav({
  problems,
  currentProblem,
  hardLocked,
  ownPlayer,
  room
}: {
  problems: ProblemPublic[];
  currentProblem: ProblemPublic;
  hardLocked: boolean;
  ownPlayer: PlayerPublic;
  room: RoomPublic;
}) {
  return (
    <nav className="problem-nav">
      {problems.map((problem) => {
        const solved = ownPlayer.submissions.some((submission) => submission.problemId === problem.id && submission.correct);
        const solvedByRoom = room.players.filter((player) => player.submissions.some((submission) => submission.problemId === problem.id && submission.correct)).length;
        const solveRate = room.players.length === 0 ? 0 : Math.round((solvedByRoom / room.players.length) * 100);
        const disabled = hardLocked && problem.difficulty < 4;
        return (
          <button
            key={problem.id}
            className={problem.id === currentProblem.id ? "active" : solved ? "solved" : ""}
            disabled={disabled}
            onClick={() => socket.emit("problem:set", { problemId: problem.id })}
            title={disabled ? "고난도 문제부터 풀어라 발동 중" : `${problem.number}번 · ${solveRate}% 풀이`}
            style={{ "--solve-rate": `${solveRate}%` } as React.CSSProperties & Record<string, string>}
          >
            <span>{problem.number}</span>
            <em>{solveRate}%</em>
          </button>
        );
      })}
    </nav>
  );
}

function RankingsScreen({ room, ownPlayer, onBack }: { room: RoomPublic; ownPlayer: PlayerPublic; onBack: () => void }) {
  const timeLeft = useCountdown(room);
  const liveRows = makePlayerStandingRows(room);
  const rows = room.scoreboardFrozen && room.frozenStandings.length > 0 ? room.frozenStandings : liveRows;
  const playerById = new Map(room.players.map((player) => [player.id, player]));

  return (
    <main className="rankings-layout">
      <section className="exam-sheet rankings-sheet">
        <div className="rankings-head">
          <button className="back-link" onClick={onBack}>문제로</button>
          <div>
            <span>{room.scoreboardFrozen ? "순위 비공개" : "실시간 채점"}</span>
            <h1>성적통지표</h1>
          </div>
          <strong>{formatTime(timeLeft)}</strong>
        </div>
        {room.scoreboardFrozen && (
          <div className="freeze-slip">
            <EyeOff size={18} />
            순위 비공개: 현재 표는 설정된 비공개 시작 시점의 임시 성적입니다. 실제 성적은 시험 종료 후 공개됩니다.
          </div>
        )}
        <div className="score-report-board">
          <div className="score-report-title">
            <strong>{formatReportDate()} 시행 성적통지표</strong>
            <em>{room.exam.title}</em>
          </div>
          <div className="score-report-grid score-report-header">
            <span>등급</span>
            <span>수험자명</span>
            <span>표준점수</span>
            <span>백분위</span>
            <span>원점수</span>
            <span>정답 문항</span>
            <span>최종 정답 시각</span>
          </div>
          {rows.map((standing) => {
            const player = playerById.get(standing.playerId);
            const metric = makeReportMetric(rows, standing.score);
            return (
              <div key={standing.playerId} className={`score-report-grid ${standing.playerId === ownPlayer.id ? "me" : ""}`}>
                <span>{metric.grade}</span>
                <strong>{standing.nickname}</strong>
                <em>{metric.standardScore}</em>
                <em>{metric.percentile}</em>
                <em>{standing.score}</em>
                <span>{standing.solved}/{room.exam.problemCount}</span>
                <span>{formatElapsed(room.startedAt, standing.lastAcceptedAt)}</span>
                {player && !player.connected && <small>재접속 대기</small>}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function makePlayerStandingRows(room: RoomPublic): StandingPublic[] {
  return [...room.players]
    .map((player) => ({
      playerId: player.id,
      nickname: player.nickname,
      score: player.score,
      solved: player.scoreBreakdown.solved,
      lastAcceptedAt: lastAcceptedAt(player)
    }))
    .sort((a, b) => b.score - a.score || b.solved - a.solved || (a.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER) - (b.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER));
}

function makeReportMetric(population: Array<{ score: number }>, score: number): ReportMetric {
  const scores = population.map((item) => item.score);
  const count = scores.length;
  if (count === 0) return { standardScore: 100, percentile: 100, grade: 1 };

  const mean = scores.reduce((sum, item) => sum + item, 0) / count;
  const variance = scores.reduce((sum, item) => sum + (item - mean) ** 2, 0) / count;
  const standardDeviation = Math.sqrt(variance);
  const standardScore = standardDeviation === 0 ? 100 : Math.round(100 + 20 * ((score - mean) / standardDeviation));
  const percentile =
    count === 1
      ? 100
      : Math.round(((scores.filter((item) => item < score).length + scores.filter((item) => item === score).length * 0.5) / count) * 100);

  return {
    standardScore,
    percentile,
    grade: gradeFromPercentile(percentile)
  };
}

function gradeFromPercentile(percentile: number) {
  if (percentile >= 96) return 1;
  if (percentile >= 89) return 2;
  if (percentile >= 77) return 3;
  if (percentile >= 60) return 4;
  if (percentile >= 40) return 5;
  if (percentile >= 23) return 6;
  if (percentile >= 11) return 7;
  if (percentile >= 4) return 8;
  return 9;
}

function lastAcceptedAt(player: PlayerPublic) {
  return player.submissions
    .filter((submission) => submission.correct)
    .reduce<number | null>((latest, submission) => (latest === null || submission.submittedAt > latest ? submission.submittedAt : latest), null);
}

function Scoreboard({ room, ownPlayer }: { room: RoomPublic; ownPlayer: PlayerPublic }) {
  const liveRows = [...room.players]
    .map((player) => {
      const lastAcceptedAt =
        player.submissions
          .filter((submission) => submission.correct)
          .reduce<number | null>((latest, submission) => (latest === null || submission.submittedAt > latest ? submission.submittedAt : latest), null);
      return {
        playerId: player.id,
        nickname: player.nickname,
        score: player.score,
        solved: player.scoreBreakdown.solved,
        lastAcceptedAt
      };
    })
    .sort((a, b) => b.score - a.score || b.solved - a.solved || (a.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER) - (b.lastAcceptedAt ?? Number.MAX_SAFE_INTEGER));
  const rows = room.scoreboardFrozen && room.frozenStandings.length > 0 ? room.frozenStandings : liveRows;
  return (
    <section className={`hud-panel scoreboard-panel ${room.scoreboardFrozen ? "frozen" : "live"}`}>
      <h2>
        <Trophy size={18} />
        순위표
        <em>{room.scoreboardFrozen ? "FROZEN" : "LIVE"}</em>
      </h2>
      {rows.map((player, index) => (
        <div key={player.playerId} className={`rank-row ${player.playerId === ownPlayer.id ? "me" : ""}`}>
          <span>{index + 1}</span>
          <strong>{player.nickname}</strong>
          <small>{player.solved} AC · {formatElapsed(room.startedAt, player.lastAcceptedAt)}</small>
          <em>{player.score}</em>
        </div>
      ))}
      {room.scoreboardFrozen && (
        <div className="private-score">
          <span>내 실제 답안지</span>
          <strong>{ownPlayer.score}점 · {ownPlayer.scoreBreakdown.solved}문항</strong>
        </div>
      )}
    </section>
  );
}

function Inventory({ room, ownPlayer }: { room: RoomPublic; ownPlayer: PlayerPublic }) {
  const [target, setTarget] = useState(room.players.find((player) => player.id !== ownPlayer.id)?.id ?? ownPlayer.id);
  const useItem = async (itemId: ItemId) => {
    await emitWithAck("item:use", { itemId, targetPlayerId: target });
  };

  return (
    <section className="hud-panel">
      <h2>
        <Zap size={18} />
        아이템
      </h2>
      <select value={target} onChange={(event) => setTarget(event.target.value)}>
        {room.players
          .filter((player) => player.id !== ownPlayer.id)
          .map((player) => (
            <option key={player.id} value={player.id}>
              {player.nickname}
            </option>
          ))}
        {room.players.length === 1 && <option value={ownPlayer.id}>나 자신</option>}
      </select>
      <div className="inventory-grid">
        {ownPlayer.inventory.map((itemId, index) => {
          const item = ITEM_DEFINITIONS[itemId];
          return (
            <button key={`${itemId}-${index}`} onClick={() => void useItem(itemId)} title={item.description}>
              <EyeOff size={16} />
              {item.shortName}
            </button>
          );
        })}
      </div>
      <div className="effect-list">
        {ownPlayer.effects.map((effect) => (
          <span key={`${effect.id}-${effect.expiresAt}`}>{effect.label}</span>
        ))}
      </div>
    </section>
  );
}

function LogFeed({ room }: { room: RoomPublic }) {
  return (
    <section className="hud-panel log-panel">
      <h2>감독관 로그</h2>
      {room.logs.map((log) => (
        <div key={log.id} className={`log-bubble ${log.kind}`}>
          {log.message}
        </div>
      ))}
    </section>
  );
}

function ResultsScreen({ room, onLeave }: { room: RoomPublic; onLeave: () => Promise<void> }) {
  const players = [...room.players].sort((a, b) => b.score - a.score || b.scoreBreakdown.solved - a.scoreBreakdown.solved);
  return (
    <main className="results-layout">
      <section className="exam-sheet result-sheet final-report-sheet">
        <div className="exam-head final-report-head">
          <span>채점 완료</span>
          <strong>성적통지표</strong>
        </div>
        <div className="release-stamp" aria-hidden="true">공개</div>
        <div className="score-report-title">
          <strong>{formatReportDate()} 시행 성적통지표</strong>
          <em>{room.exam.title}</em>
        </div>
        <div className="final-report-table">
          <div className="final-report-row final-report-row-head">
            <span>등급</span>
            <span>성명</span>
            <span>표준점수</span>
            <span>백분위</span>
            <span>원점수</span>
            <span>정답 문항</span>
          </div>
          {players.map((player) => {
            const metric = makeReportMetric(players, player.score);
            return (
              <div key={player.id} className="final-report-row">
                <span>{metric.grade}</span>
                <strong>{player.nickname}</strong>
                <em>{metric.standardScore}</em>
                <em>{metric.percentile}</em>
                <em>{player.score}</em>
                <span>{player.scoreBreakdown.solved}/{room.exam.problemCount}</span>
              </div>
            );
          })}
        </div>
        <button className="leave-report-btn" onClick={() => void onLeave()}>
          <LogOut size={18} />
          나가기
        </button>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
