import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, LocateFixed, LogIn, School } from "lucide-react";
import type { ReferralLocationVerification } from "../../../shared/campaign";
import {
    readStoredReferralVerification,
    saveReferralVerification,
} from "../lib/referralVerification";

export function ReferralSchoolGate({
    referralCode,
    onVerified,
    onExit,
}: {
    referralCode: string;
    onVerified: () => void;
    onExit: () => void;
}) {
    const [verification, setVerification] = useState<ReferralLocationVerification | null>(() =>
        readStoredReferralVerification(referralCode),
    );
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
        setStatus("위치 확인 중");
        setChecking(true);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 12000,
                    maximumAge: 30000,
                });
            });
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
                        : "인증 요청을 처리하지 못했습니다.",
                );
                setStatus("");
                return;
            }
            const nextVerification = (await response.json()) as ReferralLocationVerification;
            saveReferralVerification(nextVerification);
            setVerification(nextVerification);
            setStatus("인증 완료");
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
            window.clearTimeout(timeout);
            if (mountedRef.current) setChecking(false);
        }
    };

    return (
        <main className="referral-gate-layout">
            <section className="referral-gate-sheet">
                <div className="referral-gate-head">
                    <span>
                        <BadgeCheck size={16} />
                        학교 위치 확인
                    </span>
                    <strong>{verification ? "인증 완료" : "입장 전 확인"}</strong>
                </div>

                {verification ? (
                    <div className="referral-school-card">
                        <School size={20} />
                        <span>{verification.school.region}</span>
                        <strong>{verification.school.name}</strong>
                        <em>{distanceLabel}</em>
                    </div>
                ) : (
                    <div className="referral-gate-copy">
                        <strong>학교 근처에서 추천 인증을 완료하세요.</strong>
                        <span>인증 후 계정으로 로그인하면 이후 대회에 참가할 수 있습니다.</span>
                    </div>
                )}

                {!verification ? (
                    <button
                        type="button"
                        className="omr-action referral-gate-action"
                        onClick={() => void verifyLocation()}
                        disabled={checking}
                    >
                        <LocateFixed size={18} />
                        {checking ? "확인 중" : "위치 확인"}
                    </button>
                ) : (
                    <button
                        type="button"
                        className="omr-action referral-gate-action"
                        onClick={onVerified}
                    >
                        <LogIn size={18} />
                        로그인하고 참가
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
