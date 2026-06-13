import type { ReferralLocationVerification } from "../../../shared/campaign";

const REFERRAL_VERIFICATION_KEY = "kice-referral-location-verification";

export const readStoredReferralVerification = (
    referralCode: string,
): ReferralLocationVerification | null => {
    const raw = window.localStorage.getItem(REFERRAL_VERIFICATION_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as ReferralLocationVerification;
        return parsed.referralCode === referralCode ? parsed : null;
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
        return Boolean(parsed.referralCode && parsed.school?.id);
    } catch {
        return false;
    }
};
