import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  BarChart3,
  Clock,
  Copy,
  Crown,
  EyeOff,
  FileText,
  Flag,
  Gamepad2,
  LogIn,
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
  type ServerResponse
} from "../../shared/game";
import "./styles.css";

const socket: Socket = io();

type Screen = "home" | "lobby" | "arena" | "results";

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
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [ownPlayerId, setOwnPlayerId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/exams")
      .then((res) => res.json())
      .then((data: ExamSummary[]) => {
        setExams(data);
        setSelectedExamId(data[0]?.id ?? "");
      })
      .catch(() => setError("서버의 시험 목록을 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    socket.on("room:update", setRoom);
    socket.on("player:you", setOwnPlayerId);
    return () => {
      socket.off("room:update", setRoom);
      socket.off("player:you", setOwnPlayerId);
    };
  }, []);

  const ownPlayer = useMemo(() => {
    if (!room) return null;
    return room.players.find((player) => player.id === ownPlayerId) ?? null;
  }, [room, ownPlayerId]);

  const screen: Screen = !room ? "home" : room.status === "lobby" ? "lobby" : room.status === "finished" ? "results" : "arena";

  const createRoom = async () => {
    setError("");
    const response = await emitWithAck<RoomPublic>("room:create", {
      examId: selectedExamId,
      nickname,
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
          setSelectedExamId={setSelectedExamId}
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

      {screen === "results" && room && <ResultsScreen room={room} />}
    </div>
  );
}

function HomeScreen(props: {
  exams: ExamSummary[];
  selectedExamId: string;
  setSelectedExamId: (id: string) => void;
  nickname: string;
  setNickname: (value: string) => void;
  roomCode: string;
  setRoomCode: (value: string) => void;
  createRoom: () => void;
  joinRoom: () => void;
  error: string;
}) {
  return (
    <main className="home-layout">
      <section className="exam-sheet intro-sheet omr-entry-sheet">
        <div className="exam-head cover-head">
          <span>2026학년도 모의고사</span>
          <strong>1</strong>
        </div>
        <div className="subject-badge">제 2 교시</div>
        <div className="intro-title kice-cover">
          <h1>수학 영역</h1>
          <strong>소수형</strong>
        </div>
        <div className="omr-entry">
          <div className="omr-field name-field">
            <span>성명</span>
            <input value={props.nickname} onChange={(event) => props.setNickname(event.target.value)} placeholder="구동건" />
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
          <div className="omr-field code-field">
            <span>방 코드</span>
            <input value={props.roomCode} onChange={(event) => props.setRoomCode(event.target.value.toUpperCase())} placeholder="ABCDE" />
          </div>
          <button className="omr-action host-action" onClick={props.createRoom}>
            <Gamepad2 size={18} />
            방 열기
          </button>
          <button className="omr-action join-action" onClick={props.joinRoom}>
            <LogIn size={18} />
            입장
          </button>
          <div className="omr-bubbles" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <span key={index}>{index}</span>
            ))}
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
      </section>
      <aside className="setup-panel">
        <h2>
          <Users size={20} />
          입실 현황
        </h2>
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
      </aside>
    </main>
  );
}

