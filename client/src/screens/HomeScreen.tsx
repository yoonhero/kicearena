import { useEffect, useState } from "react";
import { ChevronDown, Clock3, FileText, Gamepad2, LogIn, SlidersHorizontal } from "lucide-react";
import { ROOM_GUARDRAILS, type ExamSummary } from "../../../shared/game";
import { composeHangulSyllable, composeNickname, NICKNAME_FINALS, NICKNAME_INITIALS, NICKNAME_VOWELS, sanitizeNickname, type NicknameJamo } from "../../../shared/nickname";
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
  error: string;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const [entryMode, setEntryMode] = useState<"create" | "join">("create");
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [nameParts, setNameParts] = useState<[NicknameJamo, NicknameJamo]>([
    { initial: "ㅁ", vowel: "ㅣ", final: "ㄴ" },
    { initial: "ㅈ", vowel: "ㅐ", final: "" }
  ]);
  const nameSlots = 2;
  const displayedName = Array.from(props.nickname).slice(0, nameSlots);
  const trimmedNickname = props.nickname.trim();
  const maxTimeLimitMin = Math.round(ROOM_GUARDRAILS.maxTimeLimitSec / 60);
  const selectedExam = props.exams.find((exam) => exam.id === props.selectedExamId);
  const selectedPreset = QUICK_PRESETS.find((preset) => preset.timeLimitMin === props.timeLimitMin && preset.freezeBeforeMin === props.freezeBeforeMin);
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
          <div className="identity-card">
            <div className="omr-name-maker" aria-label="성명 OMR 입력">
              <div className="omr-maker-head">
                <strong>성명</strong>
                <span>{props.inviteMode ? `초대 방 ${props.inviteRoomCode}` : "초성·중성·종성 조합"}</span>
              </div>
              <div className="omr-maker-cells" aria-hidden="true">
                {Array.from({ length: nameSlots }, (_, index) => (
                  <span key={index}>{displayedName[index] ?? previewName[index] ?? ""}</span>
                ))}
              </div>
              <div className="omr-slot-tabs" role="tablist" aria-label="이름 글자 선택">
                {[0, 1].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={activeSlot === slot ? "active" : ""}
                    onClick={() => setActiveSlot(slot as 0 | 1)}
                    role="tab"
                    aria-selected={activeSlot === slot}
                  >
                    {slot + 1}글자
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
              직접 입력
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
              </>
            )}
          </div>
          {!props.inviteMode && (
            <div className="entry-flow-stack">
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
                <div className="entry-action-panel creator-panel">
                  <div className="entry-panel-title">
                    <span>방 생성</span>
                    <strong>{selectedExam ? `${selectedExam.problemCount}문항 · ${props.timeLimitMin}분 / 프리즈 ${props.freezeBeforeMin}분` : "시험지를 고른 뒤 시작"}</strong>
                  </div>
                  <div className="exam-choice-list" role="radiogroup" aria-label="시험지 선택">
                    <span>시험지</span>
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
                          <FileText size={16} />
                          <span>
                            <strong>{exam.title}</strong>
                            <em>{exam.problemCount}문항 · 기본 {Math.round(exam.timeLimitSec / 60)}분</em>
                          </span>
                        </button>
                      ))}
                    </div>
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
                        >
                          <Clock3 size={15} />
                          <strong>{preset.label}</strong>
                          <em>분</em>
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
                      <div className="room-option-grid">
                        <label className="omr-field">
                          <span>시험 시간(분)</span>
                          <input
                            type="number"
                            min={1}
                            max={maxTimeLimitMin}
                            value={props.timeLimitMin}
                            onChange={(event) =>
                              props.setTimeLimitMin(Number.isFinite(event.currentTarget.valueAsNumber) ? Math.min(maxTimeLimitMin, event.currentTarget.valueAsNumber) : 1)
                            }
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
                    )}
                  </div>
                  <button className="omr-action host-action" onClick={props.createRoom}>
                    <Gamepad2 size={18} />
                    방 열기
                  </button>
                </div>
              ) : (
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
              )}
            </div>
          )}
          {props.error && <p className="error-text">{props.error}</p>}
        </div>
      </section>
    </main>
  );
}
