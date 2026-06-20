import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Copy, LocateFixed, School, TicketCheck } from "lucide-react";
import type { ReferralLocationVerification } from "../../../shared/campaign";
import {
    readStoredReferralVerification,
    saveReferralVerification,
} from "../lib/referralVerification";
import { writeClipboard } from "../lib/appFlow";
import { verifyDefaultSnuReferralInDev } from "../lib/devReferralFallback";
import { ReferralNicknameOmr } from "./ReferralNicknameOmr";

type RevealStage = "idle" | "locating" | "matched" | "issued";

export function ReferralSchoolGate({
    referralCode,
    onVerified,
    onExit,
}: {
    referralCode: string;
    onVerified: (verification: ReferralLocationVerification) => void;
    onExit: () => void;
}) {
    const [verification, setVerification] = useState<ReferralLocationVerification | null>(() =>
        readStoredReferralVerification(referralCode),
    );
    const [nickname, setNickname] = useState(() => verification?.nickname ?? "");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const [copiedInviteUrl, setCopiedInviteUrl] = useState(false);
    const [revealStage, setRevealStage] = useState<RevealStage>(() =>
        verification ? "issued" : "idle",
    );
    const mountedRef = useRef(true);
    const checkingRef = useRef(false);
    const verifyAbortRef = useRef<AbortController | null>(null);
    const revealTimersRef = useRef<number[]>([]);
    const distanceLabel = useMemo(() => {
        if (!verification) return "";
        return `${verification.distanceKm.toFixed(2)}km`;
    }, [verification]);
    const inviteUrl = useMemo(() => {
        const url = new URL(window.location.href);
        url.pathname = "/";
        url.search = "";
        url.hash = "";
        url.searchParams.set("c", referralCode);
        return url.toString();
    }, [referralCode]);
    const clearRevealTimers = () => {
        revealTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        revealTimersRef.current = [];
    };
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            verifyAbortRef.current?.abort();
            clearRevealTimers();
        };
    }, []);

    const verifyLocation = async () => {
        if (checkingRef.current) return;
        setError("");
        if (!nickname.trim()) {
            setError("성명을 먼저 정하세요.");
            return;
        }
        setStatus("위치 확인 중");
        setChecking(true);
        checkingRef.current = true;
        setRevealStage("locating");
        let timeout = 0;
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 12000,
                    maximumAge: 30000,
                });
            });
            if (!mountedRef.current) return;
            const controller = new AbortController();
            verifyAbortRef.current = controller;
            timeout = window.setTimeout(() => controller.abort(), 10000);
            const response = await fetch("/api/campaign/referral-location-verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    referralCode,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                }),
            });
            if (!mountedRef.current) return;
            if (!response.ok) {
                const devFallback = verifyDefaultSnuReferralInDev(
                    referralCode,
                    position.coords.latitude,
                    position.coords.longitude,
                );
                if (devFallback) {
                    issueTicket(devFallback);
                    return;
                }
                setError(
                    response.status === 403
                        ? "이 위치에서는 학교 인증을 완료할 수 없습니다."
                        : "인증 서버가 실행 중인지 확인하세요.",
                );
                setStatus("");
                setRevealStage("idle");
                return;
            }
            const nextVerification = (await response.json()) as ReferralLocationVerification;
            issueTicket(nextVerification);
        } catch (error) {
            if (mountedRef.current) {
                setError(
                    error instanceof DOMException && error.name === "AbortError"
                        ? "인증 요청이 지연되고 있습니다. 다시 시도하세요."
                        : "브라우저 위치 권한을 허용해야 인증할 수 있습니다.",
                );
                setStatus("");
                setRevealStage("idle");
            }
        } finally {
            if (timeout) window.clearTimeout(timeout);
            verifyAbortRef.current = null;
            checkingRef.current = false;
            if (mountedRef.current) setChecking(false);
        }
    };

    const issueTicket = (nextVerification: ReferralLocationVerification) => {
        const ticket = { ...nextVerification, nickname: nickname.trim() };
        clearRevealTimers();
        setVerification(ticket);
        setRevealStage("matched");
        setStatus(`${ticket.school.name} 확인`);
        const saveTimer = window.setTimeout(() => {
            if (!mountedRef.current) return;
            saveReferralVerification(ticket);
            setRevealStage("issued");
            setStatus("수험표 발행 완료");
        }, 1050);
        revealTimersRef.current = [saveTimer];
    };

    const revealStepClass = (stage: RevealStage) => {
        const stageOrder: Record<RevealStage, number> = {
            idle: 0,
            locating: 1,
            matched: 2,
            issued: 3,
        };
        if (revealStage === stage) return "is-active";
        return stageOrder[revealStage] > stageOrder[stage] ? "is-complete" : "";
    };
    const ticketReady = verification && revealStage === "issued";
    const copyInviteUrl = async () => {
        await writeClipboard(inviteUrl);
        setCopiedInviteUrl(true);
        window.setTimeout(() => setCopiedInviteUrl(false), 1200);
    };

    return (
        <main className="referral-gate-layout">
            <section className="referral-gate-sheet" aria-labelledby="referral-gate-title">
                <div className="referral-gate-head">
                    <span>
                        <BadgeCheck size={16} />
                        수험표 발급
                    </span>
                    <strong>{ticketReady ? "발급 완료" : referralCode}</strong>
                </div>
                <h1 id="referral-gate-title">초대 링크 확인</h1>
                <div className="referral-invite-url">
                    <span>초대 URL</span>
                    <code>{inviteUrl}</code>
                    <button type="button" onClick={() => void copyInviteUrl()}>
                        <Copy size={16} />
                        {copiedInviteUrl ? "복사됨" : "복사"}
                    </button>
                </div>

                {(verification || revealStage === "locating") && (
                    <div
                        className={`referral-reveal-meter referral-reveal-meter-${revealStage}`}
                        aria-hidden="true"
                    >
                        <span className={revealStepClass("locating")}>위치 확인</span>
                        <span className={revealStepClass("matched")}>학교 확인</span>
                        <span className={revealStepClass("issued")}>수험표 발급</span>
                    </div>
                )}

                {verification ? (
                    <div className={`referral-school-reveal referral-school-reveal-${revealStage}`}>
                        <div className="referral-school-card">
                            <School size={22} />
                            <span>{verification.school.region}</span>
                            <strong>{verification.school.name}</strong>
                            <em>{distanceLabel}</em>
                        </div>
                        <div className="referral-ticket-stamp" aria-hidden="true">
                            <TicketCheck size={18} />
                            <span>{ticketReady ? "발급 완료" : "학교 확인"}</span>
                        </div>
                        {ticketReady && (
                            <div className="referral-entry-brief">
                                <span>입장 준비 완료</span>
                                <strong>{verification.nickname} 수험표가 발급되었습니다.</strong>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="referral-gate-copy">
                            <strong>성명을 정한 뒤 학교 위치를 확인하세요.</strong>
                            <span>인증이 끝나면 수험표가 이 기기에 저장됩니다.</span>
                        </div>
                        <ReferralNicknameOmr nickname={nickname} setNickname={setNickname} />
                    </>
                )}

                {!verification ? (
                    <button
                        type="button"
                        className="omr-action referral-gate-action"
                        onClick={() => void verifyLocation()}
                        disabled={!nickname.trim() || checking}
                    >
                        <LocateFixed size={18} />
                        {checking ? "확인 중" : "위치 확인"}
                    </button>
                ) : (
                    <button
                        type="button"
                        className="omr-action referral-gate-action"
                        onClick={() => onVerified(verification)}
                        disabled={!ticketReady}
                    >
                        <TicketCheck size={18} />
                        {ticketReady ? "회원가입" : "발급 중"}
                    </button>
                )}
                <button type="button" className="referral-gate-exit" onClick={onExit}>
                    대회 목록 보기
                </button>
                {status && <p className="campaign-status">{status}</p>}
                {error && <p className="error-text">{error}</p>}
            </section>
        </main>
    );
}
