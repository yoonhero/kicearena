import crypto from "node:crypto";
import type express from "express";
import { isProblemBody, type ProblemBodyBlock } from "../shared/game.js";
import {
    pruneHttpRateLimitStore,
    shouldRateLimitHttp,
    type HttpRateLimitStore,
} from "./httpRateLimit.js";

export const normalizeRemoteAddress = (address: string | undefined) => {
    if (!address) return "";
    if (address.startsWith("::ffff:")) return address.slice("::ffff:".length);
    return address;
};

export const isPrivateNetworkAddress = (address: string | undefined) => {
    const normalized = normalizeRemoteAddress(address);
    if (normalized === "::1") return true;
    if (
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        normalized.startsWith("fe80:")
    )
        return true;

    const octets = normalized.split(".").map((part) => Number(part));
    if (
        octets.length !== 4 ||
        octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
        return false;
    }

    const [first, second] = octets;
    return (
        first === 10 ||
        first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254)
    );
};

export const readString = (value: unknown, maxLength: number) =>
    typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export const readCookie = (cookieHeader: string | undefined, name: string) => {
    if (!cookieHeader) return "";
    for (const part of cookieHeader.split(";")) {
        const [rawKey, ...rawValue] = part.trim().split("=");
        if (rawKey !== name) continue;
        try {
            return decodeURIComponent(rawValue.join("="));
        } catch {
            return "";
        }
    }
    return "";
};

export const hashPassword = (password: string) => {
    const salt = crypto.randomBytes(16).toString("base64url");
    const key = crypto.scryptSync(password, salt, 64).toString("base64url");
    return `scrypt:${salt}:${key}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
    const [scheme, salt, key] = storedHash.split(":");
    if (scheme !== "scrypt" || !salt || !key) return false;
    const expected = Buffer.from(key, "base64url");
    const supplied = crypto.scryptSync(password, salt, 64);
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};

export const normalizeEmail = (value: unknown) => readString(value, 254).trim().toLowerCase();
export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const createEmailVerificationCode = () =>
    String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
export const hashEmailVerificationCode = (username: string, code: string) =>
    crypto.createHash("sha256").update(`${username}:${code}`).digest("base64url");

export const visitorFingerprint = (req: express.Request) =>
    crypto
        .createHash("sha256")
        .update(
            `${normalizeRemoteAddress(req.socket.remoteAddress)}:${req.get("user-agent") ?? ""}`,
        )
        .digest("base64url");

export const shouldRateLimitHttpRequest = ({
    store,
    req,
    scope,
    identity,
    limit,
    windowMs,
}: {
    store: HttpRateLimitStore;
    req: express.Request;
    scope: string;
    identity: string;
    limit: number;
    windowMs: number;
}) => {
    pruneHttpRateLimitStore(store);
    const address = normalizeRemoteAddress(req.socket.remoteAddress);
    return shouldRateLimitHttp(store, `${scope}:${address}:${identity}`, limit, windowMs);
};

export const sanitizeAssetFileName = (value: string) => {
    const safeName = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 96);
    const withExtension = safeName.endsWith(".svg") ? safeName : `${safeName || "asset"}.svg`;
    return withExtension.replace(/\.{2,}/g, ".");
};

export const makeUploadedSvgPath = (fileName: string) =>
    `diagrams/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${sanitizeAssetFileName(fileName)}`;

export const assetUrlPath = (assetPath: string) =>
    assetPath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");

export const isLikelySafeSvg = (body: Buffer) => {
    const text = body.toString("utf8");
    return (
        /<svg[\s>]/i.test(text) &&
        !/<script[\s>]/i.test(text) &&
        !/\son[a-z]+\s*=/i.test(text) &&
        !/javascript:/i.test(text)
    );
};

export const readOptionalBodyBlocks = (value: unknown): ProblemBodyBlock[] | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return isProblemBody(value) ? value : undefined;
};

export const readOptionalPositiveInteger = (value: unknown): number | null | undefined => {
    if (value === undefined || value === null || value === "") return null;
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 1 ? numeric : undefined;
};

export const readOptionalBbox = (
    value: unknown,
): [number, number, number, number] | null | undefined => {
    if (value === undefined || value === null || value === "") return null;
    if (!Array.isArray(value) || value.length !== 4) return undefined;
    const bbox = value.map(Number);
    if (bbox.some((part) => !Number.isFinite(part)) || bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) {
        return undefined;
    }
    return bbox as [number, number, number, number];
};
