import type { ExamSummary } from "../../../shared/game";
import { formatReportDate } from "../lib/format";
import { HomeEntryActions } from "./HomeEntryActions";
import { HomeNameEntry } from "./HomeNameEntry";

export function HomeScreen(props: {
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
                    <HomeNameEntry
                        nickname={props.nickname}
                        setNickname={props.setNickname}
                        inviteMode={props.inviteMode}
                        inviteRoomCode={props.inviteRoomCode}
                        joiningInvite={props.joiningInvite}
                        joinInviteRoom={props.joinInviteRoom}
                        exitInviteMode={props.exitInviteMode}
                    />
                    {!props.inviteMode && (
                        <HomeEntryActions
                            exams={props.exams}
                            selectedExamId={props.selectedExamId}
                            setSelectedExamId={props.setSelectedExamId}
                            timeLimitMin={props.timeLimitMin}
                            setTimeLimitMin={props.setTimeLimitMin}
                            freezeBeforeMin={props.freezeBeforeMin}
                            setFreezeBeforeMin={props.setFreezeBeforeMin}
                            itemEnabled={props.itemEnabled}
                            setItemEnabled={props.setItemEnabled}
                            nickname={props.nickname}
                            roomCode={props.roomCode}
                            setRoomCode={props.setRoomCode}
                            createRoom={props.createRoom}
                            joinRoom={props.joinRoom}
                        />
                    )}
                    {props.error && <p className="error-text">{props.error}</p>}
                </div>
            </section>
        </main>
    );
}
