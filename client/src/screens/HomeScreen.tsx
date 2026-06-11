import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, Gamepad2, LogIn, LogOut, SlidersHorizontal } from "lucide-react";
import { ROOM_GUARDRAILS, type ExamSummary, type RoomMode } from "../../../shared/game";
import { composeHangulSyllable, composeNickname, createRandomNicknameParts, NICKNAME_FINALS, NICKNAME_INITIALS, NICKNAME_VOWELS, sanitizeNickname, type NicknameJamo } from "../../../shared/nickname";
import { formatReportDate } from "../lib/format";

const QUICK_PRESETS = [
  { label: "120 / 60", timeLimitMin: 120, freezeBeforeMin: 60 },
  { label: "60 / 20", timeLimitMin: 60, freezeBeforeMin: 20 },
  { label: "40 / 20", timeLimitMin: 40, freezeBeforeMin: 20 }
];

export function HomeScreen(props: {
  exams: ExamSummary[];
  selectedExamId: string;
  setSelectedExamId: (id: string) => void;
  timeLimitMin: number;
  setTimeLimitMin: (value: number) => void;
  freezeBeforeMin: number;
  setFreezeBeforeMin: (value: number) => void;
  roomMode: RoomMode;
  setRoomMode: (mode: RoomMode) => void;
  nickname: string;
  setNickname: (value: string) => void;
  roomCode: string;
  setRoomCode: (value: string) => void;
  createRoom: () => void;
  joinRoom: () => void;
  joinInviteRoom: () => void;
  inviteMode: boolean;
  inviteRoomCode: string;
  joiningInvite: boolean;
  exitInviteMode: () => void;
  error: string;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const [entryMode, setEntryMode] = useState<"create" | "join">("create");
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [nameParts, setNameParts] = useState<[NicknameJamo, NicknameJamo]>(() => createRandomNicknameParts());
  const nameSlots = 2;
  const displayedName = Array.from(props.nickname).slice(0, nameSlots);
  const trimmedNickname = props.nickname.trim();
  const maxTimeLimitMin = Math.round(ROOM_GUARDRAILS.maxTimeLimitSec / 60);
  const selectedExam = props.exams.find((exam) => exam.id === props.selectedExamId);
  const selectedPreset = QUICK_PRESETS.find((preset) => preset.timeLimitMin === props.timeLimitMin && preset.freezeBeforeMin === props.freezeBeforeMin);
  const freezeStartMin = Math.max(0, props.timeLimitMin - props.freezeBeforeMin);
  const timelineTicks = Array.from({ length: 5 }, (_, index) => Math.round((maxTimeLimitMin / 4) * index));
  const timeSliderStyle = {
    "--time-ratio": props.timeLimitMin / maxTimeLimitMin,
    "--freeze-ratio": freezeStartMin / maxTimeLimitMin
  } as CSSProperties;
  const setRoomTimeLimitMin = (value: number) => {
    const nextValue = Math.max(1, Math.min(maxTimeLimitMin, value));
    props.setTimeLimitMin(nextValue);
    if (props.freezeBeforeMin > nextValue) props.setFreezeBeforeMin(nextValue);
  };
  const setRoomFreezeStartMin = (value: number) => {
    const nextStart = Math.max(0, Math.min(props.timeLimitMin, value));
    props.setFreezeBeforeMin(props.timeLimitMin - nextStart);
  };
  const setNicknamePart = (kind: keyof NicknameJamo, value: string) => {
    setNameParts((previous) => {
      const next: [NicknameJamo, NicknameJamo] = [{ ...previous[0] }, { ...previous[1] }];
      next[activeSlot] = { ...next[activeSlot], [kind]: value };
      props.setNickname(composeNickname(next[0], next[1]));
      return next;
    });
  };
  const previewName = nameParts.map(composeHangulSyllable);
  const nicknameLength = Array.from(trimmedNickname).length;

  useEffect(() => {
    if (!props.nickname) props.setNickname(composeNickname(nameParts[0], nameParts[1]));
  }, []);

  return (
    <main className={`home-layout ${props.inviteMode ? "invite-home-layout" : ""}`}>
      <section className="exam-sheet intro-sheet omr-entry-sheet">
        {!props.inviteMode && (
          <>
            <div className="exam-head cover-head">
              <span>{formatReportDate()} 시행 모의평가</span>
              <strong>1</strong>
            </div>
            <div className="subject-badge">제 2 교시</div>
            <div className="intro-title kice-cover">
              <h1>수학 영역</h1>
              <strong>소수형</strong>
            </div>
          </>
        )}
        <div className="omr-entry">
          <div className="identity-card entry-zone entry-zone-identity">
            <div className="omr-name-maker" aria-label="성명 OMR 입력">
              <div className="omr-maker-head">
                <strong>성명</strong>
                {props.inviteMode && <span>{`초대 방 ${props.inviteRoomCode}`}</span>}
              </div>
              <div className="omr-maker-cells" role="tablist" aria-label="수정할 이름 글자 선택">
                {Array.from({ length: nameSlots }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`omr-name-cell ${activeSlot === index ? "active" : ""}`}
                    onClick={() => setActiveSlot(index as 0 | 1)}
                    role="tab"
                    aria-selected={activeSlot === index}
                    aria-label={`${index + 1}번째 글자 ${displayedName[index] ?? previewName[index] ?? ""} 수정`}
                  >
                    {displayedName[index] ?? previewName[index] ?? ""}
                  </button>
                ))}
              </div>
              <div className="omr-syllable-row" aria-label={`${activeSlot + 1}글자 초성 선택`}>
                {NICKNAME_INITIALS.map((jamo) => (
                  <button key={`initial-${jamo}`} type="button" className={nameParts[activeSlot].initial === jamo ? "marked" : ""} onClick={() => setNicknamePart("initial", jamo)} aria-label={`${activeSlot + 1}글자 초성 ${jamo}`}>
                    <span>{jamo}</span>
                  </button>
                ))}
              </div>
              <div className="omr-syllable-row" aria-label={`${activeSlot + 1}글자 중성 선택`}>
                {NICKNAME_VOWELS.map((jamo) => (
                  <button key={`vowel-${jamo}`} type="button" className={nameParts[activeSlot].vowel === jamo ? "marked" : ""} onClick={() => setNicknamePart("vowel", jamo)} aria-label={`${activeSlot + 1}글자 중성 ${jamo}`}>
                    <span>{jamo}</span>
                  </button>
                ))}
              </div>
              <div className="omr-syllable-row" aria-label={`${activeSlot + 1}글자 종성 선택`}>
                {NICKNAME_FINALS.map((jamo) => (
                  <button key={`final-${jamo || "none"}`} type="button" className={(nameParts[activeSlot].final ?? "") === jamo ? "marked" : ""} onClick={() => setNicknamePart("final", jamo)} aria-label={`${activeSlot + 1}글자 종성 ${jamo || "없음"}`}>
                    <span>{jamo || "-"}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="nickname-direct-field">
              <span>직접 수정</span>
              <input
                value={props.nickname}
                maxLength={ROOM_GUARDRAILS.maxNicknameLength}
                onChange={(event) => props.setNickname(sanitizeNickname(event.target.value))}
                placeholder="닉네임"
              />
            </label>
            {props.inviteMode && (
              <>
                <div className="invite-entry-status" aria-live="polite">
                  <span>{props.joiningInvite ? "입실 처리 중" : nicknameLength > 0 ? `${nicknameLength}글자` : "1글자 이상 선택"}</span>
                </div>
                <button className="omr-action invite-enter-action" type="button" disabled={!trimmedNickname || props.joiningInvite} onClick={props.joinInviteRoom}>
                  <LogIn size={18} />
                  입장
                </button>
                <button className="invite-exit-action" type="button" onClick={props.exitInviteMode}>
                  <LogOut size={16} />
                  나가기
                </button>
              </>
            )}
          </div>
          {!props.inviteMode && (
            <div className="entry-flow-stack">
              <div className="exam-choice-list exam-cover-shelf entry-zone entry-zone-paper" role="radiogroup" aria-label="문제지 선택">
                <span>문제지 선택</span>
                <div className="exam-choice-grid">
                  {props.exams.map((exam) => (
                    <button
                      key={exam.id}
                      type="button"
                      className={`exam-choice ${props.selectedExamId === exam.id ? "selected" : ""}`}
                      onClick={() => props.setSelectedExamId(exam.id)}
                      role="radio"
                      aria-checked={props.selectedExamId === exam.id}
                    >
                      <span className="exam-cover-art">
                        <em>수학 영역</em>
                        <strong>{exam.title}</strong>
                        <small>{exam.problemCount}문항 · {Math.round(exam.timeLimitSec / 60)}분</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="entry-mode-toggle" role="tablist" aria-label="입실 방식">
                <button type="button" className={entryMode === "create" ? "active" : ""} onClick={() => setEntryMode("create")} role="tab" aria-selected={entryMode === "create"}>
                  <Gamepad2 size={16} />
                  방 생성
                </button>
                <button type="button" className={entryMode === "join" ? "active" : ""} onClick={() => setEntryMode("join")} role="tab" aria-selected={entryMode === "join"}>
                  <LogIn size={16} />
                  기존 방 입장
                </button>
              </div>
              {entryMode === "create" ? (
                <div className={`entry-action-panel creator-panel entry-zone entry-zone-action ${showOptions ? "options-open" : ""}`}>
                  <div className="entry-panel-title">
                    <span>방 생성</span>
                    <strong>
                      {selectedExam
                        ? `${props.roomMode === "contest" ? "콘테스트" : "캐주얼"} · ${selectedExam.problemCount}문항 · ${props.timeLimitMin}분 / 프리즈 ${props.freezeBeforeMin}분`
                        : "시험지를 고른 뒤 시작"}
                    </strong>
                  </div>
                  <div className="entry-mode-toggle room-mode-toggle" role="tablist" aria-label="방 모드">
                    <button type="button" className={props.roomMode === "casual" ? "active" : ""} onClick={() => props.setRoomMode("casual")} role="tab" aria-selected={props.roomMode === "casual"}>
                      캐주얼
                    </button>
                    <button type="button" className={props.roomMode === "contest" ? "active" : ""} onClick={() => props.setRoomMode("contest")} role="tab" aria-selected={props.roomMode === "contest"}>
                      콘테스트 200
                    </button>
                  </div>
                  <div className="quick-preset-list" role="radiogroup" aria-label="시험 시간 프리셋">
                    <span>시간 / 프리즈</span>
                    <div className="quick-preset-grid">
                      {QUICK_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className={`quick-preset ${selectedPreset?.label === preset.label ? "selected" : ""}`}
                          onClick={() => {
                            props.setTimeLimitMin(preset.timeLimitMin);
                            props.setFreezeBeforeMin(preset.freezeBeforeMin);
                          }}
                          role="radio"
                          aria-checked={selectedPreset?.label === preset.label}
                          style={
                            {
                              "--preset-time-ratio": preset.timeLimitMin / maxTimeLimitMin,
                              "--preset-freeze-ratio": (preset.timeLimitMin - preset.freezeBeforeMin) / maxTimeLimitMin
                            } as CSSProperties
                          }
                        >
                          <span className="preset-mini-head">
                            <strong>{preset.timeLimitMin}분 종료</strong>
                            <em>{preset.timeLimitMin - preset.freezeBeforeMin}분부터</em>
                          </span>
                          <span className="preset-mini-track" aria-hidden="true">
                            <i className="preset-mini-freeze" />
                            <i className="preset-mini-end" />
                            <i className="preset-mini-start" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`room-option-drawer ${showOptions ? "open" : ""}`}>
                    <button className="option-toggle" type="button" onClick={() => setShowOptions((value) => !value)} aria-expanded={showOptions}>
                      <SlidersHorizontal size={16} />
                      세부 설정
                      <ChevronDown size={16} />
                    </button>
                    {showOptions && (
                      <div className="coupled-time-board" role="group" aria-label="시험 시간 및 프리즈 설정" style={timeSliderStyle}>
                        <div className="timeline-status" aria-hidden="true">
                          <strong>{freezeStartMin}분부터 프리즈 · {props.timeLimitMin}분 종료</strong>
                        </div>
                        <div className="coupled-time-track">
                          <div className="coupled-slider-stack">
                            <div className="coupled-axis" aria-hidden="true" />
                            <div className="freeze-zone" aria-hidden="true" />
                            <div className="coupled-ticks" aria-hidden="true">
                              {timelineTicks.map((minute) => (
                                <span key={minute} style={{ left: `${(minute / maxTimeLimitMin) * 100}%` }}>
                                  {minute}
                                </span>
                              ))}
                            </div>
                            <div className="axis-arrow left" aria-hidden="true" />
                            <div className="axis-arrow right" aria-hidden="true" />
                            <div className="time-marker time-limit-marker" aria-hidden="true">
                              <span>종료</span>
                              <strong>{props.timeLimitMin}분</strong>
                            </div>
                            <div className="time-marker freeze-marker-dot" aria-hidden="true">
                              <span>프리즈 시작</span>
                              <strong>{freezeStartMin}분</strong>
                            </div>
                            <input
                              className="time-range time-limit-range"
                              type="range"
                              min={5}
                              max={maxTimeLimitMin}
                              step={5}
                              value={props.timeLimitMin}
                              onChange={(event) => setRoomTimeLimitMin(event.currentTarget.valueAsNumber)}
                              aria-label="시험 시간"
                            />
                            <input
                              className="time-range freeze-range"
                              type="range"
                              min={0}
                              max={maxTimeLimitMin}
                              step={5}
                              value={freezeStartMin}
                              onChange={(event) => setRoomFreezeStartMin(event.currentTarget.valueAsNumber)}
                              aria-label="프리즈 시작"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button className="omr-action host-action" onClick={props.createRoom}>
                    <Gamepad2 size={18} />
                    방 열기
                  </button>
                </div>
              ) : (
                <div className="entry-action-panel join-panel entry-zone entry-zone-action">
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
              )}
            </div>
          )}
          {props.error && <p className="error-text">{props.error}</p>}
        </div>
      </section>
    </main>
  );
}