function ArenaScreen({ room, ownPlayer }: { room: RoomPublic; ownPlayer: PlayerPublic }) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [view, setView] = useState<"problem" | "rankings">("problem");
  const timeLeft = useCountdown(room);
  const currentProblem = room.exam.problems.find((problem) => problem.id === ownPlayer.currentProblemId) ?? room.exam.problems[0];
  const hasEffect = (id: string) => ownPlayer.effects.some((effect) => effect.id === id && effect.expiresAt > Date.now());
  const hardLocked = hasEffect("hardFirst");
  const inputLocked = hasEffect("penLock") || hasEffect("slowInput");
  const covered = hasEffect("cover") || hasEffect("blur");
  const solvedCount = ownPlayer.scoreBreakdown.solved;

  const submit = async () => {
    setFeedback("");
    const response = await emitWithAck<{ correct: boolean }>("answer:submit", {
      problemId: currentProblem.id,
      answer
    });
    if (!response.ok) {
      setFeedback(response.error ?? "제출 실패");
      return;
    }
    setFeedback(response.data?.correct ? "정답. 아이템 박스 확인." : "오답. 연속 오답 조심.");
    setAnswer("");
  };

  if (view === "rankings") {
    return <RankingsScreen room={room} ownPlayer={ownPlayer} onBack={() => setView("problem")} />;
  }

  return (
    <main className="arena-layout">
      <section className="paper-zone">
        <div className="arena-status">
          <span>
            <Clock size={16} />
            {formatTime(timeLeft)}
          </span>
          <span>
            <Trophy size={16} />
            {ownPlayer.score}점
          </span>
          <span>{solvedCount}/{room.exam.problemCount}문항</span>
          <span>
            <ShieldAlert size={16} />
            연속 오답 {ownPlayer.consecutiveWrong}
          </span>
          {room.scoreboardFrozen && (
            <span className="freeze-chip">
              <EyeOff size={16} />
              랭킹 프리즈
            </span>
          )}
          <button className="status-link" onClick={() => setView("rankings")}>
            <BarChart3 size={16} />
            순위표
          </button>
        </div>
        <ProblemNav problems={room.exam.problems} currentProblem={currentProblem} hardLocked={hardLocked} ownPlayer={ownPlayer} room={room} />
        <div className="exam-sheet problem-sheet single-question-sheet">
          <div className="exam-head problem-exam-head">
            <span>{room.exam.title}</span>
            <strong>{currentProblem.number}</strong>
          </div>
          <div className="problem-title-row">
            <span>제 2 교시</span>
            <h2>수학 영역</h2>
            <strong>소수형</strong>
          </div>
          <div className={`problem-image-wrap ${covered ? "covered" : ""}`}>
            {currentProblem.content ? (
              currentProblem.renderBlocks?.length ? (
                <ParsedProblem problem={currentProblem} />
              ) : (
                <ReconstructedProblem problem={currentProblem} room={room} />
              )
            ) : (
              <img src={currentProblem.imageUrl} alt={`${currentProblem.number}번 문제`} />
            )}
            {covered && <div className="cover-effect">문제 가리기 발동</div>}
            {hasEffect("meme") && (
              <div className="meme-effect">
                <img src="/exams/meme-slots/placeholder.svg" alt="방해 짤 슬롯" />
              </div>
            )}
          </div>
        </div>
        <div className="answer-bar">
          <label>
            답안란
            <input
              value={answer}
              disabled={inputLocked}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              placeholder={currentProblem.answerKind === "choice" ? "보기 번호" : "숫자"}
            />
          </label>
          <button className="primary-btn" disabled={inputLocked} onClick={() => void submit()}>
            <Send size={18} />
            답안 제출
          </button>
          {feedback && <span className="feedback">{feedback}</span>}
        </div>
      </section>
    </main>
  );
}

