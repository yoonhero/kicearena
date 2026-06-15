import { useState } from "react";
import type { ReferralLocationVerification } from "../../../shared/campaign";
import type { AppScreen } from "../components/AppRoutes";
import {
    hasStoredReferralLocationVerification,
    readAnyStoredReferralVerification,
} from "../lib/referralVerification";

const readReferralCode = () =>
    new URLSearchParams(window.location.search).get("c")?.trim().toLowerCase() ?? "";

export function useReferralGateState(screen: AppScreen) {
    const [referralCode, setReferralCode] = useState(readReferralCode);
    const [referralGatePassed, setReferralGatePassed] = useState(() => !readReferralCode());
    const [hasReferralVerification, setHasReferralVerification] = useState(
        hasStoredReferralLocationVerification,
    );
    const [referralVerification, setReferralVerification] = useState(
        readAnyStoredReferralVerification,
    );
    const needsReferralGate = screen === "home" && Boolean(referralCode) && !referralGatePassed;

    const completeReferralGate = (verification?: ReferralLocationVerification) => {
        setReferralGatePassed(true);
        setHasReferralVerification(true);
        if (verification) setReferralVerification(verification);
    };

    const exitReferralGate = () => {
        setReferralCode("");
        setReferralGatePassed(true);
        setReferralVerification(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("c");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    };

    return {
        referralCode,
        needsReferralGate,
        hasReferralVerification,
        referralVerification,
        completeReferralGate,
        exitReferralGate,
    };
}
