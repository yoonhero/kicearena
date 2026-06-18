import { afterEach, describe, expect, it, vi } from "vitest";
import { sendCampaignEmailVerification } from "./campaignEmail.js";

const originalWebhookUrl = process.env.CAMPAIGN_EMAIL_VERIFICATION_WEBHOOK_URL;
const originalFetch = globalThis.fetch;

afterEach(() => {
    if (originalWebhookUrl === undefined) {
        delete process.env.CAMPAIGN_EMAIL_VERIFICATION_WEBHOOK_URL;
    } else {
        process.env.CAMPAIGN_EMAIL_VERIFICATION_WEBHOOK_URL = originalWebhookUrl;
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe("campaign email verification delivery", () => {
    it("reports missing provider configuration without failing registration", async () => {
        delete process.env.CAMPAIGN_EMAIL_VERIFICATION_WEBHOOK_URL;

        await expect(
            sendCampaignEmailVerification({
                email: "student@example.com",
                username: "student",
                code: "123456",
                expiresInSec: 1800,
            }),
        ).resolves.toBe("not-configured");
    });

    it("posts verification payloads to the configured webhook", async () => {
        process.env.CAMPAIGN_EMAIL_VERIFICATION_WEBHOOK_URL = "https://mailer.example/send";
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(
            sendCampaignEmailVerification({
                email: "student@example.com",
                username: "student",
                code: "123456",
                expiresInSec: 1800,
            }),
        ).resolves.toBe("sent");

        expect(fetchMock).toHaveBeenCalledWith(
            "https://mailer.example/send",
            expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: expect.stringContaining("123456"),
            }),
        );
    });
});
