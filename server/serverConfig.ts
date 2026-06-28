import crypto from "node:crypto";
import fs from "node:fs";

const readMetricsBearerToken = () => {
    const inlineToken = process.env.METRICS_BEARER_TOKEN?.trim();
    if (inlineToken) return inlineToken;

    const tokenFile = process.env.METRICS_BEARER_TOKEN_FILE?.trim();
    if (!tokenFile) return "";

    try {
        return fs.readFileSync(tokenFile, "utf8").trim();
    } catch (error) {
        console.warn(`Unable to read metrics bearer token file: ${tokenFile}`, error);
        return "";
    }
};

export const serverConfig = {
    port: Number(process.env.PORT ?? 3001),
    metricsBearerToken: readMetricsBearerToken(),
    adminToken: process.env.ADMIN_TOKEN?.trim() ?? "",
    campaignAuthCookieName: "kice_campaign_auth",
    campaignAuthCookieMaxAgeSec: 7 * 24 * 60 * 60,
    referralWhitelist: (process.env.CAMPAIGN_REFERRAL_WHITELIST ?? "")
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    campaignLocationRadiusKm: Math.max(
        0.2,
        Math.min(20, Number(process.env.CAMPAIGN_LOCATION_RADIUS_KM) || 3),
    ),
    allowedOrigins: (process.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
};

export const campaignAuthSecret =
    process.env.CAMPAIGN_AUTH_SECRET?.trim() ||
    (process.env.NODE_ENV === "production"
        ? ""
        : serverConfig.adminToken || crypto.randomBytes(32).toString("base64url"));

export const roomTtl = {
    emptyLobbyMs: 10 * 60 * 1000,
    disconnectedLobbyMs: 30 * 60 * 1000,
    finishedMs: 30 * 60 * 1000,
} as const;

export const rateLimitMs = {
    ready: 200,
    problemSet: 150,
    answerSubmit: 500,
    itemUse: 300,
    revealNext: 250,
} as const;
