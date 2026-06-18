export type EmailVerificationDelivery = "sent" | "not-configured" | "failed";

export type EmailVerificationMessage = {
    email: string;
    username: string;
    code: string;
    expiresInSec: number;
};

const webhookUrl = () => process.env.CAMPAIGN_EMAIL_VERIFICATION_WEBHOOK_URL?.trim() ?? "";

export const sendCampaignEmailVerification = async ({
    email,
    username,
    code,
    expiresInSec,
}: EmailVerificationMessage): Promise<EmailVerificationDelivery> => {
    const url = webhookUrl();
    if (!url) {
        if (process.env.NODE_ENV !== "production") {
            console.info(`[campaign-email] ${username} ${email} verification code: ${code}`);
        }
        return "not-configured";
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                to: email,
                template: "campaign-email-verification",
                data: {
                    username,
                    code,
                    expiresInSec,
                },
            }),
        });
        return response.ok ? "sent" : "failed";
    } catch {
        return "failed";
    }
};
