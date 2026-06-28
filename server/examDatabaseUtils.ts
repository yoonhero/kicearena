import { Pool } from "pg";

export const toReleaseAt = (value: Date | string | null) => {
    if (value === null) return undefined;
    if (value instanceof Date) return value.toISOString();
    return value;
};

export const optionalJson = <T>(value: T | null) => value ?? undefined;

export const jsonParam = (value: unknown) =>
    value === undefined || value === null ? null : JSON.stringify(value);

export const createExamCatalogPool = (connectionString: string) =>
    new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
