import { describe, expect, it } from "vitest";
import {
    checkDatabaseHealth,
    formatDatabaseErrorSummary,
    summarizeDatabaseError,
} from "./databaseHealth.js";
import type { ExamCatalogDatabase } from "./examDatabase.js";

describe("database health", () => {
    it("reports an unconfigured database as unhealthy", async () => {
        await expect(checkDatabaseHealth(null)).resolves.toEqual({
            ok: false,
            reason: "not_configured",
        });
    });

    it("runs a lightweight query for healthy databases", async () => {
        const queries: string[] = [];
        const db = {
            async query(text: string) {
                queries.push(text);
                return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
            },
        } satisfies ExamCatalogDatabase;

        await expect(checkDatabaseHealth(db)).resolves.toEqual({ ok: true });
        expect(queries).toEqual(["SELECT 1"]);
    });

    it("summarizes connection errors without leaking connection strings", async () => {
        const error = Object.assign(new Error("connect ECONNREFUSED 172.20.0.2:5432"), {
            code: "ECONNREFUSED",
            errno: -111,
            syscall: "connect",
            address: "172.20.0.2",
            port: 5432,
        });
        const db = {
            async query() {
                throw error;
            },
        } satisfies ExamCatalogDatabase;

        await expect(checkDatabaseHealth(db)).resolves.toEqual({
            ok: false,
            reason: "query_failed",
            error: summarizeDatabaseError(error),
        });
        expect(formatDatabaseErrorSummary(error)).toContain("ECONNREFUSED");
        expect(formatDatabaseErrorSummary(error)).toContain("172.20.0.2:5432");
    });
});
