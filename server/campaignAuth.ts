import crypto from "node:crypto";
import type { CampaignUserPublic } from "../shared/campaign.js";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CampaignAuthClaims = {
    sub: string;
    username: string;
    exp: number;
};

type ReferralVerificationClaims = {
    referralCode: string;
    schoolId: string;
    exp: number;
};

const REFERRAL_TOKEN_VERSION = "rv1";
const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const sign = (payload: string, secret: string) =>
    crypto.createHmac("sha256", secret).update(payload).digest("base64url");

const hasSameSignature = (left: string, right: string) => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
        leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
};

const isValidReferralCode = (value: unknown): value is string =>
    typeof value === "string" && /^[2-9a-z]{4,32}$/.test(value);

const isValidSchoolId = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= 80;

const isValidExpiry = (value: unknown, now: number): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= now;

export const createCampaignAuthToken = (
    user: CampaignUserPublic,
    secret: string,
    now = Date.now(),
    ttlMs = DEFAULT_TTL_MS,
) => {
    if (!secret) throw new Error("Campaign auth secret is not configured.");
    const claims: CampaignAuthClaims = {
        sub: user.id,
        username: user.username,
        exp: now + ttlMs,
    };
    const payload = encode(JSON.stringify(claims));
    return `${TOKEN_VERSION}.${payload}.${sign(payload, secret)}`;
};

export const verifyCampaignAuthToken = (
    token: string | undefined,
    secret: string,
    now = Date.now(),
): CampaignAuthClaims | null => {
    if (!token || !secret) return null;
    const [version, payload, signature, extra] = token.split(".");
    if (version !== TOKEN_VERSION || !payload || !signature || extra !== undefined) return null;
    if (!hasSameSignature(signature, sign(payload, secret))) return null;

    try {
        const claims = JSON.parse(decode(payload)) as Partial<CampaignAuthClaims>;
        if (!claims.sub || !claims.username || !claims.exp) return null;
        if (!/^[a-z0-9._-]{3,32}$/.test(claims.username)) return null;
        if (!Number.isFinite(claims.exp) || claims.exp < now) return null;
        return {
            sub: claims.sub,
            username: claims.username,
            exp: claims.exp,
        };
    } catch {
        return null;
    }
};

export const createReferralVerificationToken = (
    referralCode: string,
    schoolId: string,
    secret: string,
    now = Date.now(),
    ttlMs = DEFAULT_TTL_MS,
) => {
    if (!secret) throw new Error("Campaign auth secret is not configured.");
    const claims: ReferralVerificationClaims = {
        referralCode,
        schoolId,
        exp: now + ttlMs,
    };
    const payload = encode(JSON.stringify(claims));
    return `${REFERRAL_TOKEN_VERSION}.${payload}.${sign(payload, secret)}`;
};

export const verifyReferralVerificationToken = (
    token: string | undefined,
    secret: string,
    now = Date.now(),
): ReferralVerificationClaims | null => {
    if (!token || !secret) return null;
    const [version, payload, signature, extra] = token.split(".");
    if (version !== REFERRAL_TOKEN_VERSION || !payload || !signature || extra !== undefined) {
        return null;
    }
    if (!hasSameSignature(signature, sign(payload, secret))) return null;

    try {
        const claims = JSON.parse(decode(payload)) as Partial<ReferralVerificationClaims>;
        if (
            !isValidReferralCode(claims.referralCode) ||
            !isValidSchoolId(claims.schoolId) ||
            !isValidExpiry(claims.exp, now)
        ) {
            return null;
        }
        return {
            referralCode: claims.referralCode,
            schoolId: claims.schoolId,
            exp: claims.exp,
        };
    } catch {
        return null;
    }
};
