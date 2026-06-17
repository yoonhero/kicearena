import type { ReferralLocationVerification } from "../../../shared/campaign";

const REFERRAL_VERIFICATION_KEY = "kice-referral-location-verification";

const isCompleteReferralVerification = (
    verification: ReferralLocationVerification | null,
): verification is ReferralLocationVerification =>
    Boolean(verification?.referralCode && verification.school?.id && verification.nickname?.trim());

export const readStoredReferralVerification = (
    referralCode: string,
): ReferralLocationVerification | null => {
    const raw = window.localStorage.getItem(REFERRAL_VERIFICATION_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as ReferralLocationVerification;
        return parsed.referralCode === referralCode && isCompleteReferralVerification(parsed)
            ? parsed
            : null;
    } catch {
        return null;
    }
};

export const readAnyStoredReferralVerification = (): ReferralLocationVerification | null => {
    const raw = window.localStorage.getItem(REFERRAL_VERIFICATION_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as ReferralLocationVerification;
        return isCompleteReferralVerification(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

export const saveReferralVerification = (verification: ReferralLocationVerification) => {
    window.localStorage.setItem(REFERRAL_VERIFICATION_KEY, JSON.stringify(verification));
};

export const hasStoredReferralLocationVerification = () => {
    const raw = window.localStorage.getItem(REFERRAL_VERIFICATION_KEY);
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw) as ReferralLocationVerification;
        return isCompleteReferralVerification(parsed);
    } catch {
        return false;
    }
};
