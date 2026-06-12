import { useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, Gamepad2, LogIn, SlidersHorizontal, Zap } from "lucide-react";
import { ROOM_GUARDRAILS, type ExamSummary } from "../../../shared/game";

const QUICK_PRESETS = [
    { label: "120 / 60", timeLimitMin: 120, freezeBeforeMin: 60 },
    { label: "60 / 20", timeLimitMin: 60, freezeBeforeMin: 20 },
    { label: "40 / 20", timeLimitMin: 40, freezeBeforeMin: 20 },
];

export function HomeEntryActions(props: {
    exams: ExamSummary[];
    selectedExamId: string;
    setSelectedExamId: (id: string) => void;
    timeLimitMin: number;
    setTimeLimitMin: (value: number) => void;
    freezeBeforeMin: number;
    setFreezeBeforeMin: (value: number) => void;
    itemEnabled: boolean;
    setItemEnabled: (enabled: boolean) => void;
    nickname: string;
    roomCode: string;
    setRoomCode: (value: string) => void;
    createRoom: () => void;
    joinRoom: () => void;
}) {
    const [showOptions, setShowOptions] = useState(false);
    const [entryMode, setEntryMode] = useState<"create" | "join">("create");
    const trimmedNickname = props.nickname.trim();
    const trimmedRoomCode = props.roomCode.trim();
    const maxTimeLimitMin = Math.round(ROOM_GUARDRAILS.maxTimeLimitSec / 60);
    const selectedExam = props.exams.find((exam) => exam.id === props.selectedExamId);
    const selectedPreset = QUICK_PRESETS.find(
        (preset) =>
            preset.timeLimitMin === props.timeLimitMin &&
            preset.freezeBeforeMin === props.freezeBeforeMin,
    );
    const createSummary = selectedExam
        ? `${selectedExam.problemCount}문항 · ${props.timeLimitMin}분`
        : "문제지를 고르세요";
    const freezeStartMin = Math.max(0, props.timeLimitMin - props.freezeBeforeMin);
    const timelineTicks = Array.from({ length: 5 }, (_, index) =>
        Math.round((maxTimeLimitMin / 4) * index),
    );
    const timeSliderStyle = {
        "--time-ratio": props.timeLimitMin / maxTimeLimitMin,
        "--freeze-ratio": freezeStartMin / maxTimeLimitMin,
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

    return (
        <div className="entry-flow-stack">
            <ExamPicker
                exams={props.exams}
                selectedExamId={props.selectedExamId}
                setSelectedExamId={props.setSelectedExamId}
            />
            <div className="entry-mode-toggle" role="tablist" aria-label="입실 방식">
                <button
                    type="button"
                    className={entryMode === "create" ? "active" : ""}
                    onClick={() => setEntryMode("create")}
                    role="tab"
                    aria-selected={entryMode === "create"}
                >
                    <Gamepad2 size={16} />
                    시험실 만들기
                </button>
                <button
                    type="button"
                    className={entryMode === "join" ? "active" : ""}
                    onClick={() => setEntryMode("join")}
                    role="tab"
                    aria-selected={entryMode === "join"}
                >
                    <LogIn size={16} />
                    시험실 입장
                </button>
            </div>
            {entryMode === "create" ? (
                <div
                    className={`entry-action-panel creator-panel entry-zone entry-zone-action ${
                        showOptions ? "options-open" : ""
                    }`}
                >
                    <div className="entry-panel-title">
                        <span>시험 설정</span>
                        <strong>{createSummary}</strong>
                    </div>
                    <ItemToggle enabled={props.itemEnabled} setEnabled={props.setItemEnabled} />
                    <QuickPresetList
                        selectedPresetLabel={selectedPreset?.label}
                        maxTimeLimitMin={maxTimeLimitMin}
                        setTimeLimitMin={props.setTimeLimitMin}
                        setFreezeBeforeMin={props.setFreezeBeforeMin}
                    />
                    <div className={`room-option-drawer ${showOptions ? "open" : ""}`}>
                        <button
                            className="option-toggle"
                            type="button"
                            onClick={() => setShowOptions((value) => !value)}
                            aria-expanded={showOptions}
                        >
                            <SlidersHorizontal size={16} />
                            시간 직접 조정
                            <ChevronDown size={16} />
                        </button>
                        {showOptions && (
                            <TimeOptionBoard
                                freezeStartMin={freezeStartMin}
                                maxTimeLimitMin={maxTimeLimitMin}
                                timeLimitMin={props.timeLimitMin}
                                timelineTicks={timelineTicks}
                                timeSliderStyle={timeSliderStyle}
                                setRoomTimeLimitMin={setRoomTimeLimitMin}
                                setRoomFreezeStartMin={setRoomFreezeStartMin}
                            />
                        )}
                    </div>
                    <button
                        className="omr-action host-action"
                        disabled={!trimmedNickname || !props.selectedExamId}
                        onClick={props.createRoom}
                    >
                        <Gamepad2 size={18} />
                        시험실 만들기
                    </button>
                </div>
            ) : (
                <JoinPanel
                    roomCode={props.roomCode}
                    setRoomCode={props.setRoomCode}
                    canJoin={Boolean(trimmedNickname && trimmedRoomCode)}
                    joinRoom={props.joinRoom}
                />
            )}
        </div>
    );
}

function ExamPicker(props: {
    exams: ExamSummary[];
    selectedExamId: string;
    setSelectedExamId: (id: string) => void;
}) {
    return (
        <div
            className="exam-choice-list exam-cover-shelf entry-zone entry-zone-paper"
            role="radiogroup"
            aria-label="문제지 선택"
        >
            <span>문제지 선택</span>
            <div className="exam-choice-grid">
                {props.exams.map((exam) => (
                    <button
                        key={exam.id}
                        type="button"
                        className={`exam-choice ${
                            props.selectedExamId === exam.id ? "selected" : ""
                        }`}
                        onClick={() => props.setSelectedExamId(exam.id)}
                        role="radio"
                        aria-checked={props.selectedExamId === exam.id}
                    >
                        <span className="exam-cover-art">
                            <em>수학 영역</em>
                            <strong>{exam.title}</strong>
                            <small>
                                {exam.problemCount}문항 · {Math.round(exam.timeLimitSec / 60)}분
                            </small>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function ItemToggle(props: { enabled: boolean; setEnabled: (enabled: boolean) => void }) {
    return (
        <div className="item-toggle-row" role="group" aria-label="아이템 설정">
            <span>
                <Zap size={15} />
                아이템
            </span>
            <button
                type="button"
                className={props.enabled ? "active" : ""}
                onClick={() => props.setEnabled(!props.enabled)}
                aria-pressed={props.enabled}
            >
                {props.enabled ? "ON" : "OFF"}
            </button>
        </div>
    );
}

function QuickPresetList(props: {
    selectedPresetLabel?: string;
    maxTimeLimitMin: number;
    setTimeLimitMin: (value: number) => void;
    setFreezeBeforeMin: (value: number) => void;
}) {
    return (
        <div className="quick-preset-list" role="radiogroup" aria-label="시험 시간 프리셋">
            <span>기본 시간</span>
            <div className="quick-preset-grid">
                {QUICK_PRESETS.map((preset) => (
                    <button
                        key={preset.label}
                        type="button"
                        className={`quick-preset ${
                            props.selectedPresetLabel === preset.label ? "selected" : ""
                        }`}
                        onClick={() => {
                            props.setTimeLimitMin(preset.timeLimitMin);
                            props.setFreezeBeforeMin(preset.freezeBeforeMin);
                        }}
                        role="radio"
                        aria-checked={props.selectedPresetLabel === preset.label}
                        style={
                            {
                                "--preset-time-ratio": preset.timeLimitMin / props.maxTimeLimitMin,
                                "--preset-freeze-ratio":
                                    (preset.timeLimitMin - preset.freezeBeforeMin) /
                                    props.maxTimeLimitMin,
                            } as CSSProperties
                        }
                    >
                        <span className="preset-mini-head">
                            <strong>{preset.timeLimitMin}분 종료</strong>
                            <em>{preset.timeLimitMin - preset.freezeBeforeMin}분 프리즈</em>
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
    );
}

function TimeOptionBoard(props: {
    freezeStartMin: number;
    maxTimeLimitMin: number;
    timeLimitMin: number;
    timelineTicks: number[];
    timeSliderStyle: CSSProperties;
    setRoomTimeLimitMin: (value: number) => void;
    setRoomFreezeStartMin: (value: number) => void;
}) {
    return (
        <div
            className="coupled-time-board"
            role="group"
            aria-label="시험 시간 및 프리즈 설정"
            style={props.timeSliderStyle}
        >
            <div className="timeline-status" aria-hidden="true">
                <strong>
                    {props.freezeStartMin}분부터 프리즈 · {props.timeLimitMin}분 종료
                </strong>
            </div>
            <div className="coupled-time-track">
                <div className="coupled-slider-stack">
                    <div className="coupled-axis" aria-hidden="true" />
                    <div className="freeze-zone" aria-hidden="true" />
                    <div className="coupled-ticks" aria-hidden="true">
                        {props.timelineTicks.map((minute) => (
                            <span
                                key={minute}
                                style={{ left: `${(minute / props.maxTimeLimitMin) * 100}%` }}
                            >
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
                        <strong>{props.freezeStartMin}분</strong>
                    </div>
                    <input
                        className="time-range time-limit-range"
                        type="range"
                        min={5}
                        max={props.maxTimeLimitMin}
                        step={5}
                        value={props.timeLimitMin}
                        onChange={(event) =>
                            props.setRoomTimeLimitMin(event.currentTarget.valueAsNumber)
                        }
                        aria-label="시험 시간"
                    />
                    <input
                        className="time-range freeze-range"
                        type="range"
                        min={0}
                        max={props.maxTimeLimitMin}
                        step={5}
                        value={props.freezeStartMin}
                        onChange={(event) =>
                            props.setRoomFreezeStartMin(event.currentTarget.valueAsNumber)
                        }
                        aria-label="프리즈 시작"
                    />
                </div>
            </div>
        </div>
    );
}

function JoinPanel(props: {
    roomCode: string;
    setRoomCode: (value: string) => void;
    canJoin: boolean;
    joinRoom: () => void;
}) {
    return (
        <div className="entry-action-panel join-panel entry-zone entry-zone-action">
            <div className="entry-panel-title">
                <span>입장 코드</span>
                <strong>방 코드를 입력하세요</strong>
            </div>
            <div className="omr-field code-field">
                <span>방 코드</span>
                <input
                    value={props.roomCode}
                    onChange={(event) => props.setRoomCode(event.target.value.toUpperCase())}
                    placeholder="ABCDE"
                />
            </div>
            <button
                className="omr-action join-action"
                disabled={!props.canJoin}
                onClick={props.joinRoom}
            >
                <LogIn size={18} />
                시험실 입장
            </button>
        </div>
    );
}
