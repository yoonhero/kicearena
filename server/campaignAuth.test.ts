import { describe, expect, it } from "vitest";
import { createCampaignAuthToken, verifyCampaignAuthToken } from "./campaignAuth.js";

const user = {
    id: "user-1",
    username: "student1",
    studentStatus: "g3" as const,
    school: {
        id: "school-1",
        name: "KICE High",
        region: "Seoul",
        address: "1 Test-ro",
        latitude: 37.5,
        longitude: 127,
    },
    referralCode: "abc234",
    referralAllowed: true,
    badgeLabel: "KICE High 대표",
};

describe("campaign auth tokens", () => {
    it("signs and verifies a campaign user identity", () => {
        const token = createCampaignAuthToken(user, "secret", 1_000, 10_000);

        expect(verifyCampaignAuthToken(token, "secret", 2_000)).toMatchObject({
            sub: "user-1",
            username: "student1",
        });
    });

    it("rejects tampered, expired, and wrong-secret tokens", () => {
        const token = createCampaignAuthToken(user, "secret", 1_000, 10_000);
        const tampered = `${token.slice(0, -1)}x`;

        expect(verifyCampaignAuthToken(tampered, "secret", 2_000)).toBeNull();
        expect(verifyCampaignAuthToken(token, "other-secret", 2_000)).toBeNull();
        expect(verifyCampaignAuthToken(token, "secret", 12_000)).toBeNull();
    });
});
