import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferralLocationVerification } from "../../../shared/campaign";
import {
    hasStoredReferralLocationVerification,
    readAnyStoredReferralVerification,
    readStoredReferralVerification,
    saveReferralVerification,
} from "./referralVerification";

const storage = new Map<string, string>();

const createVerification = (
    overrides: Partial<ReferralLocationVerification> = {},
): ReferralLocationVerification => ({
    referralCode: "snu226",
    distanceKm: 0.4,
    verifiedAt: "2026-06-17T00:00:00.000Z",
    nickname: "수정",
    school: {
        id: "SNU-GWANAK",
        name: "서울대학교",
        region: "서울 관악구",
        address: "서울특별시 관악구 관악로 1",
        latitude: 37.4599,
        longitude: 126.9519,
    },
    ...overrides,
});

beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", {
        localStorage: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
});

describe("referral verification storage", () => {
    it("requires a nickname before treating a stored referral as an issued ticket", () => {
        saveReferralVerification(createVerification({ nickname: undefined }));

        expect(hasStoredReferralLocationVerification()).toBe(false);
        expect(readAnyStoredReferralVerification()).toBeNull();
        expect(readStoredReferralVerification("snu226")).toBeNull();
    });

    it("restores a complete stored referral for the matching code", () => {
        const verification = createVerification({ nickname: "응시" });
        saveReferralVerification(verification);

        expect(hasStoredReferralLocationVerification()).toBe(true);
        expect(readAnyStoredReferralVerification()).toEqual(verification);
        expect(readStoredReferralVerification("snu226")).toEqual(verification);
        expect(readStoredReferralVerification("other")).toBeNull();
    });
});
