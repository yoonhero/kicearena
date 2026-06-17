import {
    DEFAULT_SNU_REFERRAL_CODE,
    DEFAULT_SNU_REFERRAL_SCHOOL_ID,
    type ReferralLocationVerification,
} from "../../../shared/campaign";

const SNU_LOCATION = {
    latitude: 37.4599,
    longitude: 126.9519,
};
const DEV_SNU_RADIUS_KM = 3;
const isDevRuntime = () =>
    Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

export const shouldHandleDefaultSnuReferralInDev = (referralCode: string) =>
    isDevRuntime() && referralCode === DEFAULT_SNU_REFERRAL_CODE;

const distanceKm = (from: typeof SNU_LOCATION, to: typeof SNU_LOCATION) => {
    const lat1 = (from.latitude * Math.PI) / 180;
    const lat2 = (to.latitude * Math.PI) / 180;
    const deltaLat = ((to.latitude - from.latitude) * Math.PI) / 180;
    const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;
    const a =
        Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const verifyDefaultSnuReferralInDev = (
    referralCode: string,
    latitude: number,
    longitude: number,
): ReferralLocationVerification | null => {
    if (!shouldHandleDefaultSnuReferralInDev(referralCode)) return null;
    const distance = distanceKm(SNU_LOCATION, { latitude, longitude });
    if (distance > DEV_SNU_RADIUS_KM) return null;
    return {
        referralCode,
        distanceKm: Math.round(distance * 100) / 100,
        verifiedAt: new Date().toISOString(),
        school: {
            id: DEFAULT_SNU_REFERRAL_SCHOOL_ID,
            name: "서울대학교",
            region: "서울 관악구",
            address: "서울특별시 관악구 관악로 1",
            latitude: SNU_LOCATION.latitude,
            longitude: SNU_LOCATION.longitude,
        },
    };
};
