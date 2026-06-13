import { useState } from "react";
import type { AppScreen } from "../components/AppRoutes";
import { hasStoredReferralLocationVerification } from "../lib/referralVerification";

const readReferralCode = () =>
    new URLSearchParams(window.location.search).get("c")?.trim().toLowerCase() ?? "";

export function useReferralGateState(screen: AppScreen) {
    const [referralCode, setReferralCode] = useState(readReferralCode);
    const [referralGatePassed, setReferralGatePassed] = useState(() => !readReferralCode());
    const [hasReferralVerification, setHasReferralVerification] = useState(
        hasStoredReferralLocationVerification,
    );
    const needsReferralGate = screen === "home" && Boolean(referralCode) && !referralGatePassed;

    const completeReferralGate = () => {
        setReferralGatePassed(true);
        setHasReferralVerification(true);
    };

    const exitReferralGate = () => {
        setReferralCode("");
        setReferralGatePassed(true);
        const url = new URL(window.location.href);
        url.searchParams.delete("c");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    };

    return {
        referralCode,
        needsReferralGate,
        hasReferralVerification,
        completeReferralGate,
        exitReferralGate,
    };
}
