import { useEffect, useState } from "react";
import type { ExamSummary, RoomPublic } from "../../../shared/game";

type EmitWithAck = <T>(
    event: string,
    payload?: unknown,
) => Promise<{ ok: boolean; data?: T; error?: string }>;

export function usePracticeRoomFlow({
    emitWithAck,
    nickname,
    roomCode,
    setError,
    setRoom,
    setRoomCode,
}: {
    emitWithAck: EmitWithAck;
    nickname: string;
    roomCode: string;
    setError: (value: string) => void;
    setRoom: (room: RoomPublic) => void;
    setRoomCode: (value: string) => void;
}) {
    const [exams, setExams] = useState<ExamSummary[]>([]);
    const [selectedExamId, setSelectedExamIdState] = useState("");
    const [timeLimitMin, setTimeLimitMin] = useState(40);
    const [freezeBeforeMin, setFreezeBeforeMin] = useState(20);
    const [itemEnabled, setItemEnabled] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const loadExams = async (attempt = 0) => {
            try {
                const res = await fetch("/api/exams");
                if (!res.ok) throw new Error(`exams:${res.status}`);
                const data = (await res.json()) as ExamSummary[];
                if (cancelled) return;
                setExams(data);
                const firstExam = data[0];
                if (!firstExam) return;
                setSelectedExamIdState((current) => current || firstExam.id);
                setTimeLimitMin(Math.round(firstExam.timeLimitSec / 60));
                setFreezeBeforeMin(Math.round(firstExam.freezeBeforeSec / 60));
            } catch (error) {
                if (cancelled) return;
                if (attempt < 3) {
                    window.setTimeout(() => void loadExams(attempt + 1), 500);
                    return;
                }
                if (!cancelled) {
                    setError("문제지 목록을 불러오지 못했습니다.");
                    console.warn("Failed to load exams", error);
                }
            }
        };
        void loadExams();
        return () => {
            cancelled = true;
        };
    }, [setError]);

    const setSelectedExamId = (examId: string) => {
        setSelectedExamIdState(examId);
        const exam = exams.find((candidate) => candidate.id === examId);
        if (!exam) return;
        setTimeLimitMin(Math.round(exam.timeLimitSec / 60));
        setFreezeBeforeMin(Math.round(exam.freezeBeforeSec / 60));
    };

    const createRoom = async () => {
        setError("");
        const response = await emitWithAck<RoomPublic>("room:create", {
            examId: selectedExamId,
            nickname,
            timeLimitSec: timeLimitMin * 60,
            freezeBeforeSec: freezeBeforeMin * 60,
            itemEnabled,
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
            code: roomCode.trim().toUpperCase(),
            nickname,
        });
        if (!response.ok || !response.data) {
            setError(response.error ?? "입장 실패");
            return;
        }
        setRoom(response.data);
    };

    return {
        createRoom,
        exams,
        freezeBeforeMin,
        itemEnabled,
        joinRoom,
        selectedExamId,
        setFreezeBeforeMin,
        setItemEnabled,
        setSelectedExamId,
        setTimeLimitMin,
        timeLimitMin,
    };
}
