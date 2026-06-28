import type express from "express";
import { readCampaignStats } from "./campaignStatsDatabase.js";
import {
    deleteReferralWhitelistEntry,
    readReferralWhitelist,
    upsertReferralWhitelistEntry,
} from "./campaignWhitelistDatabase.js";
import type { ExamCatalogDatabase } from "./examDatabase.js";
import { readString } from "./requestUtils.js";

export const registerAdminCampaignRoutes = ({
    app,
    getDb,
    hasAdminAccess,
    adminToken,
}: {
    app: express.Express;
    getDb: () => ExamCatalogDatabase | null;
    hasAdminAccess: (req: express.Request) => boolean;
    adminToken: string;
}) => {
    app.get("/api/admin/campaign/stats", async (req, res) => {
        if (!hasAdminAccess(req)) {
            res.sendStatus(adminToken ? 401 : 403);
            return;
        }
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        res.json(await readCampaignStats(db));
    });

    app.get("/api/admin/campaign/referral-whitelist", async (req, res) => {
        if (!hasAdminAccess(req)) {
            res.sendStatus(adminToken ? 401 : 403);
            return;
        }
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }
        res.json(await readReferralWhitelist(db));
    });

    app.put("/api/admin/campaign/referral-whitelist/:referralCode", async (req, res) => {
        if (!hasAdminAccess(req)) {
            res.sendStatus(adminToken ? 401 : 403);
            return;
        }
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }

        const referralCode = readString(req.params.referralCode, 32).toLowerCase();
        const schoolId = readString(req.body?.schoolId, 80);
        const note = readString(req.body?.note, 160) || "admin";
        if (!/^[2-9a-z]{4,32}$/.test(referralCode) || !schoolId) {
            res.status(400).json({ error: "Invalid referral whitelist payload." });
            return;
        }

        const entry = await upsertReferralWhitelistEntry(db, {
            referralCode,
            schoolId,
            note,
        });
        if (!entry) {
            res.status(404).json({ error: "School not found." });
            return;
        }
        res.json(entry);
    });

    app.delete("/api/admin/campaign/referral-whitelist/:referralCode", async (req, res) => {
        if (!hasAdminAccess(req)) {
            res.sendStatus(adminToken ? 401 : 403);
            return;
        }
        const db = getDb();
        if (!db) {
            res.sendStatus(503);
            return;
        }

        const referralCode = readString(req.params.referralCode, 32).toLowerCase();
        if (!/^[2-9a-z]{4,32}$/.test(referralCode)) {
            res.status(400).json({ error: "Invalid referral code." });
            return;
        }

        const deleted = await deleteReferralWhitelistEntry(db, referralCode);
        res.sendStatus(deleted ? 204 : 404);
    });
};
