import type express from "express";
import { normalizeStudentStatus } from "../shared/campaign.js";
import { createCampaignAuthToken, createReferralVerificationToken } from "./campaignAuth.js";
import {
    attachReferralConversion,
    createCampaignUser,
    readCampaignUserByUsername,
    readReferralWhitelistSchool,
    recordReferralVisit,
    searchHighSchools,
    verifyCampaignUserEmail,
} from "./campaignDatabase.js";
import { sendCampaignEmailVerification } from "./campaignEmail.js";
import type { ExamCatalogDatabase } from "./examDatabase.js";
import { findHighSchoolNearLocation } from "./highSchoolGeo.js";
import type { HttpRateLimitStore } from "./httpRateLimit.js";
import {
    createEmailVerificationCode,
    hashEmailVerificationCode,
    hashPassword,
    isValidEmail,
    normalizeEmail,
    readString,
    shouldRateLimitHttpRequest,
    verifyPassword,
    visitorFingerprint,
} from "./requestUtils.js";

const campaignAuthCookie = ({
    cookieName,
    maxAgeSec,
    token,
}: {
    cookieName: string;
    maxAgeSec: number;
    token: string;
}) => {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
};

export const registerCampaignRoutes = ({
    app,
    getDb,
    campaignAuthSecret,
    campaignAuthCookieName,
    campaignAuthCookieMaxAgeSec,
    campaignLocationRadiusKm,
    httpRateLimitStore,
}: {
    app: express.Express;
    getDb: () => ExamCatalogDatabase | null;
    campaignAuthSecret: string;
    campaignAuthCookieName: string;
    campaignAuthCookieMaxAgeSec: number;
    campaignLocationRadiusKm: number;
    httpRateLimitStore: HttpRateLimitStore;
}) => {
    const setCampaignAuthCookie = (
        res: express.Response,
        user: Parameters<typeof createCampaignAuthToken>[0],
    ) => {
        res.setHeader(
            "Set-Cookie",
            campaignAuthCookie({
                cookieName: campaignAuthCookieName,
                maxAgeSec: campaignAuthCookieMaxAgeSec,
                token: createCampaignAuthToken(user, campaignAuthSecret),
            }),
        );
    };

    app.get("/api/schools", async (req, res) => {
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        const query = readString(req.query.q, 80);
        res.json(await searchHighSchools(db, query));
    });

    app.post("/api/campaign/referral-visit", async (req, res) => {
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        const referralCode = readString(req.body?.referralCode, 32).toLowerCase();
        if (!/^[2-9a-z]{4,32}$/.test(referralCode)) {
            res.status(400).json({ error: "Invalid referral code." });
            return;
        }
        if (!(await readReferralWhitelistSchool(db, referralCode))) {
            res.status(403).json({ error: "Referral code is not whitelisted." });
            return;
        }
        await recordReferralVisit(db, referralCode, visitorFingerprint(req));
        res.json({ ok: true });
    });

    app.post("/api/campaign/referral-location-verify", async (req, res) => {
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        if (!campaignAuthSecret) {
            res.status(503).json({ error: "Campaign auth is not configured." });
            return;
        }
        const referralCode = readString(req.body?.referralCode, 32).toLowerCase();
        const latitude = Number(req.body?.latitude);
        const longitude = Number(req.body?.longitude);
        if (
            !/^[2-9a-z]{4,32}$/.test(referralCode) ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < 33 ||
            latitude > 39 ||
            longitude < 124 ||
            longitude > 132
        ) {
            res.status(400).json({ error: "Invalid location verification payload." });
            return;
        }
        const allowedSchool = await readReferralWhitelistSchool(db, referralCode);
        if (!allowedSchool) {
            res.status(403).json({ error: "Referral code is not whitelisted." });
            return;
        }
        const verified = await findHighSchoolNearLocation(
            db,
            allowedSchool.id,
            latitude,
            longitude,
            campaignLocationRadiusKm,
        );
        if (!verified) {
            res.status(403).json({ error: "This referral code is not valid for this location." });
            return;
        }
        await recordReferralVisit(db, referralCode, visitorFingerprint(req));
        res.json({
            referralCode,
            school: verified.school,
            distanceKm: Math.round(verified.distanceKm * 100) / 100,
            verifiedAt: new Date().toISOString(),
            verificationToken: createReferralVerificationToken(
                referralCode,
                verified.school.id,
                campaignAuthSecret,
            ),
        });
    });

    // eslint-disable-next-line complexity
    app.post("/api/campaign/register", async (req, res) => {
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        if (!campaignAuthSecret) {
            res.status(503).json({ error: "Campaign auth is not configured." });
            return;
        }
        const username = readString(req.body?.username, 32).toLowerCase();
        const email = normalizeEmail(req.body?.email);
        const password = readString(req.body?.password, 120);
        const schoolId = readString(req.body?.schoolId, 80);
        const referredByCode = readString(req.body?.referredByCode, 32).toLowerCase() || null;
        const termsAccepted = req.body?.termsAccepted === true;
        const privacyAccepted = req.body?.privacyAccepted === true;
        const marketingEmailConsent = req.body?.marketingEmailConsent === true;
        const paymentMeta =
            req.body?.paymentMeta && typeof req.body.paymentMeta === "object"
                ? (req.body.paymentMeta as Record<string, unknown>)
                : {};

        if (
            !/^[a-z0-9._-]{3,32}$/.test(username) ||
            !isValidEmail(email) ||
            password.length < 8 ||
            !schoolId ||
            !termsAccepted ||
            !privacyAccepted
        ) {
            res.status(400).json({ error: "Invalid campaign registration payload." });
            return;
        }
        if (
            shouldRateLimitHttpRequest({
                store: httpRateLimitStore,
                req,
                scope: "campaign-register",
                identity: username,
                limit: 5,
                windowMs: 10 * 60 * 1000,
            })
        ) {
            res.status(429).json({ error: "Too many registration attempts. Try again later." });
            return;
        }
        if (referredByCode) {
            const allowedSchool = await readReferralWhitelistSchool(db, referredByCode);
            if (!allowedSchool || allowedSchool.id !== schoolId) {
                res.status(403).json({ error: "Referral code is not valid for this school." });
                return;
            }
        }

        try {
            const emailVerificationCode = createEmailVerificationCode();
            const emailVerificationExpiresInSec = 30 * 60;
            const acceptedAt = new Date().toISOString();
            const user = await createCampaignUser(db, {
                username,
                email,
                passwordHash: hashPassword(password),
                studentStatus: normalizeStudentStatus(req.body?.studentStatus),
                marketingEmailConsent,
                termsAcceptedAt: acceptedAt,
                privacyAcceptedAt: acceptedAt,
                emailVerificationCodeHash: hashEmailVerificationCode(
                    username,
                    emailVerificationCode,
                ),
                emailVerificationExpiresAt: new Date(
                    Date.now() + emailVerificationExpiresInSec * 1000,
                ).toISOString(),
                schoolId,
                paymentMeta,
                referredByCode,
            });
            if (referredByCode) {
                await attachReferralConversion(
                    db,
                    referredByCode,
                    user.id,
                    visitorFingerprint(req),
                );
            }
            const emailDelivery = await sendCampaignEmailVerification({
                email: user.email,
                username: user.username,
                code: emailVerificationCode,
                expiresInSec: emailVerificationExpiresInSec,
            });
            setCampaignAuthCookie(res, user);
            res.status(201).json({
                user,
                emailVerification: {
                    required: true,
                    email: user.email,
                    expiresInSec: emailVerificationExpiresInSec,
                    delivery: emailDelivery,
                    devCode:
                        process.env.NODE_ENV === "production" ? undefined : emailVerificationCode,
                },
            });
        } catch (error) {
            const code =
                typeof error === "object" && error && "code" in error
                    ? String((error as { code?: unknown }).code)
                    : "";
            if (code === "23505") {
                res.status(409).json({ error: "Username or email already exists." });
                return;
            }
            if (code === "23503") {
                res.status(400).json({ error: "Unknown school." });
                return;
            }
            throw error;
        }
    });

    app.post("/api/campaign/verify-email", async (req, res) => {
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        if (!campaignAuthSecret) {
            res.status(503).json({ error: "Campaign auth is not configured." });
            return;
        }
        const username = readString(req.body?.username, 32).toLowerCase();
        const code = readString(req.body?.code, 12).replace(/\D/g, "");
        if (!/^[a-z0-9._-]{3,32}$/.test(username) || !/^\d{6}$/.test(code)) {
            res.status(400).json({ error: "Invalid email verification payload." });
            return;
        }
        if (
            shouldRateLimitHttpRequest({
                store: httpRateLimitStore,
                req,
                scope: "campaign-email-verify",
                identity: username,
                limit: 8,
                windowMs: 10 * 60 * 1000,
            })
        ) {
            res.status(429).json({ error: "Too many verification attempts. Try again later." });
            return;
        }
        const user = await verifyCampaignUserEmail(
            db,
            username,
            hashEmailVerificationCode(username, code),
            new Date().toISOString(),
        );
        if (!user) {
            res.status(400).json({ error: "Invalid or expired email verification code." });
            return;
        }
        setCampaignAuthCookie(res, user);
        res.json(user);
    });

    app.post("/api/campaign/login", async (req, res) => {
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        if (!campaignAuthSecret) {
            res.status(503).json({ error: "Campaign auth is not configured." });
            return;
        }
        const username = readString(req.body?.username, 32).toLowerCase();
        const password = readString(req.body?.password, 120);
        if (
            shouldRateLimitHttpRequest({
                store: httpRateLimitStore,
                req,
                scope: "campaign-login",
                identity: username || "unknown",
                limit: 8,
                windowMs: 10 * 60 * 1000,
            })
        ) {
            res.status(429).json({ error: "Too many login attempts. Try again later." });
            return;
        }
        const record = username ? await readCampaignUserByUsername(db, username) : null;
        if (!record || !verifyPassword(password, record.passwordHash)) {
            res.status(401).json({ error: "Invalid username or password." });
            return;
        }
        setCampaignAuthCookie(res, record.user);
        res.json(record.user);
    });
};
