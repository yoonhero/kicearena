import { describe, expect, it } from "vitest";
import {
    pruneHttpRateLimitStore,
    shouldRateLimitHttp,
    type HttpRateLimitStore,
} from "./httpRateLimit.js";

describe("HTTP rate limiting", () => {
    it("limits requests by key within a window", () => {
        const store: HttpRateLimitStore = new Map();

        expect(shouldRateLimitHttp(store, "ip:user", 2, 1_000, 1_000)).toBe(false);
        expect(shouldRateLimitHttp(store, "ip:user", 2, 1_000, 1_100)).toBe(false);
        expect(shouldRateLimitHttp(store, "ip:user", 2, 1_000, 1_200)).toBe(true);
        expect(shouldRateLimitHttp(store, "ip:user", 2, 1_000, 2_001)).toBe(false);
    });

    it("prunes expired buckets", () => {
        const store: HttpRateLimitStore = new Map();
        shouldRateLimitHttp(store, "a", 1, 1_000, 1_000);
        shouldRateLimitHttp(store, "b", 1, 1_000, 2_500);

        pruneHttpRateLimitStore(store, 2_001);

        expect(store.has("a")).toBe(false);
        expect(store.has("b")).toBe(true);
    });
});
