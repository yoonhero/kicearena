import { describe, expect, it } from "vitest";
import { KeyedMutex } from "./keyedMutex.js";

const defer = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

const waitForScheduledTasks = () => new Promise((resolve) => setImmediate(resolve));

describe("KeyedMutex", () => {
    it("serializes tasks for the same key", async () => {
        const mutex = new KeyedMutex();
        const firstGate = defer();
        const order: string[] = [];

        const first = mutex.run("room", async () => {
            order.push("first:start");
            await firstGate.promise;
            order.push("first:end");
        });
        const second = mutex.run("room", async () => {
            order.push("second:start");
        });

        await waitForScheduledTasks();
        expect(order).toEqual(["first:start"]);

        firstGate.resolve();
        await Promise.all([first, second]);
        expect(order).toEqual(["first:start", "first:end", "second:start"]);
    });

    it("allows different keys to run concurrently", async () => {
        const mutex = new KeyedMutex();
        const firstGate = defer();
        const order: string[] = [];

        const first = mutex.run("room-a", async () => {
            order.push("a:start");
            await firstGate.promise;
            order.push("a:end");
        });
        const second = mutex.run("room-b", async () => {
            order.push("b:start");
        });

        await second;
        expect(order).toEqual(["a:start", "b:start"]);

        firstGate.resolve();
        await first;
        expect(order).toEqual(["a:start", "b:start", "a:end"]);
    });
});
