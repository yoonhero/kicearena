import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, LocateFixed, TicketCheck } from "lucide-react";
import type { ReferralLocationVerification } from "../../../shared/campaign";
import {
    readStoredReferralVerification,
    saveReferralVerification,
} from "../lib/referralVerification";
import {
    shouldHandleDefaultSnuReferralInDev,
    verifyDefaultSnuReferralInDev,
} from "../lib/devReferralFallback";
import { ReferralNicknameOmr } from "./ReferralNicknameOmr";

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
    const mountedRef = useRef(true);
    const distanceLabel = useMemo(() => {
        if (!verification) return "";
        return `${verification.distanceKm.toFixed(2)}km`;
    }, [verification]);
    useEffect(
        () => () => {
            mountedRef.current = false;
        },
        [],
    );

    const verifyLocation = async () => {
        setError("");
        if (!nickname.trim()) {
            setError("성명을 먼저 정하세요.");
            return;
        }
        setStatus("위치 확인 중");
        setChecking(true);
        let timeout = 0;
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 12000,
                    maximumAge: 30000,
                });
            });
            const devFallback = verifyDefaultSnuReferralInDev(
                referralCode,
                position.coords.latitude,
                position.coords.longitude,
            );
            if (devFallback) {
                issueTicket(devFallback);
                return;
            }
            if (shouldHandleDefaultSnuReferralInDev(referralCode)) {
                setError("서울대학교 근처에서만 발급할 수 있습니다.");
                setStatus("");
                return;
            }
            const controller = new AbortController();
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
                setError(
                    response.status === 403
                        ? "이 위치에서는 학교 인증을 완료할 수 없습니다."
                        : "인증 서버가 실행 중인지 확인하세요.",
                );
                setStatus("");
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
            }
        } finally {
            if (timeout) window.clearTimeout(timeout);
            if (mountedRef.current) setChecking(false);
        }
    };

    const issueTicket = (nextVerification: ReferralLocationVerification) => {
        const ticket = { ...nextVerification, nickname: nickname.trim() };
        saveReferralVerification(ticket);
        setVerification(ticket);
        setStatus("수험표 발행 완료");
        window.setTimeout(() => {
            if (mountedRef.current) onVerified(ticket);
        }, 650);
    };

    return (
        <main className="referral-gate-layout">
            <section className="referral-gate-sheet">
                <div className="referral-gate-head">
                    <span>
                        <BadgeCheck size={16} />
                        응시표 발급
                    </span>
                    <strong>{verification ? "발급 완료" : referralCode}</strong>
                </div>

                {verification ? (
                    <div className="referral-school-card">
                        <TicketCheck size={20} />
                        <span>{verification.school.region}</span>
                        <strong>{verification.school.name}</strong>
                        <em>{distanceLabel}</em>
                    </div>
                ) : (
                    <>
                        <div className="referral-gate-copy">
                            <strong>성명을 정한 뒤 학교 위치를 확인하세요.</strong>
                            <span>인증이 끝나면 응시표가 이 기기에 저장됩니다.</span>
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
                    >
                        <TicketCheck size={18} />
                        응시표 확인
                    </button>
                )}
                <button type="button" className="referral-gate-exit" onClick={onExit}>
                    관전으로 보기
                </button>
                {status && <p className="campaign-status">{status}</p>}
                {error && <p className="error-text">{error}</p>}
            </section>
        </main>
    );
}