function ParsedProblem({ problem }: { problem: ProblemPublic }) {
  return (
    <div className="parsed-problem">
      {problem.renderBlocks?.map((block, index) => {
        if (block.kind === "math" && block.latex) {
          return <MathFormula key={`${problem.id}-parsed-${index}`} latex={block.latex} source="" />;
        }
        if (block.kind === "choices" && block.choices) {
          return (
            <div className="parsed-choices" key={`${problem.id}-parsed-${index}`}>
              {block.choices.map((choice) => (
                <div key={choice.label} className="parsed-choice">
                  <strong>{choice.label}</strong>
                  {choice.latex ? <MathFormula latex={choice.latex} source="" /> : <span>{choice.text}</span>}
                </div>
              ))}
            </div>
          );
        }
        return (
          <p key={`${problem.id}-parsed-${index}`} className="parsed-text">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function MathFormula({ latex, source }: { latex: string; source: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        strict: false,
        displayMode: false
      });
    } catch {
      return "";
    }
  }, [latex]);

  return (
    <div className="math-row">
      {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <code>{latex}</code>}
      {source && <small>{source}</small>}
    </div>
  );
}

function ReconstructedProblem({ problem, room }: { problem: ProblemPublic; room: RoomPublic }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(problem.content?.width ?? 1);
  const content = problem.content;

  useEffect(() => {
    if (!room.exam.fonts?.length) return;
    const id = `exam-fonts-${room.exam.id}`;
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = room.exam.fonts
      .map((font) => `@font-face{font-family:"${font.family}";src:url("${font.url}") format("truetype");font-display:swap;}`)
      .join("\n");
    document.head.appendChild(style);
  }, [room.exam.fonts, room.exam.id]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  if (!content) {
    return <img src={problem.imageUrl} alt={`${problem.number}번 문제`} />;
  }

  const scale = Math.min(2, Math.max(0.1, width / content.width));
  return (
    <div className="reconstructed-wrap" ref={wrapRef} style={{ minHeight: content.height * scale }}>
      <div className="reconstructed-problem" style={{ width: content.width, height: content.height, transform: `scale(${scale})` }}>
        {content.lines.map((line, lineIndex) => (
          <div
            key={`${problem.id}-line-${lineIndex}`}
            className="reconstructed-line"
            style={{ left: line.x, top: line.y, width: line.width, height: line.height }}
          >
            {line.spans.map((span, spanIndex) => (
              <span
                key={`${problem.id}-span-${lineIndex}-${spanIndex}`}
                className="reconstructed-span"
                style={{
                  left: span.x - line.x,
                  top: span.y - line.y,
                  width: span.width,
                  height: span.height,
                  fontFamily: `"${span.font}", "Apple SD Gothic Neo", serif`,
                  fontSize: span.size,
                  fontWeight: span.flags & 16 ? 700 : 400
                }}
              >
                {span.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
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
  const players = [...room.players].sort((a, b) => {
    const aLast = lastAcceptedAt(a);
    const bLast = lastAcceptedAt(b);
    return b.score - a.score || b.scoreBreakdown.solved - a.scoreBreakdown.solved || (aLast ?? Number.MAX_SAFE_INTEGER) - (bLast ?? Number.MAX_SAFE_INTEGER);
  });

  return (
    <main className="rankings-layout">
      <section className="exam-sheet rankings-sheet">
        <div className="rankings-head">
          <button className="back-link" onClick={onBack}>문제로</button>
          <div>
            <span>{room.scoreboardFrozen ? "FROZEN" : "LIVE"}</span>
            <h1>순위표</h1>
          </div>
          <strong>{formatTime(timeLeft)}</strong>
        </div>
        <div className="domjudge-board" style={{ "--problem-count": String(room.exam.problems.length) } as React.CSSProperties & Record<string, string>}>
          <div className="domjudge-row domjudge-header">
            <span>등수</span>
            <span>응시자</span>
            <span>점수</span>
            {room.exam.problems.map((problem) => (
              <span key={problem.id}>{problem.number}</span>
            ))}
          </div>
          {players.map((player, index) => (
            <div key={player.id} className={`domjudge-row ${player.id === ownPlayer.id ? "me" : ""}`}>
              <span>{index + 1}</span>
              <strong>{player.nickname}</strong>
              <em>{player.score}</em>
              {room.exam.problems.map((problem) => {
                const submission = player.submissions.find((item) => item.problemId === problem.id);
                return (
                  <span key={problem.id} className={submission?.correct ? "accepted" : submission ? "tried" : ""}>
                    {submission?.correct ? (
                      <>
                        <b>{formatElapsed(room.startedAt, submission.submittedAt)}</b>
                        <small>{submission.attempts}회</small>
                      </>
                    ) : submission ? (
                      <small>{submission.attempts}회</small>
                    ) : null}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
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

function ResultsScreen({ room }: { room: RoomPublic }) {
  const players = [...room.players].sort((a, b) => b.score - a.score || b.scoreBreakdown.solved - a.scoreBreakdown.solved);
  return (
    <main className="results-layout">
      <section className="exam-sheet result-sheet">
        <div className="exam-head">
          <span>성적표</span>
          <strong>{room.exam.title}</strong>
        </div>
        {players.map((player, index) => (
          <div key={player.id} className="result-row">
            <span>{index + 1}등</span>
            <strong>{player.nickname}</strong>
            <em>{player.score}점 · {player.scoreBreakdown.solved}/{room.exam.problemCount}</em>
          </div>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
