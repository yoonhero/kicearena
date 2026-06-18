import { describe, expect, it } from "vitest";
import { shouldRateLimit, type SocketEventTimestamps } from "./rateLimit.js";

describe("socket rate limiting", () => {
    it("allows the first event and blocks repeats inside the interval", () => {
        const timestamps: SocketEventTimestamps = new Map();

        expect(shouldRateLimit(timestamps, "socket-1", "answer:submit", 500, 1000)).toBe(false);
        expect(shouldRateLimit(timestamps, "socket-1", "answer:submit", 500, 1200)).toBe(true);
        expect(shouldRateLimit(timestamps, "socket-1", "answer:submit", 500, 1700)).toBe(false);
    });

    it("tracks sockets and event names independently", () => {
        const timestamps: SocketEventTimestamps = new Map();

        expect(shouldRateLimit(timestamps, "socket-1", "answer:submit", 500, 1000)).toBe(false);
        expect(shouldRateLimit(timestamps, "socket-2", "answer:submit", 500, 1200)).toBe(false);
        expect(shouldRateLimit(timestamps, "socket-1", "item:use", 500, 1200)).toBe(false);
    });
});
