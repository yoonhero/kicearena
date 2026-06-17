import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { apiNotFound, apiNotFoundBody } from "./notFound.js";

describe("API not found middleware", () => {
    it("returns a JSON 404 before the SPA fallback can handle the request", () => {
        const statuses: number[] = [];
        const payloads: unknown[] = [];
        const res = {
            status(code: number) {
                statuses.push(code);
                return this;
            },
            json(payload: unknown) {
                payloads.push(payload);
                return this;
            },
        } as Response;

        apiNotFound({} as Request, res, () => {
            throw new Error("not found handler should terminate the response");
        });

        expect(statuses).toEqual([404]);
        expect(payloads).toEqual([apiNotFoundBody]);
    });
});
