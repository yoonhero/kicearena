import crypto from "node:crypto";
import type express from "express";

export const createAccessChecks = ({
    metricsBearerToken,
    adminToken,
}: {
    metricsBearerToken: string;
    adminToken: string;
}) => {
    const hasValidMetricsBearerToken = (authorization: string | undefined) => {
        if (!metricsBearerToken || !authorization?.startsWith("Bearer ")) return false;
        const suppliedToken = authorization.slice("Bearer ".length).trim();
        const expected = Buffer.from(metricsBearerToken);
        const supplied = Buffer.from(suppliedToken);
        return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
    };

    const hasAdminAccess = (req: express.Request) => {
        return Boolean(adminToken && req.get("x-admin-token")?.trim() === adminToken);
    };

    return { hasAdminAccess, hasValidMetricsBearerToken };
};
