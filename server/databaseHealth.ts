import type { ExamCatalogDatabase } from "./examDatabase.js";

type DatabaseErrorLike = {
    code?: unknown;
    errno?: unknown;
    syscall?: unknown;
    address?: unknown;
    port?: unknown;
    message?: unknown;
};

export type DatabaseErrorSummary = {
    code?: string;
    errno?: number;
    syscall?: string;
    address?: string;
    port?: number;
    message: string;
};

export type DatabaseHealth =
    | { ok: true }
    | { ok: false; reason: "not_configured" | "query_failed"; error?: DatabaseErrorSummary };

const asErrorLike = (error: unknown): DatabaseErrorLike => {
    if (!error || typeof error !== "object") return { message: String(error) };
    return error as DatabaseErrorLike;
};

const readStringField = (value: unknown) => (typeof value === "string" ? value : undefined);
const readNumberField = (value: unknown) => (typeof value === "number" ? value : undefined);

export const summarizeDatabaseError = (error: unknown): DatabaseErrorSummary => {
    const source = asErrorLike(error);
    const message =
        readStringField(source.message) || (error instanceof Error ? error.message : String(error));
    return {
        code: readStringField(source.code),
        errno: readNumberField(source.errno),
        syscall: readStringField(source.syscall),
        address: readStringField(source.address),
        port: readNumberField(source.port),
        message,
    };
};

export const formatDatabaseErrorSummary = (error: unknown) => {
    const summary = summarizeDatabaseError(error);
    return [
        summary.code,
        summary.syscall,
        summary.address && summary.port ? `${summary.address}:${summary.port}` : summary.address,
        summary.message,
    ]
        .filter(Boolean)
        .join(" ");
};

export const checkDatabaseHealth = async (
    db: ExamCatalogDatabase | null,
): Promise<DatabaseHealth> => {
    if (!db) return { ok: false, reason: "not_configured" };
    try {
        await db.query("SELECT 1");
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: "query_failed", error: summarizeDatabaseError(error) };
    }
};
